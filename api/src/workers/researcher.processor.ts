import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ResearchService } from '../research/research.service';

interface ResearchJob {
  projectId: string;
  caseId: string;
  sectionType: string;
  iteration: number;
  feedback: string | null;
}

@Processor('research')
export class ResearcherProcessor extends WorkerHost {
  private readonly logger = new Logger(ResearcherProcessor.name);

  constructor(
    private prisma: PrismaService,
    private researchService: ResearchService,
  ) {
    super();
  }

  async process(job: Job<ResearchJob>) {
    const { projectId, caseId, sectionType, iteration, feedback } = job.data;
    this.logger.log(
      `Research: ${sectionType} iter=${iteration} case=${caseId}`,
    );

    const startedAt = new Date();

    // Log agent run
    const run = await this.prisma.agentRun.create({
      data: {
        caseId,
        agentType: 'researcher',
        sectionType,
        iteration,
        status: 'started',
        startedAt,
      },
    });

    try {
      // Update section status
      await this.prisma.researchSection.update({
        where: { caseId_sectionType: { caseId, sectionType } },
        data: { status: 'in_progress', iteration, startedAt },
      });

      // Load project info
      const project = await this.prisma.project.findUniqueOrThrow({
        where: { id: projectId },
      });

      // TODO: Call LLM with section-specific prompt
      // For now, placeholder content
      const content = {
        summary: `[PLACEHOLDER] Research for ${sectionType} of ${project.name}`,
        findings: [],
        risks: [],
        opportunities: [],
      };

      // Write result to DB (worker writes directly — ADR-005)
      await this.prisma.researchSection.update({
        where: { caseId_sectionType: { caseId, sectionType } },
        data: {
          content,
          sourcesCount: 0,
          status: 'completed',
          completedAt: new Date(),
          iteration,
        },
      });

      // Log completion
      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          durationMs: Date.now() - startedAt.getTime(),
        },
      });

      // Notify Pipeline Manager
      await this.researchService.onSectionDone(caseId, sectionType);
    } catch (error) {
      this.logger.error(`Research failed: ${sectionType}`, error);
      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          completedAt: new Date(),
        },
      });
      throw error; // BullMQ will retry
    }
  }
}
