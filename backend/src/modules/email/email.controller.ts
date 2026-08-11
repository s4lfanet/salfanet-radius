import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EmailService } from './email.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('email')
@Controller()
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  // ==================== SETTINGS ====================

  @Get('settings/email')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get email settings' })
  async getSettings() { return this.emailService.getSettings(); }

  @Put('settings/email')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update email settings' })
  async updateSettings(@Body() body: Record<string, unknown>) { return this.emailService.updateSettings(body); }

  @Post('settings/email/test')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send test email' })
  async testEmail(@Body() body: { toEmail: string }) { return this.emailService.testEmail(body); }

  // ==================== TEMPLATES ====================

  @Get('settings/email/templates')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List email templates' })
  async listTemplates() { return this.emailService.listTemplates(); }

  @Get('settings/email/templates/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get email template' })
  async getTemplate(@Param('id') id: string) { return this.emailService.getTemplate(id); }

  @Post('settings/email/templates')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create email template' })
  async createTemplate(@Body() body: Record<string, unknown>) { return this.emailService.createTemplate(body as never); }

  @Put('settings/email/templates/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update email template' })
  async updateTemplate(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.emailService.updateTemplate(id, body);
  }

  @Delete('settings/email/templates/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete email template' })
  async deleteTemplate(@Param('id') id: string) { return this.emailService.deleteTemplate(id); }

  // ==================== HISTORY ====================

  @Get('email/history')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List email history' })
  async listHistory(@Query('page') page?: string, @Query('limit') limit?: string, @Query('status') status?: string, @Query('search') search?: string) {
    return this.emailService.listHistory({
      page: page ? parseInt(page) : undefined, limit: limit ? parseInt(limit) : undefined,
      status, search,
    });
  }
}
