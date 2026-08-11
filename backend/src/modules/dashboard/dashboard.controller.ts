import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(AdminGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get dashboard statistics' })
  @ApiQuery({ name: 'month', required: false, description: 'YYYY-MM format (e.g. 2026-02)' })
  async getStats(@Query('month') month?: string) {
    const result = await this.dashboardService.getStats(month);
    return { success: true, ...result };
  }

  @Get('analytics')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get dashboard analytics (revenue, users, hotspot, sessions, financial)' })
  @ApiQuery({ name: 'type', required: false, description: 'all|revenue|users|hotspot|sessions|financial' })
  async getAnalytics(@Query('type') type?: string) {
    const data = await this.dashboardService.getAnalytics(type || 'all');
    return { success: true, data };
  }

  @Get('traffic')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get router traffic data from active RADIUS sessions' })
  async getTraffic() {
    const result = await this.dashboardService.getTraffic();
    return { success: true, ...result };
  }
}
