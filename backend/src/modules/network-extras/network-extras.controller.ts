import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NetworkExtrasService } from './network-extras.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('network-extras')
@Controller('network')
export class NetworkExtrasController {
  constructor(private readonly networkExtrasService: NetworkExtrasService) {}

  // ==================== ROUTERS ====================

  @Get('routers')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'List routers' })
  async listRouters(@Query('search') search?: string, @Query('isActive') isActive?: string) {
    return this.networkExtrasService.listRouters({ search, isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined });
  }

  @Get('routers/status')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Get router status' })
  async getRouterStatus() { return this.networkExtrasService.getRouterStatus(); }

  @Post('routers/test')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Test router TCP connection' })
  async testRouter(@Body() body: { host: string; port?: number }) { return this.networkExtrasService.testRouter(body); }

  @Post('routers/test-gateway')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Test gateway connection' })
  async testGateway(@Body() body: { host: string }) { return this.networkExtrasService.testGateway(body); }

  @Get('routers/:id')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Get router detail' })
  async getRouter(@Param('id') id: string) { return this.networkExtrasService.getRouter(id); }

  @Post('routers')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Create router' })
  async createRouter(@Body() body: Record<string, unknown>) { return this.networkExtrasService.createRouter(body); }

  @Put('routers/:id')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Update router' })
  async updateRouter(@Param('id') id: string, @Body() body: Record<string, unknown>) { return this.networkExtrasService.updateRouter(id, body); }

  @Delete('routers/:id')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete router' })
  async deleteRouter(@Param('id') id: string) { return this.networkExtrasService.deleteRouter(id); }

  @Post('routers/:id/detect-public-ip')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async detectPublicIp(@Param('id') id: string) { return this.networkExtrasService.detectPublicIp(id); }

  @Get('routers/:id/interfaces')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async getRouterInterfaces(@Param('id') id: string) { return this.networkExtrasService.getRouterInterfaces(id); }

  @Get('routers/:id/uplinks')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async getRouterUplinks(@Param('id') id: string) { return this.networkExtrasService.getRouterUplinks(id); }

  @Post('routers/:id/ping-olt')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async pingOlt(@Param('id') id: string, @Body() body: { oltIp: string }) { return this.networkExtrasService.pingOlt(id, body); }

  @Post('routers/:id/setup-isolir')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async setupIsolir(@Param('id') id: string) { return this.networkExtrasService.setupIsolir(id); }

  @Post('routers/:id/setup-radius')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async setupRadius(@Param('id') id: string) { return this.networkExtrasService.setupRadius(id); }

  // ==================== NODES ====================

  @Get('nodes')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async listNodes(@Query('type') type?: string, @Query('status') status?: string, @Query('search') search?: string) {
    return this.networkExtrasService.listNodes({ type, status, search });
  }

  @Get('nodes/:id')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async getNode(@Param('id') id: string) { return this.networkExtrasService.getNode(id); }

  @Post('nodes')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async createNode(@Body() body: Record<string, unknown>) { return this.networkExtrasService.createNode(body); }

  @Put('nodes/:id')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async updateNode(@Param('id') id: string, @Body() body: Record<string, unknown>) { return this.networkExtrasService.updateNode(id, body); }

  @Delete('nodes/:id')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async deleteNode(@Param('id') id: string) { return this.networkExtrasService.deleteNode(id); }

  // ==================== ODCs ====================

  @Get('odcs')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async listOdcs(@Query('oltId') oltId?: string, @Query('search') search?: string) {
    return this.networkExtrasService.listOdcs({ oltId, search });
  }

  @Post('odcs')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async createOdc(@Body() body: Record<string, unknown>) { return this.networkExtrasService.createOdc(body); }

  // ==================== ODPs ====================

  @Get('odps')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async listOdps(@Query('oltId') oltId?: string, @Query('odcId') odcId?: string, @Query('search') search?: string) {
    return this.networkExtrasService.listOdps({ oltId, odcId, search });
  }

  @Post('odps')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async createOdp(@Body() body: Record<string, unknown>) { return this.networkExtrasService.createOdp(body); }

  @Post('customers/assign')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Assign customer to ODP port' })
  async assignOdpCustomer(@Body() body: { odpId: string; customerId: string; portNumber: number; distance?: number; notes?: string }) {
    return this.networkExtrasService.assignOdpCustomer(body);
  }

  // ==================== OTBs ====================

  @Get('otbs')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async listOtbs(@Query('oltId') oltId?: string, @Query('search') search?: string) {
    return this.networkExtrasService.listOtbs({ oltId, search });
  }

  @Get('otbs/stats')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async getOtbStats() { return this.networkExtrasService.getOtbStats(); }

  @Get('otbs/:id')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async getOtb(@Param('id') id: string) { return this.networkExtrasService.getOtb(id); }

  @Post('otbs')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async createOtb(@Body() body: Record<string, unknown>) { return this.networkExtrasService.createOtb(body); }

  @Put('otbs/:id')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async updateOtb(@Param('id') id: string, @Body() body: Record<string, unknown>) { return this.networkExtrasService.updateOtb(id, body); }

  @Delete('otbs/:id')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async deleteOtb(@Param('id') id: string) { return this.networkExtrasService.deleteOtb(id); }

  @Get('otbs/:id/feeder-cables')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async getOtbFeederCables(@Param('id') id: string) { return this.networkExtrasService.getOtbFeederCables(id); }

  @Get('otbs/:id/segments')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async getOtbSegments(@Param('id') id: string) { return this.networkExtrasService.getOtbSegments(id); }

  // ==================== SERVERS ====================

  @Get('servers')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async listServers() { return this.networkExtrasService.listServers(); }

  @Post('servers')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async createServer(@Body() body: Record<string, unknown>) { return this.networkExtrasService.createServer(body); }

  // ==================== CONNECTIONS ====================

  @Get('connections')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async listConnections() { return this.networkExtrasService.listConnections(); }

  // ==================== CORES ====================

  @Get('cores')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async listCores(@Query('cableId') cableId?: string, @Query('tubeId') tubeId?: string, @Query('status') status?: string, @Query('assignedToType') assignedToType?: string) {
    return this.networkExtrasService.listCores({ cableId, tubeId, status, assignedToType });
  }

  // ==================== OLTS (network/olts) ====================

  @Get('olts')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async listOlts() { return this.networkExtrasService.listOlts(); }

  @Get('olts/status')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async getOltsStatus() { return this.networkExtrasService.getOltsStatus(); }

  @Post('olts/import')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async importOlts(@Body() body: { olts: Array<Record<string, unknown>> }) { return this.networkExtrasService.importOlts(body); }

  @Get('olts/template')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async getOltsTemplate() { return this.networkExtrasService.getOltsTemplate(); }

  // ==================== JOINT CLOSURES IMPORT/TEMPLATE ====================

  @Post('joint-closures/import')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async importJointClosures(@Body() body: { items: Array<Record<string, unknown>> }) { return this.networkExtrasService.importJointClosures(body); }

  @Get('joint-closures/template')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async getJointClosuresTemplate() { return this.networkExtrasService.getJointClosuresTemplate(); }

  // ==================== VPN EXTRAS ====================

  @Get('vpn-routing')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async getVpnRouting() { return this.networkExtrasService.getVpnRouting(); }

  @Post('vpn-server/:id/setup')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async setupVpnServer(@Param('id') id: string) { return this.networkExtrasService.setupVpnServer(id); }

  @Post('vpn-server/:id/test')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async testVpnServer(@Param('id') id: string) { return this.networkExtrasService.testVpnServer(id); }

  @Post('vpn-server/:id/l2tp-control')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async l2tpControl(@Param('id') id: string, @Body() body: { action: 'enable' | 'disable' }) { return this.networkExtrasService.l2tpControl(id, body); }

  @Post('vpn-server/:id/pptp-control')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async pptpControl(@Param('id') id: string, @Body() body: { action: 'enable' | 'disable' }) { return this.networkExtrasService.pptpControl(id, body); }

  @Post('vpn-server/:id/sstp-control')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async sstpControl(@Param('id') id: string, @Body() body: { action: 'enable' | 'disable' }) { return this.networkExtrasService.sstpControl(id, body); }

  // ==================== VPS INFO ====================

  @Get('vps-info')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async getVpsInfo() { return this.networkExtrasService.getVpsInfo(); }

  @Get('vps-l2tp-info')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async getVpsL2tpInfo() { return this.networkExtrasService.getVpsL2tpInfo(); }

  @Get('vps-l2tp-peer')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async getVpsL2tpPeer() { return this.networkExtrasService.getVpsL2tpPeer(); }

  @Get('vps-wg-peer')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async getVpsWgPeer() { return this.networkExtrasService.getVpsWgPeer(); }
}
