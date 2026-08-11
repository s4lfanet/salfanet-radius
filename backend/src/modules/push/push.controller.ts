import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { PushService } from './push.service';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CustomerGuard } from '../../common/guards/customer.guard';
import { TechnicianGuard } from '../../common/guards/technician.guard';

@ApiTags('push')
@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  // ==================== VAPID ====================

  @Public()
  @Get('vapid-public-key')
  @ApiOperation({ summary: 'Get VAPID public key (public)' })
  async getVapidPublicKey() {
    return this.pushService.getVapidPublicKey();
  }

  // ==================== CUSTOMER SUBSCRIBE ====================

  @Post('subscribe')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Subscribe customer to web push' })
  async subscribeCustomer(@Req() req: Request, @Body() body: { subscription: any }) {
    return this.pushService.subscribeCustomer((req as any).customer.userId, body.subscription);
  }

  @Post('unsubscribe')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unsubscribe customer from web push' })
  async unsubscribeCustomer(@Req() req: Request, @Body() body: { endpoint?: string; subscription?: any }) {
    return this.pushService.unsubscribeCustomer((req as any).customer.userId, body);
  }

  // ==================== AGENT SUBSCRIBE ====================

  @Public()
  @Post('agent-subscribe')
  @ApiOperation({ summary: 'Subscribe agent to web push' })
  async subscribeAgent(@Body() body: { agentId: string; subscription: any }) {
    return this.pushService.subscribeAgent(body.agentId, body.subscription);
  }

  @Public()
  @Post('agent-unsubscribe')
  @ApiOperation({ summary: 'Unsubscribe agent from web push' })
  async unsubscribeAgent(@Body() body: { agentId: string; endpoint?: string; subscription?: any }) {
    return this.pushService.unsubscribeAgent(body.agentId, body);
  }

  // ==================== TECHNICIAN SUBSCRIBE ====================

  @Post('technician-subscribe')
  @UseGuards(TechnicianGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Subscribe technician to web push' })
  async subscribeTechnician(@Req() req: Request, @Body() body: { subscription: any }) {
    return this.pushService.subscribeTechnician((req as any).technician.technicianId, body.subscription);
  }

  @Post('technician-unsubscribe')
  @UseGuards(TechnicianGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unsubscribe technician from web push' })
  async unsubscribeTechnician(@Req() req: Request, @Body() body: { endpoint?: string; subscription?: any }) {
    return this.pushService.unsubscribeTechnician((req as any).technician.technicianId, body);
  }

  // ==================== SEND / BROADCAST ====================

  @Get('send')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get broadcast history or stats' })
  async getBroadcastData(@Req() req: Request) {
    const action = (req as any).query?.action;
    if (action === 'stats') return this.pushService.getStats();
    return this.pushService.getBroadcastHistory();
  }

  @Post('send')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send web push broadcast' })
  async sendBroadcast(
    @Req() req: Request,
    @Body() body: { title: string; message: string; type?: string; recipientRole?: string; targetType?: string; targetIds?: string[]; data?: Record<string, unknown> },
  ) {
    const sentBy = (req as any).user?.username || (req as any).user?.name || 'admin';
    return this.pushService.sendBroadcast(body, sentBy);
  }
}
