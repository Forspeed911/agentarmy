import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

const SECTION_TYPES = ['market', 'competitor', 'signals', 'tech', 'risk'];

@Injectable()
export class ResearchService {
  constructor(
    private prisma: PrismaService,
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

  // Called by Pipeline Manager when a research section completes
  async onSectionDone(caseId: string, sectionType: string) {
    const sections = await this.prisma.researchSection.findMany({
      where: { caseId },
    });

    const allDone = sections.every((s) => s.status === 'completed');

    if (allDone) {
      await this.prisma.researchCase.update({
        where: { id: caseId },
        data: { status: 'critic_review' },
      });

      await this.criticQueue.add('critic-review', {
        caseId,
        sectionTypes: SECTION_TYPES,
      });
    }
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

    const failedSections: string[] = [];
    for (const [sectionType, review] of latestReviews) {
      if (review.verdict === 'fail') {
        const section = await this.prisma.researchSection.findUnique({
          where: { caseId_sectionType: { caseId, sectionType } },
        });

        if (section && section.iteration < 3) {
          failedSections.push(sectionType);

          await this.researchQueue.add('research-section', {
            projectId: (
              await this.prisma.researchCase.findUnique({
                where: { id: caseId },
              })
            )?.projectId,
            caseId,
            sectionType,
            iteration: section.iteration + 1,
            feedback: review.feedback,
          });
        }
      }
    }

    if (failedSections.length === 0) {
      // All passed — move to scoring
      await this.prisma.researchCase.update({
        where: { id: caseId },
        data: { status: 'scoring' },
      });

      await this.scorerQueue.add('score', { caseId });
    } else {
      // Some sections need retry
      await this.prisma.researchCase.update({
        where: { id: caseId },
        data: { status: 'research_in_progress' },
      });
    }
  }

  // Called when scorer finishes
  async onScoringDone(caseId: string) {
    await this.prisma.researchCase.update({
      where: { id: caseId },
      data: { status: 'report_ready' },
    });
  }
}
