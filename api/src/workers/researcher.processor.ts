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

@Processor('research')
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

      const content = llmResult.content;
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
          model: process.env.LLM_MODEL || 'claude-sonnet-4-6',
          tokensIn: llmResult.tokensIn,
          tokensOut: llmResult.tokensOut,
        },
      });

      this.logger.log(
        `Research done: ${sectionType} | ${llmResult.tokensIn}+${llmResult.tokensOut} tokens | ${llmResult.searchCalls} searches`,
      );

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
      throw error;
    }
  }
}
