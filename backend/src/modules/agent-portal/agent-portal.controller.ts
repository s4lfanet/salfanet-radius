import { Body, Controller, Delete, Get, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { AgentPortalService } from './agent-portal.service';
import { Public } from '../../common/decorators/public.decorator';
import { AgentGuard } from '../../common/guards/agent.guard';

@ApiTags('agent-portal')
@Controller('agent')
export class AgentPortalController {
  constructor(private readonly agentPortalService: AgentPortalService) {}

  // ==================== AUTH (public) ====================

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Agent login (phone)' })
  async login(@Body() body: { phone: string }) {
    return this.agentPortalService.login(body);
  }

  // ==================== PROTECTED ====================

  @Get('dashboard')
  @UseGuards(AgentGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agent dashboard with voucher listing and stats' })
  async dashboard(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('profileId') profileId?: string,
  ) {
    return this.agentPortalService.getDashboard((req as any).agent.agentId, {
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      status, search, profileId,
    });
  }

  @Post('deposit/create')
  @UseGuards(AgentGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create deposit via payment gateway' })
  async createDeposit(@Req() req: Request, @Body() body: { amount: number; gateway: string; paymentMethod?: string }) {
    return this.agentPortalService.createDeposit((req as any).agent.agentId, body);
  }

  @Public()
  @Get('deposit/check')
  @ApiOperation({ summary: 'Check deposit status (public for payment redirect)' })
  async checkDeposit(@Query('token') token?: string, @Query('orderId') orderId?: string) {
    return this.agentPortalService.checkDeposit({ token, orderId });
  }

  @Get('notifications')
  @UseGuards(AgentGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get agent notifications' })
  async getNotifications(@Req() req: Request, @Query('limit') limit?: string) {
    return this.agentPortalService.getNotifications((req as any).agent.agentId, limit ? parseInt(limit) : undefined);
  }

  @Put('notifications/read')
  @UseGuards(AgentGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark agent notifications as read' })
  async markNotificationsRead(@Req() req: Request, @Body() body: { notificationIds?: string[]; markAll?: boolean }) {
    return this.agentPortalService.markNotificationsRead((req as any).agent.agentId, body);
  }

  @Delete('notifications')
  @UseGuards(AgentGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete agent notification' })
  async deleteNotification(@Req() req: Request, @Query('id') id: string) {
    return this.agentPortalService.deleteNotification((req as any).agent.agentId, id);
  }

  @Get('sessions')
  @UseGuards(AgentGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get agent hotspot sessions' })
  async getSessions(@Req() req: Request) {
    return this.agentPortalService.getSessions((req as any).agent.agentId);
  }
}
