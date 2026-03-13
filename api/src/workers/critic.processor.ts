import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ResearchService } from '../research/research.service';

interface CriticJob {
  caseId: string;
  sectionTypes: string[];
}

@Processor('critic')
export class CriticProcessor extends WorkerHost {
  private readonly logger = new Logger(CriticProcessor.name);

  constructor(
    private prisma: PrismaService,
    private researchService: ResearchService,
  ) {
    super();
  }

  async process(job: Job<CriticJob>) {
    const { caseId, sectionTypes } = job.data;
    this.logger.log(`Critic review: case=${caseId}`);

    const run = await this.prisma.agentRun.create({
      data: {
        caseId,
        agentType: 'critic',
        status: 'started',
      },
    });

    try {
      const sections = await this.prisma.researchSection.findMany({
        where: { caseId },
      });

      // TODO: Call LLM to evaluate sections
      // For now, pass all sections
      for (const section of sections) {
        await this.prisma.criticReview.create({
          data: {
            caseId,
            sectionType: section.sectionType,
            iteration: section.iteration,
            evidenceQuality: 4,
            logicQuality: 4,
            completeness: 3,
            verdict: 'pass',
            feedback: null,
          },
        });
      }

      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          durationMs: Date.now() - run.startedAt.getTime(),
        },
      });

      // Notify Pipeline Manager
      await this.researchService.onCriticDone(caseId);
    } catch (error) {
      this.logger.error(`Critic failed`, error);
      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }
}
