import { Injectable, Logger } from '@nestjs/common';
import { tavily } from '@tavily/core';

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private client: ReturnType<typeof tavily>;

  constructor() {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      this.logger.warn('TAVILY_API_KEY not set — web search disabled');
    }
    this.client = tavily({ apiKey: apiKey || 'dummy' });
  }

  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    if (!process.env.TAVILY_API_KEY) {
      this.logger.warn(`Search skipped (no API key): "${query}"`);
      return [];
    }

    try {
      this.logger.log(`Searching: "${query}" (max ${maxResults})`);
      const response = await this.client.search(query, {
        maxResults,
        searchDepth: 'advanced',
        includeAnswer: false,
      });

      const results = response.results.map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score,
      }));

      this.logger.log(`Found ${results.length} results for "${query}"`);
      return results;
    } catch (error) {
      this.logger.error(`Search failed: "${query}"`, error);
      return [];
    }
  }
}
