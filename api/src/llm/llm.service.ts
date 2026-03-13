import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { SearchService, SearchResult } from '../search/search.service';

export interface LlmResponse {
  content: Record<string, any>;
  tokensIn: number;
  tokensOut: number;
  searchCalls: number;
}

const WEB_SEARCH_TOOL: Anthropic.Tool = {
  name: 'web_search',
  description:
    'Search the web for current information. Use this to find real data about markets, companies, products, trends, and news.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Search query — be specific, include company/product names',
      },
      max_results: {
        type: 'number',
        description: 'Number of results (default 5, max 10)',
      },
    },
    required: ['query'],
  },
};

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private client: Anthropic;
  private model: string;

  constructor(private searchService: SearchService) {
    this.client = new Anthropic({
      apiKey: process.env.ANT_API_KEY || 'dummy',
    });
    this.model = process.env.LLM_MODEL || 'claude-sonnet-4-6';
  }

  /**
   * Run LLM completion with optional web_search tool.
   * Implements agentic loop: if model calls web_search, we execute it and feed results back.
   */
  async complete(
    systemPrompt: string,
    userPrompt: string,
    options?: { tools?: boolean; maxLoops?: number },
  ): Promise<LlmResponse> {
    const useTools = options?.tools ?? false;
    const maxLoops = options?.maxLoops ?? 5;
    const tools = useTools ? [WEB_SEARCH_TOOL] : [];

    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let searchCalls = 0;

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: userPrompt },
    ];

    for (let loop = 0; loop < maxLoops; loop++) {
      this.logger.log(`LLM call #${loop + 1} (model=${this.model})`);

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        tools: tools.length > 0 ? tools : undefined,
      });

      totalTokensIn += response.usage.input_tokens;
      totalTokensOut += response.usage.output_tokens;

      // If model stops without tool use — extract JSON from response
      if (response.stop_reason === 'end_turn' || response.stop_reason !== 'tool_use') {
        const textBlock = response.content.find((b) => b.type === 'text');
        const raw = textBlock?.type === 'text' ? textBlock.text : '{}';

        return {
          content: this.parseJson(raw),
          tokensIn: totalTokensIn,
          tokensOut: totalTokensOut,
          searchCalls,
        };
      }

      // Handle tool_use — execute search, feed results back
      const toolBlocks = response.content.filter((b) => b.type === 'tool_use');
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of toolBlocks) {
        if (block.type !== 'tool_use') continue;

        if (block.name === 'web_search') {
          searchCalls++;
          const input = block.input as { query: string; max_results?: number };
          this.logger.log(`Tool call: web_search("${input.query}")`);

          const results = await this.searchService.search(
            input.query,
            input.max_results || 5,
          );

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: this.formatSearchResults(results),
          });
        }
      }

      // Append assistant response + tool results for next loop
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
    }

    // Max loops reached — return last attempt
    this.logger.warn('Max agentic loops reached');
    return {
      content: {},
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      searchCalls,
    };
  }

  /**
   * Simple completion without tools (for critic, scorer).
   */
  async completeSimple(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<LlmResponse> {
    return this.complete(systemPrompt, userPrompt, { tools: false });
  }

  private parseJson(raw: string): Record<string, any> {
    // Try to extract JSON from markdown code blocks or raw text
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch?.[1]?.trim() || raw.trim();

    try {
      return JSON.parse(jsonStr);
    } catch {
      this.logger.warn('Failed to parse LLM JSON output, returning raw');
      return { raw_text: raw };
    }
  }

  private formatSearchResults(results: SearchResult[]): string {
    if (results.length === 0) {
      return 'No search results found. Try a different query.';
    }
    return results
      .map(
        (r, i) =>
          `[${i + 1}] ${r.title}\nURL: ${r.url}\nRelevance: ${r.score}\n${r.content}`,
      )
      .join('\n\n---\n\n');
  }
}
