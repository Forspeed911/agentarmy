import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { SearchService, SearchResult } from '../search/search.service';

export interface LlmResponse {
  content: Record<string, any>;
  tokensIn: number;
  tokensOut: number;
  searchCalls: number;
}

const WEB_SEARCH_TOOL: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'web_search',
    description:
      'Search the web for current information. Use this to find real data about markets, companies, products, trends, and news.',
    parameters: {
      type: 'object',
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
  },
};

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private client: OpenAI;
  private model: string;

  constructor(private searchService: SearchService) {
    this.client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY || 'dummy',
      baseURL: 'https://openrouter.ai/api/v1',
      timeout: 120_000,
      defaultHeaders: {
        'HTTP-Referer': 'https://army-of-agents.vercel.app',
        'X-Title': 'Army of Agents',
      },
    });
    this.model = process.env.LLM_MODEL || 'openai/gpt-4.1-mini';
  }

  /**
   * Run LLM completion with optional web_search tool.
   * Implements agentic loop: if model calls web_search, we execute it and feed results back.
   */
  async complete(
    systemPrompt: string,
    userPrompt: string,
    options?: { tools?: boolean; maxLoops?: number; model?: string },
  ): Promise<LlmResponse> {
    const useTools = options?.tools ?? false;
    const maxLoops = options?.maxLoops ?? 5;
    const activeModel = options?.model || this.model;
    const tools = useTools ? [WEB_SEARCH_TOOL] : undefined;

    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let searchCalls = 0;

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    for (let loop = 0; loop < maxLoops; loop++) {
      this.logger.log(`LLM call #${loop + 1} (model=${activeModel})`);

      const response = await this.client.chat.completions.create({
        model: activeModel,
        max_tokens: 4096,
        messages,
        tools,
      });

      const choice = response.choices[0];
      const usage = response.usage;

      totalTokensIn += usage?.prompt_tokens ?? 0;
      totalTokensOut += usage?.completion_tokens ?? 0;

      // If model finishes without tool calls — extract JSON from response
      if (choice.finish_reason !== 'tool_calls') {
        const raw = choice.message?.content || '{}';

        return {
          content: this.parseJson(raw),
          tokensIn: totalTokensIn,
          tokensOut: totalTokensOut,
          searchCalls,
        };
      }

      // Handle tool calls — execute search, feed results back
      const toolCalls = choice.message?.tool_calls || [];

      // Add assistant message with tool calls to history
      messages.push(choice.message);

      for (const toolCall of toolCalls) {
        if (toolCall.type !== 'function') continue;
        if (toolCall.function.name === 'web_search') {
          searchCalls++;
          const input = JSON.parse(toolCall.function.arguments);
          this.logger.log(`Tool call: web_search("${input.query}")`);

          const results = await this.searchService.search(
            input.query,
            input.max_results || 5,
          );

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: this.formatSearchResults(results),
          });
        } else {
          // Unknown tool — return empty result
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: 'Unknown tool',
          });
        }
      }
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
    options?: { model?: string },
  ): Promise<LlmResponse> {
    return this.complete(systemPrompt, userPrompt, { tools: false, model: options?.model });
  }

  private parseJson(raw: string): Record<string, any> {
    // Strategy 1: extract from markdown code block
    const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch {}
    }

    // Strategy 2: find the outermost { ... } JSON object
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const candidate = raw.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(candidate);
      } catch {}
    }

    // Strategy 3: try parsing the whole string
    try {
      return JSON.parse(raw.trim());
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
