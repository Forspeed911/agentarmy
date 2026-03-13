import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ResearchService } from '../research/research.service';
import { LlmService } from '../llm/llm.service';
import { buildScorerSystemPrompt, buildScorerUserPrompt } from '../llm/prompts/scorer';

interface ScorerJob {
  caseId: string;
}

const WEIGHTS: Record<string, number> = {
  market_need: 0.2,
  competition: 0.15,
  demand_signals: 0.15,
  tech_feasibility: 0.15,
  risk: 0.1,
  differentiation: 0.15,
  monetization: 0.1,
};

@Processor('scorer')
export class ScorerProcessor extends WorkerHost {
  private readonly logger = new Logger(ScorerProcessor.name);

  constructor(
    private prisma: PrismaService,
    private researchService: ResearchService,
    private llm: LlmService,
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
      const researchCase = await this.prisma.researchCase.findUniqueOrThrow({
        where: { id: caseId },
        include: { project: true },
      });

      const sections = await this.prisma.researchSection.findMany({
        where: { caseId },
      });

      const reviews = await this.prisma.criticReview.findMany({
        where: { caseId },
        orderBy: { iteration: 'desc' },
      });

      // Deduplicate reviews — latest per section
      const latestReviews = new Map<string, typeof reviews[0]>();
      for (const r of reviews) {
        if (!latestReviews.has(r.sectionType)) {
          latestReviews.set(r.sectionType, r);
        }
      }

      // Call LLM (no tools)
      const systemPrompt = buildScorerSystemPrompt();
      const userPrompt = buildScorerUserPrompt(
        researchCase.project.name,
        sections.map((s) => ({ sectionType: s.sectionType, content: s.content })),
        [...latestReviews.values()].map((r) => ({
          sectionType: r.sectionType,
          evidenceQuality: r.evidenceQuality,
          logicQuality: r.logicQuality,
          completeness: r.completeness,
          verdict: r.verdict,
        })),
      );

      const llmResult = await this.llm.completeSimple(systemPrompt, userPrompt);

      const scores = llmResult.content.scores || {};
      const totalScore = Object.entries(scores).reduce(
        (sum, [key, val]) => sum + (Number(val) || 0) * (WEIGHTS[key] || 0),
        0,
      );

      const recommendation =
        totalScore >= 4.0 ? 'go' : totalScore >= 3.0 ? 'hold' : 'reject';

      await this.prisma.scoringResult.create({
        data: {
          caseId,
          scores,
          totalScore: Math.round(totalScore * 100) / 100,
          recommendation,
          reasoning: llmResult.content.reasoning || '',
          weakSections: llmResult.content.weak_sections || [],
          strongSections: llmResult.content.strong_sections || [],
        },
      });

      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          durationMs: Date.now() - run.startedAt.getTime(),
          tokensIn: llmResult.tokensIn,
          tokensOut: llmResult.tokensOut,
        },
      });

      this.logger.log(
        `Scoring done: total=${totalScore.toFixed(2)} → ${recommendation} | ${llmResult.tokensIn}+${llmResult.tokensOut} tokens`,
      );

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
