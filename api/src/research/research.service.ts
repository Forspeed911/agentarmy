import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

const SECTION_TYPES = ['market', 'competitor', 'signals', 'tech', 'risk'];

@Injectable()
export class ResearchService {
  private readonly logger = new Logger(ResearchService.name);

  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
    @InjectQueue('research') private researchQueue: Queue,
    @InjectQueue('critic') private criticQueue: Queue,
    @InjectQueue('scorer') private scorerQueue: Queue,
  ) {}

  async startResearch(projectId: string) {
    // Verify project exists
    await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });

    // Create research case
    const researchCase = await this.prisma.researchCase.create({
      data: {
        projectId,
        status: 'research_queued',
      },
    });

    // Create section placeholders
    await this.prisma.researchSection.createMany({
      data: SECTION_TYPES.map((type) => ({
        caseId: researchCase.id,
        sectionType: type,
        content: {},
        status: 'pending',
      })),
    });

    // Fan-out: dispatch 5 parallel research tasks
    await Promise.all(
      SECTION_TYPES.map((sectionType) =>
        this.researchQueue.add('research-section', {
          projectId,
          caseId: researchCase.id,
          sectionType,
          iteration: 1,
          feedback: null,
        }),
      ),
    );

    // Update status
    await this.prisma.researchCase.update({
      where: { id: researchCase.id },
      data: { status: 'research_in_progress' },
    });

    return {
      caseId: researchCase.id,
      status: 'research_queued',
      sections: SECTION_TYPES,
    };
  }

  async getStatus(projectId: string, caseId: string) {
    const researchCase = await this.prisma.researchCase.findUniqueOrThrow({
      where: { id: caseId },
      include: {
        sections: true,
        reviews: true,
      },
    });

    const sections: Record<string, any> = {};
    for (const section of researchCase.sections) {
      const review = researchCase.reviews.find(
        (r) =>
          r.sectionType === section.sectionType &&
          r.iteration === section.iteration,
      );
      sections[section.sectionType] = {
        status: section.status,
        iteration: section.iteration,
        critic: review?.verdict ?? null,
      };
    }

    const completed = researchCase.sections.filter(
      (s) => s.status === 'completed',
    ).length;

    return {
      caseId: researchCase.id,
      status: researchCase.status,
      sections,
      progress: `${completed}/${SECTION_TYPES.length} sections completed`,
    };
  }

  async getReport(projectId: string, caseId: string) {
    const researchCase = await this.prisma.researchCase.findUniqueOrThrow({
      where: { id: caseId },
      include: {
        project: true,
        sections: true,
        reviews: true,
        scoring: true,
      },
    });

    return {
      caseId: researchCase.id,
      project: {
        name: researchCase.project.name,
        url: researchCase.project.url,
      },
      sections: researchCase.sections.map((s) => {
        const review = researchCase.reviews.find(
          (r) =>
            r.sectionType === s.sectionType && r.iteration === s.iteration,
        );
        return {
          sectionType: s.sectionType,
          iteration: s.iteration,
          content: s.content,
          critic: review
            ? {
                evidenceQuality: review.evidenceQuality,
                logicQuality: review.logicQuality,
                completeness: review.completeness,
                verdict: review.verdict,
              }
            : null,
        };
      }),
      scoring: researchCase.scoring
        ? {
            scores: researchCase.scoring.scores,
            totalScore: researchCase.scoring.totalScore,
            recommendation: researchCase.scoring.recommendation,
            reasoning: researchCase.scoring.reasoning,
            weakSections: researchCase.scoring.weakSections,
            strongSections: researchCase.scoring.strongSections,
          }
        : null,
      status: researchCase.status,
    };
  }

  async submitDecision(
    projectId: string,
    caseId: string,
    decision: string,
    comment?: string,
  ) {
    return this.prisma.researchCase.update({
      where: { id: caseId },
      data: {
        status: decision,
        decision,
        decisionComment: comment,
        decidedAt: new Date(),
      },
    });
  }

  // Called by Pipeline Manager when a research section completes (or fails)
  async onSectionDone(caseId: string, sectionType: string) {
    const sections = await this.prisma.researchSection.findMany({
      where: { caseId },
    });

    const allSettled = sections.every(
      (s) => s.status === 'completed' || s.status === 'failed',
    );

    if (!allSettled) return;

    const completedSections = sections.filter(
      (s) => s.status === 'completed',
    );
    const failedSections = sections.filter((s) => s.status === 'failed');

    if (failedSections.length > 0) {
      this.logger.warn(
        `Case ${caseId}: ${failedSections.length} section(s) failed: ${failedSections.map((s) => s.sectionType).join(', ')}`,
      );
    }

    // Always proceed — even partial results are valuable
    await this.prisma.researchCase.update({
      where: { id: caseId },
      data: { status: 'critic_review' },
    });

    await this.criticQueue.add('critic-review', {
      caseId,
      sectionTypes: completedSections.map((s) => s.sectionType),
    });
  }

  // Called by Pipeline Manager when critic finishes
  async onCriticDone(caseId: string) {
    const reviews = await this.prisma.criticReview.findMany({
      where: { caseId },
      orderBy: { iteration: 'desc' },
    });

    // Get latest review per section
    const latestReviews = new Map<string, typeof reviews[0]>();
    for (const r of reviews) {
      if (!latestReviews.has(r.sectionType)) {
        latestReviews.set(r.sectionType, r);
      }
    }

    const retryingSections: string[] = [];
    const researchCase = await this.prisma.researchCase.findUnique({
      where: { id: caseId },
    });

    for (const [sectionType, review] of latestReviews) {
      if (review.verdict === 'fail') {
        const section = await this.prisma.researchSection.findUnique({
          where: { caseId_sectionType: { caseId, sectionType } },
        });

        if (section && section.iteration < 3) {
          retryingSections.push(sectionType);

          this.logger.log(
            `Retrying ${sectionType} iter ${section.iteration + 1} (critic fail)`,
          );

          await this.prisma.researchSection.update({
            where: { caseId_sectionType: { caseId, sectionType } },
            data: { status: 'pending' },
          });

          await this.researchQueue.add('research-section', {
            projectId: researchCase?.projectId,
            caseId,
            sectionType,
            iteration: section.iteration + 1,
            feedback: review.feedback,
          });
        } else {
          // Max iterations reached — accept as-is
          this.logger.warn(
            `${sectionType} failed at max iteration — accepting as-is`,
          );
        }
      }
    }

    if (retryingSections.length === 0) {
      // All passed or max iterations — move to scoring
      await this.prisma.researchCase.update({
        where: { id: caseId },
        data: { status: 'scoring' },
      });

      await this.scorerQueue.add('score', { caseId });
    } else {
      // Some sections retrying
      this.logger.log(`Retrying sections: ${retryingSections.join(', ')}`);
      await this.prisma.researchCase.update({
        where: { id: caseId },
        data: { status: 'research_in_progress' },
      });
    }
  }

  // Retry stalled or failed research sections
  async retryStalled(projectId: string, caseId: string) {
    const researchCase = await this.prisma.researchCase.findUniqueOrThrow({
      where: { id: caseId },
    });

    const sections = await this.prisma.researchSection.findMany({
      where: { caseId },
    });

    const stuckSections = sections.filter(
      (s) => s.status === 'in_progress' || s.status === 'failed',
    );

    if (stuckSections.length === 0) {
      return { message: 'No stuck sections found', status: researchCase.status };
    }

    // Reset stuck sections and re-queue
    for (const section of stuckSections) {
      await this.prisma.researchSection.update({
        where: { caseId_sectionType: { caseId, sectionType: section.sectionType } },
        data: { status: 'pending', startedAt: null, completedAt: null },
      });

      await this.researchQueue.add('research-section', {
        projectId,
        caseId,
        sectionType: section.sectionType,
        iteration: section.iteration,
        feedback: null,
      });
    }

    await this.prisma.researchCase.update({
      where: { id: caseId },
      data: { status: 'research_in_progress' },
    });

    this.logger.log(
      `Retrying ${stuckSections.length} stuck section(s) for case ${caseId}: ${stuckSections.map((s) => s.sectionType).join(', ')}`,
    );

    return {
      retried: stuckSections.map((s) => s.sectionType),
      status: 'research_in_progress',
    };
  }

  // Force-stop a research: drain all queued jobs for this case, mark as stopped
  async stopResearch(projectId: string, caseId: string) {
    const researchCase = await this.prisma.researchCase.findUniqueOrThrow({
      where: { id: caseId },
    });

    // Remove pending jobs from all queues for this case
    for (const queue of [this.researchQueue, this.criticQueue, this.scorerQueue]) {
      const jobs = await queue.getJobs(['waiting', 'delayed', 'active']);
      for (const job of jobs) {
        if (job.data?.caseId === caseId) {
          try {
            await job.remove();
            this.logger.log(`Removed job ${job.id} from ${queue.name}`);
          } catch {
            // Active jobs can't always be removed — that's ok
          }
        }
      }
    }

    // Mark all in-progress/pending sections as stopped
    await this.prisma.researchSection.updateMany({
      where: {
        caseId,
        status: { in: ['pending', 'in_progress'] },
      },
      data: { status: 'failed', completedAt: new Date() },
    });

    await this.prisma.researchCase.update({
      where: { id: caseId },
      data: { status: 'stopped' },
    });

    this.logger.log(`Research ${caseId} force-stopped`);

    return { caseId, status: 'stopped' };
  }

  // Restart a research from scratch: stop current, reset all sections, re-queue
  async restartResearch(projectId: string, caseId: string) {
    // Stop first if still running
    const researchCase = await this.prisma.researchCase.findUniqueOrThrow({
      where: { id: caseId },
    });

    const activeStatuses = [
      'research_queued', 'research_in_progress', 'critic_review', 'scoring',
    ];
    if (activeStatuses.includes(researchCase.status)) {
      await this.stopResearch(projectId, caseId);
    }

    // Delete old reviews and scoring
    await this.prisma.criticReview.deleteMany({ where: { caseId } });
    await this.prisma.scoringResult.deleteMany({ where: { caseId } });

    // Reset all sections to pending, iteration 1
    await this.prisma.researchSection.updateMany({
      where: { caseId },
      data: {
        status: 'pending',
        iteration: 1,
        content: {},
        sourcesCount: 0,
        startedAt: null,
        completedAt: null,
      },
    });

    // Re-queue all sections
    await Promise.all(
      SECTION_TYPES.map((sectionType) =>
        this.researchQueue.add('research-section', {
          projectId,
          caseId,
          sectionType,
          iteration: 1,
          feedback: null,
        }),
      ),
    );

    await this.prisma.researchCase.update({
      where: { id: caseId },
      data: {
        status: 'research_in_progress',
        decision: null,
        decisionComment: null,
        decidedAt: null,
      },
    });

    this.logger.log(`Research ${caseId} restarted from scratch`);

    return {
      caseId,
      status: 'research_in_progress',
      sections: SECTION_TYPES,
    };
  }

  // Called when scorer finishes
  async onScoringDone(caseId: string) {
    await this.prisma.researchCase.update({
      where: { id: caseId },
      data: { status: 'report_ready' },
    });

    const researchCase = await this.prisma.researchCase.findUnique({
      where: { id: caseId },
      include: { project: true, scoring: true },
    });

    if (researchCase?.scoring) {
      this.telegram.notifyResearchDone({
        projectName: researchCase.project.name,
        projectUrl: researchCase.project.url ?? undefined,
        caseId,
        totalScore: Number(researchCase.scoring.totalScore),
        recommendation: researchCase.scoring.recommendation,
        strongSections: researchCase.scoring.strongSections as string[],
        weakSections: researchCase.scoring.weakSections as string[],
        reasoning: researchCase.scoring.reasoning ?? '',
      });
    }
  }
}
