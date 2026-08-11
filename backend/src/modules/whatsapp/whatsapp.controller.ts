import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WhatsAppService } from './whatsapp.service';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('whatsapp')
@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  // ==================== SEND ====================

  @Post('send')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send WhatsApp message (failover)' })
  async send(@Body() body: { phone: string; message: string }) {
    return this.whatsappService.sendMessage(body.phone, body.message);
  }

  // ==================== TEMPLATES ====================

  @Get('templates')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List WhatsApp templates (auto-seeds defaults)' })
  async listTemplates() {
    return this.whatsappService.listTemplates();
  }

  @Post('templates')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create WhatsApp template' })
  async createTemplate(@Body() body: { name: string; type: string; message: string; isActive?: boolean }) {
    return this.whatsappService.createTemplate(body);
  }

  @Put('templates/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update WhatsApp template' })
  async updateTemplate(@Param('id') id: string, @Body() body: { name?: string; type?: string; message?: string; isActive?: boolean }) {
    return this.whatsappService.updateTemplate(id, body);
  }

  @Delete('templates/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete WhatsApp template' })
  async deleteTemplate(@Param('id') id: string) {
    return this.whatsappService.deleteTemplate(id);
  }

  // ==================== PROVIDERS ====================

  @Get('providers')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List WhatsApp providers' })
  async listProviders() {
    return this.whatsappService.listProviders();
  }

  @Post('providers')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create WhatsApp provider' })
  async createProvider(@Body() body: Record<string, unknown>) {
    return this.whatsappService.createProvider(body as never);
  }

  @Put('providers/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update WhatsApp provider' })
  async updateProvider(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.whatsappService.updateProvider(id, body);
  }

  @Delete('providers/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete WhatsApp provider' })
  async deleteProvider(@Param('id') id: string) {
    return this.whatsappService.deleteProvider(id);
  }

  @Get('providers/:id/status')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get provider connection status' })
  async getProviderStatus(@Param('id') id: string) {
    return this.whatsappService.getProviderStatus(id);
  }

  @Get('providers/:id/qr')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get provider QR code' })
  async getProviderQr(@Param('id') id: string) {
    return this.whatsappService.getProviderQr(id);
  }

  @Post('providers/:id/restart')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Restart provider session' })
  async restartProvider(@Param('id') id: string) {
    return this.whatsappService.restartProvider(id);
  }

  @Post('providers/:id/test')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test provider by sending test message' })
  async testProvider(@Param('id') id: string, @Body() body: { phone: string }) {
    return this.whatsappService.testProvider(id, body.phone);
  }

  // ==================== HISTORY ====================

  @Get('history')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List WhatsApp message history (paginated)' })
  async listHistory(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.whatsappService.listHistory({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      status, search,
    });
  }

  // ==================== REMINDER SETTINGS ====================

  @Get('reminder-settings')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get WhatsApp reminder settings' })
  async getReminderSettings() {
    return this.whatsappService.getReminderSettings();
  }

  @Put('reminder-settings')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update WhatsApp reminder settings' })
  async updateReminderSettings(@Body() body: Record<string, unknown>) {
    return this.whatsappService.updateReminderSettings(body);
  }

  // ==================== BROADCAST ====================

  @Post('broadcast')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Broadcast message to selected users' })
  async broadcast(@Body() body: { userIds: string[]; message: string; subject?: string; channel?: string; delay?: number }) {
    return this.whatsappService.broadcast(body);
  }

  @Post('broadcast-invoice')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send invoice reminders to selected invoices' })
  async broadcastInvoice(@Body() body: { invoiceIds: string[]; channel?: string }) {
    return this.whatsappService.broadcastInvoice(body);
  }

  // ==================== WEBHOOK ====================

  @Public()
  @Get('webhook')
  @ApiOperation({ summary: 'WhatsApp webhook (GET verification)' })
  async webhookGet(@Query() query: Record<string, unknown>) {
    return { received: true, query };
  }

  @Public()
  @Post('webhook')
  @ApiOperation({ summary: 'WhatsApp webhook (incoming messages)' })
  async webhookPost(@Body() body: any, @Query() query: Record<string, unknown>) {
    return this.whatsappService.handleWebhook(body, query);
  }
}
