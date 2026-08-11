import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FreeradiusService } from './freeradius.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('freeradius')
@Controller('freeradius')
@UseGuards(AdminGuard)
export class FreeradiusController {
  constructor(private readonly freeradiusService: FreeradiusService) {}

  @Post('reload')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sync NAS clients and restart FreeRADIUS' })
  async reload() {
    return this.freeradiusService.reloadFreeRadius();
  }

  @Get('radclient-status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check if radclient is available' })
  async radclientStatus() {
    const available = await this.freeradiusService.isRadclientAvailable();
    return { available };
  }

  @Post('coa-disconnect')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send CoA disconnect via radclient' })
  async coaDisconnect(@Body() body: { username: string; nasIpAddress: string; nasSecret: string; sessionId?: string; framedIp?: string }) {
    return this.freeradiusService.sendCoADisconnect(body);
  }
}
