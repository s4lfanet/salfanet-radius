import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TelegramService } from './telegram.service';
import { AdminGuard } from '../../common/guards/admin.guard';
import { UseGuards } from '@nestjs/common';

@ApiTags('telegram')
@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Get('settings')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Telegram backup settings' })
  async getSettings() {
    return this.telegramService.getSettings();
  }

  @Post('settings')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update Telegram backup settings' })
  async updateSettings(@Body() body: Record<string, unknown>) {
    return this.telegramService.updateSettings(body as never);
  }

  @Post('test')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test Telegram connection' })
  async testConnection(@Body() body: { botToken: string; chatId: string; backupTopicId?: string; healthTopicId?: string }) {
    return this.telegramService.testConnection(body);
  }

  @Post('send-backup')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send backup file to Telegram' })
  async sendBackup(@Body() body: { backupId: string }) {
    return this.telegramService.sendBackup(body.backupId);
  }

  @Post('send-health')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send database health report to Telegram' })
  async sendHealth() {
    return this.telegramService.sendHealth();
  }

  @Post('test-backup')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create real backup and send to Telegram' })
  async testBackup() {
    return this.telegramService.testBackup();
  }
}
