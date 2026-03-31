import { Injectable, Logger } from '@nestjs/common';
import { tavily } from '@tavily/core';
import * as dds from 'duck-duck-scrape';

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

type SearchProvider = 'tavily' | 'duckduckgo';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private tavilyClient: ReturnType<typeof tavily> | null = null;
  private tavilyAvailable = true;
  private tavilyUnavailableSince: number | null = null;

  /** Re-check Tavily availability after this period (ms) */
  private readonly TAVILY_COOLDOWN_MS = 5 * 60 * 1000; // 5 min

  constructor() {
    const apiKey = process.env.TAVILY_API_KEY;
    if (apiKey) {
      this.tavilyClient = tavily({ apiKey });
      this.logger.log('Tavily configured as primary search provider');
    } else {
      this.tavilyAvailable = false;
      this.logger.warn('TAVILY_API_KEY not set — using DuckDuckGo only');
    }
    this.logger.log('DuckDuckGo configured as fallback search provider');
  }

  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    // Try Tavily first if available
    if (this.isTavilyReady()) {
      const results = await this.searchTavily(query, maxResults);
      if (results !== null) {
        return results;
      }
      // Tavily failed — fall through to DuckDuckGo
    }

    return this.searchDuckDuckGo(query, maxResults);
  }

  private isTavilyReady(): boolean {
    if (!this.tavilyClient) return false;
    if (this.tavilyAvailable) return true;

    // Check if cooldown expired → retry Tavily
    if (
      this.tavilyUnavailableSince &&
      Date.now() - this.tavilyUnavailableSince > this.TAVILY_COOLDOWN_MS
    ) {
      this.logger.log('Tavily cooldown expired, retrying...');
      this.tavilyAvailable = true;
      this.tavilyUnavailableSince = null;
      return true;
    }

    return false;
  }

  private markTavilyUnavailable(reason: string): void {
    this.tavilyAvailable = false;
    this.tavilyUnavailableSince = Date.now();
    this.logger.warn(
      `Tavily marked unavailable: ${reason}. Will retry in ${this.TAVILY_COOLDOWN_MS / 1000}s`,
    );
  }

  /**
   * Returns results on success, null if Tavily is unavailable/rate-limited
   */
  private async searchTavily(
    query: string,
    maxResults: number,
  ): Promise<SearchResult[] | null> {
    try {
      this.logger.log(`[tavily] Searching: "${query}" (max ${maxResults})`);
      const response = await this.tavilyClient!.search(query, {
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

      this.logger.log(`[tavily] Found ${results.length} results for "${query}"`);
      return results;
    } catch (error: any) {
      const status = error?.status || error?.response?.status;
      const message = error?.message || String(error);

      if (status === 429 || message.includes('rate') || message.includes('limit')) {
        this.markTavilyUnavailable(`Rate limited (${status || message})`);
        return null; // signal fallback
      }

      if (status === 401 || status === 403) {
        this.markTavilyUnavailable(`Auth error (${status})`);
        return null;
      }

      this.logger.error(`[tavily] Search failed: "${query}" — ${message}`);
      return null; // any error → try fallback
    }
  }

  private async searchDuckDuckGo(
    query: string,
    maxResults: number,
  ): Promise<SearchResult[]> {
    try {
      this.logger.log(`[duckduckgo] Searching: "${query}" (max ${maxResults})`);
      const response = await dds.search(query, {
        safeSearch: dds.SafeSearchType.MODERATE,
      });

      const results = (response.results || [])
        .slice(0, maxResults)
        .map((r, i) => ({
          title: r.title || '',
          url: r.url || '',
          content: r.description || '',
          score: 1 - i * (0.8 / Math.max(maxResults - 1, 1)), // synthetic score 1.0 → 0.2
        }));

      this.logger.log(
        `[duckduckgo] Found ${results.length} results for "${query}"`,
      );
      return results;
    } catch (error: any) {
      this.logger.error(
        `[duckduckgo] Search failed: "${query}" — ${error?.message || error}`,
      );
      return [];
    }
  }

  /** Returns current provider status for health checks */
  getProviderStatus(): {
    primary: { provider: SearchProvider; available: boolean };
    fallback: { provider: SearchProvider; available: boolean };
  } {
    return {
      primary: {
        provider: 'tavily',
        available: this.isTavilyReady(),
      },
      fallback: {
        provider: 'duckduckgo',
        available: true,
      },
    };
  }
}
