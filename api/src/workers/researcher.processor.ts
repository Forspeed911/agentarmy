import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ResearchService } from '../research/research.service';
import { LlmService } from '../llm/llm.service';
import {
  buildResearcherSystemPrompt,
  buildResearcherUserPrompt,
} from '../llm/prompts/researcher';

interface ResearchJob {
  projectId: string;
  caseId: string;
  sectionType: string;
  iteration: number;
  feedback: string | null;
}

@Processor('research', {
  lockDuration: 300_000, // 5 min — research can take a while
  stalledInterval: 120_000, // check for stalled jobs every 2 min
})
export class ResearcherProcessor extends WorkerHost {
  private readonly logger = new Logger(ResearcherProcessor.name);

  constructor(
    private prisma: PrismaService,
    private researchService: ResearchService,
    private llm: LlmService,
  ) {
    super();
  }

  async process(job: Job<ResearchJob>) {
    const { projectId, caseId, sectionType, iteration, feedback } = job.data;
    this.logger.log(
      `Research: ${sectionType} iter=${iteration} case=${caseId}`,
    );

    const startedAt = new Date();

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
      await this.prisma.researchSection.update({
        where: { caseId_sectionType: { caseId, sectionType } },
        data: { status: 'in_progress', iteration, startedAt },
      });

      const project = await this.prisma.project.findUniqueOrThrow({
        where: { id: projectId },
      });

      // Call LLM with web_search tool
      const systemPrompt = buildResearcherSystemPrompt(sectionType);
      const userPrompt = buildResearcherUserPrompt(
        project.name,
        project.url,
        project.source,
        sectionType,
        iteration,
        feedback,
      );

      const llmResult = await this.llm.complete(systemPrompt, userPrompt, {
        tools: true,
        maxLoops: 8,
      });

      const content = this.normalizeContent(llmResult.content);
      const sourcesCount = Array.isArray(content.findings)
        ? content.findings.filter((f: any) => f.source_url).length
        : 0;

      // Write result to DB (ADR-005)
      await this.prisma.researchSection.update({
        where: { caseId_sectionType: { caseId, sectionType } },
        data: {
          content,
          sourcesCount,
          status: 'completed',
          completedAt: new Date(),
          iteration,
        },
      });

      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          durationMs: Date.now() - startedAt.getTime(),
          llmModel: process.env.LLM_MODEL || 'claude-sonnet-4-6',
          inputTokens: llmResult.tokensIn,
          outputTokens: llmResult.tokensOut,
        },
      });

      this.logger.log(
        `Research done: ${sectionType} | ${llmResult.tokensIn}+${llmResult.tokensOut} tokens | ${llmResult.searchCalls} searches`,
      );

      await this.researchService.onSectionDone(caseId, sectionType);
    } catch (error: any) {
      this.logger.error(`Research failed: ${sectionType}`, error);

      // Mark section as failed so pipeline can continue
      await this.prisma.researchSection.update({
        where: { caseId_sectionType: { caseId, sectionType } },
        data: { status: 'failed', completedAt: new Date() },
      });

      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          completedAt: new Date(),
        },
      });

      // Notify pipeline even on failure — don't block other sections
      await this.researchService.onSectionDone(caseId, sectionType);

      throw error;
    }
  }

  /** Normalize LLM content to always have a findings array */
  private normalizeContent(
    content: Record<string, any>,
  ): Record<string, any> {
    if (Array.isArray(content.findings)) return content;

    // LLM sometimes uses alternative keys instead of "findings"
    for (const key of ['items', 'results', 'risks', 'analysis', 'data']) {
      if (Array.isArray(content[key])) {
        const { [key]: arr, ...rest } = content;
        return { ...rest, findings: arr };
      }
    }

    // Find the first array of objects
    for (const [key, val] of Object.entries(content)) {
      if (
        key !== 'risks' &&
        key !== 'opportunities' &&
        Array.isArray(val) &&
        val.length > 0 &&
        typeof val[0] === 'object'
      ) {
        const { [key]: arr, ...rest } = content;
        return { ...rest, findings: arr };
      }
    }

    return content;
  }
}
