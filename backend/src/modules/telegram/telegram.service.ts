import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { exec as execChild } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const exec = promisify(execChild);

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== SETTINGS ====================

  async getSettings() {
    const settings = await this.prisma.telegramBackupSettings.findFirst();
    if (!settings) return { success: true, settings: null };
    // Mask bot token
    return {
      success: true,
      settings: {
        ...settings,
        botToken: settings.botToken ? `${settings.botToken.slice(0, 8)}...${settings.botToken.slice(-4)}` : null,
      },
    };
  }

  async updateSettings(body: {
    enabled?: boolean; botToken?: string; chatId?: string;
    backupTopicId?: string; healthTopicId?: string;
    schedule?: string; scheduleTime?: string; keepLastN?: number;
  }) {
    const existing = await this.prisma.telegramBackupSettings.findFirst();
    if (existing) {
      const updateData: Record<string, unknown> = {};
      if (body.enabled !== undefined) updateData.enabled = body.enabled;
      if (body.botToken !== undefined) updateData.botToken = body.botToken;
      if (body.chatId !== undefined) updateData.chatId = body.chatId;
      if (body.backupTopicId !== undefined) updateData.backupTopicId = body.backupTopicId;
      if (body.healthTopicId !== undefined) updateData.healthTopicId = body.healthTopicId;
      if (body.schedule !== undefined) updateData.schedule = body.schedule;
      if (body.scheduleTime !== undefined) updateData.scheduleTime = body.scheduleTime;
      if (body.keepLastN !== undefined) updateData.keepLastN = body.keepLastN;
      const updated = await this.prisma.telegramBackupSettings.update({ where: { id: existing.id }, data: updateData });
      return { success: true, settings: updated };
    }
    const created = await this.prisma.telegramBackupSettings.create({ data: body as never });
    return { success: true, settings: created };
  }

  // ==================== TEST ====================

  async testConnection(body: { botToken: string; chatId: string; backupTopicId?: string; healthTopicId?: string }) {
    const results: any[] = [];

    // Test general chat
    try {
      const r = await this.sendTelegramMessage(body.botToken, body.chatId, '🧪 Test connection from SalfaNet RADIUS');
      results.push({ target: 'general', success: true, response: r });
    } catch (err: any) {
      results.push({ target: 'general', success: false, error: err.message });
    }

    // Test backup topic
    if (body.backupTopicId) {
      try {
        const r = await this.sendTelegramMessage(body.botToken, body.chatId, '🧪 Test backup topic', body.backupTopicId);
        results.push({ target: 'backup', success: true, response: r });
      } catch (err: any) {
        results.push({ target: 'backup', success: false, error: err.message });
      }
    }

    // Test health topic
    if (body.healthTopicId) {
      try {
        const r = await this.sendTelegramMessage(body.botToken, body.chatId, '🧪 Test health topic', body.healthTopicId);
        results.push({ target: 'health', success: true, response: r });
      } catch (err: any) {
        results.push({ target: 'health', success: false, error: err.message });
      }
    }

    const allSuccess = results.every((r) => r.success);
    return { success: allSuccess, message: allSuccess ? 'All tests passed' : 'Some tests failed', results };
  }

  // ==================== SEND BACKUP ====================

  async sendBackup(backupId: string) {
    const settings = await this.prisma.telegramBackupSettings.findFirst();
    if (!settings || !settings.enabled) throw new HttpException('Telegram backup not enabled', HttpStatus.BAD_REQUEST);

    const backup = await this.prisma.backupHistory.findUnique({ where: { id: backupId } });
    if (!backup) throw new HttpException('Backup not found', HttpStatus.NOT_FOUND);
    if (!backup.filepath) throw new HttpException('Backup file path missing', HttpStatus.BAD_REQUEST);

    try {
      await this.sendTelegramDocument(
        settings.botToken, settings.chatId,
        backup.filepath, backup.filename,
        `📦 Database backup: ${backup.filename}`,
        settings.backupTopicId || undefined,
      );
      return { success: true, message: 'Backup sent to Telegram' };
    } catch (err: any) {
      this.logger.error(`Failed to send backup: ${err.message}`);
      throw new HttpException(`Failed to send: ${err.message}`, HttpStatus.BAD_GATEWAY);
    }
  }

  // ==================== SEND HEALTH ====================

  async sendHealth() {
    const settings = await this.prisma.telegramBackupSettings.findFirst();
    if (!settings || !settings.enabled) throw new HttpException('Telegram backup not enabled', HttpStatus.BAD_REQUEST);

    try {
      const healthReport = await this.generateHealthReport();
      await this.sendTelegramMessage(settings.botToken, settings.chatId, healthReport, settings.healthTopicId || undefined);
      return { success: true, message: 'Health report sent to Telegram' };
    } catch (err: any) {
      throw new HttpException(`Failed to send: ${err.message}`, HttpStatus.BAD_GATEWAY);
    }
  }

  // ==================== TEST BACKUP ====================

  async testBackup() {
    const settings = await this.prisma.telegramBackupSettings.findFirst();
    if (!settings || !settings.enabled) throw new HttpException('Telegram backup not enabled', HttpStatus.BAD_REQUEST);

    // Create a real backup
    const backupDir = path.join(process.cwd(), 'backups');
    await fs.mkdir(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `test-backup-${timestamp}.sql`;
    const filepath = path.join(backupDir, filename);

    const dbUrl = process.env.DATABASE_URL || '';
    try {
      await exec(`mysqldump --opt --single-transaction "${dbUrl}" > "${filepath}"`, { timeout: 300000 });
      const stats = await fs.stat(filepath);

      await this.sendTelegramDocument(
        settings.botToken, settings.chatId,
        filepath, filename,
        `📦 Test backup: ${filename}`,
        settings.backupTopicId || undefined,
      );

      await this.prisma.backupHistory.create({
        data: {
          filename, filepath,
          filesize: stats.size,
          type: 'manual', status: 'success', method: 'telegram',
        },
      });

      return { success: true, message: 'Test backup sent', filename, filesize: stats.size };
    } catch (err: any) {
      await this.prisma.backupHistory.create({
        data: { filename, filepath, filesize: 0, type: 'manual', status: 'failed', method: 'telegram', error: err.message },
      });
      throw new HttpException(`Backup failed: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ==================== HELPERS ====================

  private async sendTelegramMessage(botToken: string, chatId: string, text: string, messageThreadId?: string): Promise<any> {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'HTML' };
    if (messageThreadId) body.message_thread_id = messageThreadId;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!result.ok) throw new Error(result.description || 'Telegram API error');
    return result;
  }

  private async sendTelegramDocument(botToken: string, chatId: string, filepath: string, filename: string, caption?: string, messageThreadId?: string): Promise<any> {
    const url = `https://api.telegram.org/bot${botToken}/sendDocument`;
    const formData = new FormData();
    formData.append('chat_id', chatId);
    if (caption) formData.append('caption', caption);
    if (messageThreadId) formData.append('message_thread_id', messageThreadId);

    const fileBuffer = await fs.readFile(filepath);
    const blob = new Blob([fileBuffer]);
    formData.append('document', blob, filename);

    const response = await fetch(url, { method: 'POST', body: formData });
    const result = await response.json();
    if (!result.ok) throw new Error(result.description || 'Telegram API error');
    return result;
  }

  private async generateHealthReport(): Promise<string> {
    const tableCount = await this.prisma.$queryRawUnsafe<any[]>('SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE()');
    const dbSize = await this.prisma.$queryRawUnsafe<any[]>('SELECT SUM(data_length + index_length) / 1024 / 1024 AS size_mb FROM information_schema.tables WHERE table_schema = DATABASE()');

    const pppoeCount = await this.prisma.pppoeUser.count();
    const activeCount = await this.prisma.pppoeUser.count({ where: { status: 'active' } });
    const isolatedCount = await this.prisma.pppoeUser.count({ where: { status: 'isolated' } });

    return [
      '📊 <b>Database Health Report</b>',
      `Time: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
      '',
      `Tables: ${tableCount[0]?.count || 0}`,
      `DB Size: ${(dbSize[0]?.size_mb || 0).toFixed(2)} MB`,
      '',
      'PPPoE Users:',
      `  Active: ${activeCount}`,
      `  Isolated: ${isolatedCount}`,
      `  Total: ${pppoeCount}`,
    ].join('\n');
  }
}
