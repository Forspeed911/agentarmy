import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ResearchService } from '../research/research.service';

interface ScorerJob {
  caseId: string;
}

@Processor('scorer')
export class ScorerProcessor extends WorkerHost {
  private readonly logger = new Logger(ScorerProcessor.name);

  constructor(
    private prisma: PrismaService,
    private researchService: ResearchService,
  ) {
    super();
  }

  async process(job: Job<ScorerJob>) {
    const { caseId } = job.data;
    this.logger.log(`Scoring: case=${caseId}`);

    const run = await this.prisma.agentRun.create({
      data: {
        caseId,
        agentType: 'scorer',
        status: 'started',
      },
    });

    try {
      // TODO: Call LLM to score based on sections + reviews
      // For now, placeholder scores
      const scores = {
        market_need: 3.5,
        competition: 3.0,
        demand_signals: 3.2,
        tech_feasibility: 4.0,
        risk: 3.0,
        differentiation: 3.0,
        monetization: 3.5,
      };

      const weights = {
        market_need: 0.2,
        competition: 0.15,
        demand_signals: 0.15,
        tech_feasibility: 0.15,
        risk: 0.1,
        differentiation: 0.15,
        monetization: 0.1,
      };

      const totalScore = Object.entries(scores).reduce(
        (sum, [key, val]) => sum + val * (weights[key as keyof typeof weights] || 0),
        0,
      );

      const recommendation =
        totalScore >= 4.0 ? 'go' : totalScore >= 3.0 ? 'hold' : 'reject';

      await this.prisma.scoringResult.create({
        data: {
          caseId,
          scores,
          totalScore,
          recommendation,
          reasoning: '[PLACEHOLDER] Scoring reasoning',
          weakSections: [],
          strongSections: [],
        },
      });

      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          durationMs: Date.now() - run.startedAt.getTime(),
        },
      });

      await this.researchService.onScoringDone(caseId);
    } catch (error) {
      this.logger.error(`Scorer failed`, error);
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
