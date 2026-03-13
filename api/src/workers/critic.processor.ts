import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ResearchService } from '../research/research.service';
import { LlmService } from '../llm/llm.service';
import { buildCriticSystemPrompt, buildCriticUserPrompt } from '../llm/prompts/critic';

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
    private llm: LlmService,
  ) {
    super();
  }

  async process(job: Job<CriticJob>) {
    const { caseId } = job.data;
    this.logger.log(`Critic review: case=${caseId}`);

    const run = await this.prisma.agentRun.create({
      data: {
        caseId,
        agentType: 'critic',
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

      // Call LLM (no tools — critic works on existing text)
      const systemPrompt = buildCriticSystemPrompt();
      const userPrompt = buildCriticUserPrompt(
        researchCase.project.name,
        sections.map((s) => ({
          sectionType: s.sectionType,
          content: s.content,
          iteration: s.iteration,
        })),
      );

      const llmResult = await this.llm.completeSimple(systemPrompt, userPrompt);

      // Parse reviews array
      const reviews = Array.isArray(llmResult.content)
        ? llmResult.content
        : [llmResult.content];

      for (const review of reviews) {
        const section = sections.find(
          (s) => s.sectionType === review.section_type,
        );
        if (!section) continue;

        await this.prisma.criticReview.create({
          data: {
            caseId,
            sectionType: review.section_type,
            iteration: section.iteration,
            evidenceQuality: review.evidence_quality ?? 3,
            logicQuality: review.logic_quality ?? 3,
            completeness: review.completeness ?? 3,
            verdict: section.iteration >= 3 && review.verdict === 'fail'
              ? 'pass_with_warning'
              : review.verdict ?? 'pass',
            feedback: review.feedback ?? null,
          },
        });
      }

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
        `Critic done: ${reviews.length} reviews | ${llmResult.tokensIn}+${llmResult.tokensOut} tokens`,
      );

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
