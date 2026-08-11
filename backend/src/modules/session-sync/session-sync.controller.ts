import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SessionSyncService } from './session-sync.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('session-sync')
@Controller('session-sync')
@UseGuards(AdminGuard)
export class SessionSyncController {
  constructor(private readonly sessionSyncService: SessionSyncService) {}

  @Post('pppoe')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually trigger PPPoE session sync' })
  async syncPppoe() {
    return this.sessionSyncService.syncPppoeSessions();
  }

  @Post('hotspot')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually trigger hotspot voucher/session sync' })
  async syncHotspot() {
    return this.sessionSyncService.syncHotspotSessions();
  }

  @Post('all')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually trigger all session sync jobs' })
  async syncAll() {
    const [pppoe, hotspot] = await Promise.all([
      this.sessionSyncService.syncPppoeSessions(),
      this.sessionSyncService.syncHotspotSessions(),
    ]);
    return { pppoe, hotspot };
  }
}
