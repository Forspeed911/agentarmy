import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string | undefined;
  private readonly chatId: string | undefined;
  private readonly apiUrl: string;

  constructor(private config: ConfigService) {
    this.botToken = this.config.get<string>('TG_BOT_TOKEN');
    this.chatId = this.config.get<string>('ADMIN_ID');
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;

    if (!this.botToken || !this.chatId) {
      this.logger.warn(
        'TG_BOT_TOKEN or ADMIN_ID not set — Telegram notifications disabled',
      );
    }
  }

  private get enabled(): boolean {
    return !!this.botToken && !!this.chatId;
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.enabled) return;

    try {
      const res = await fetch(`${this.apiUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`Telegram API error: ${res.status} ${body}`);
      }
    } catch (err) {
      this.logger.error(`Telegram send failed: ${err.message}`);
    }
  }

  async notifyResearchDone(data: {
    projectName: string;
    projectUrl?: string;
    caseId: string;
    totalScore: number | string;
    recommendation: string;
    strongSections: string[];
    weakSections: string[];
    reasoning: string;
    cost?: { totalTokens: number; totalCostUsd: number; llmCalls: number };
  }): Promise<void> {
    const emoji =
      data.recommendation === 'go'
        ? '🟢'
        : data.recommendation === 'hold'
          ? '🟡'
          : '🔴';

    const lines = [
      `${emoji} <b>Ресёрч завершён: ${data.projectName}</b>`,
      '',
      `Скор: <b>${data.totalScore}/5</b> — ${data.recommendation.toUpperCase()}`,
    ];

    if (data.strongSections?.length) {
      lines.push(`[+] Сильные: ${data.strongSections.join(', ')}`);
    }
    if (data.weakSections?.length) {
      lines.push(`[-] Слабые: ${data.weakSections.join(', ')}`);
    }

    lines.push('', data.reasoning);

    if (data.cost) {
      lines.push('', `💰 ${data.cost.totalTokens.toLocaleString()} tok · $${data.cost.totalCostUsd.toFixed(4)} · ${data.cost.llmCalls} calls`);
    }

    if (data.projectUrl) {
      lines.push('', `URL: ${data.projectUrl}`);
    }

    await this.sendMessage(lines.join('\n'));
  }

  async notifyResearchFailed(data: {
    projectName: string;
    caseId: string;
    failedSections: string[];
    completedCount: number;
    totalCount: number;
  }): Promise<void> {
    const lines = [
      `🔴 <b>Ресёрч провален: ${data.projectName}</b>`,
      '',
      `Завершено ${data.completedCount}/${data.totalCount} секций (минимум 3)`,
      `Провалены: ${data.failedSections.join(', ')}`,
    ];

    await this.sendMessage(lines.join('\n'));
  }
}
