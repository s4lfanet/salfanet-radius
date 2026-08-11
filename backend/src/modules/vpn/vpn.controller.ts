import { Body, Controller, Delete, Get, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VpnService } from './vpn.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('vpn')
@Controller('network/vpn')
export class VpnController {
  constructor(private readonly vpnService: VpnService) {}

  // ==================== VPN SERVERS ====================

  @Get('servers')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List VPN servers' })
  async listServers() {
    return this.vpnService.listServers();
  }

  @Post('servers')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create VPN server' })
  async createServer(@Body() body: Record<string, unknown>) {
    return this.vpnService.createServer(body as never);
  }

  @Put('servers')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update VPN server' })
  async updateServer(@Body() body: Record<string, unknown>) {
    const { id, ...data } = body as any;
    return this.vpnService.updateServer(id, data);
  }

  @Delete('servers')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete VPN server' })
  async deleteServer(@Query('id') id: string) {
    return this.vpnService.deleteServer(id);
  }

  // ==================== VPN CLIENTS ====================

  @Get('clients')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List VPN clients with NAS secrets' })
  async listClients() {
    return this.vpnService.listClients();
  }

  @Post('clients')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create VPN client (generates credentials, creates NAS)' })
  async createClient(@Body() body: Record<string, unknown>) {
    return this.vpnService.createClient(body as never);
  }

  @Patch('clients')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update VPN client IP' })
  async updateClientIp(@Body() body: { id: string; vpnIp: string }) {
    return this.vpnService.updateClientIp(body.id, body.vpnIp);
  }
}
