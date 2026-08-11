import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { MikrotikService } from './mikrotik.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('mikrotik')
@Controller('mikrotik')
@UseGuards(AdminGuard)
export class MikrotikController {
  constructor(private readonly mikrotikService: MikrotikService) {}

  @Post('test-connection')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test MikroTik router API connection' })
  async testConnection(@Body() body: { host: string; user: string; password: string; port?: number }) {
    return this.mikrotikService.testConnection(body);
  }

  @Get('hotspot-sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get live hotspot sessions from MikroTik API' })
  @ApiQuery({ name: 'routerId', required: false })
  async getHotspotSessions(@Query('routerId') routerId?: string) {
    return this.mikrotikService.getHotspotSessions(routerId);
  }

  @Get('pppoe-sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get live PPPoE sessions from MikroTik API' })
  @ApiQuery({ name: 'routerId', required: false })
  async getPppoeSessions(@Query('routerId') routerId?: string) {
    return this.mikrotikService.getPppoeSessions(routerId);
  }

  @Post('disconnect')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disconnect user session via MikroTik API' })
  async disconnectUser(@Body() body: { username: string; routerId?: string }) {
    return this.mikrotikService.disconnectUser(body.username, body.routerId);
  }
}
