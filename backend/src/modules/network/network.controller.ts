import { Body, Controller, Delete, Get, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { NetworkService } from './network.service';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminJwtPayload } from '../auth/auth.service';

@ApiTags('network')
@Controller('network')
@UseGuards(AdminGuard)
export class NetworkController {
  constructor(private readonly networkService: NetworkService) {}

  // ==================== Routers ====================

  @Get('routers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List routers with VPN clients and RADIUS server IP' })
  async getRouters() {
    return this.networkService.getRouters();
  }

  @Post('routers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create router (MikroTik connection test deferred)' })
  async createRouter(@Body() body: Record<string, unknown>, @CurrentUser() user?: AdminJwtPayload) {
    return this.networkService.createRouter(body, user ? { id: user.sub, username: user.username, role: user.role } : undefined);
  }

  @Put('routers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update router' })
  async updateRouter(@Body() body: Record<string, unknown>, @CurrentUser() user?: AdminJwtPayload) {
    return this.networkService.updateRouter(body, user ? { id: user.sub, username: user.username, role: user.role } : undefined);
  }

  @Delete('routers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete router' })
  @ApiQuery({ name: 'id', required: true })
  async deleteRouter(@Query('id') id: string, @CurrentUser() user?: AdminJwtPayload) {
    return this.networkService.deleteRouter(id, user ? { id: user.sub, username: user.username, role: user.role } : undefined);
  }

  // ==================== OLTs ====================

  @Get('olts')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List OLTs with router assignments and ONU stats' })
  async getOlts() {
    return this.networkService.getOlts();
  }

  @Post('olts')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create OLT' })
  async createOlt(@Body() body: Record<string, unknown>) {
    return this.networkService.createOlt(body);
  }

  @Put('olts')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update OLT' })
  async updateOlt(@Body() body: Record<string, unknown>) {
    return this.networkService.updateOlt(body);
  }

  @Delete('olts')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete OLT (unlinks OTBs first)' })
  @ApiQuery({ name: 'id', required: true })
  async deleteOlt(@Query('id') id: string) {
    return this.networkService.deleteOlt(id);
  }

  // ==================== ODPs ====================

  @Get('odps')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List ODPs with OLT/ODC/parent info' })
  async getOdps() {
    return this.networkService.getOdps();
  }

  @Post('odps')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create ODP' })
  async createOdp(@Body() body: Record<string, unknown>) {
    return this.networkService.createOdp(body);
  }

  @Put('odps')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update ODP' })
  async updateOdp(@Body() body: Record<string, unknown>) {
    return this.networkService.updateOdp(body);
  }

  @Delete('odps')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete ODP (blocks if has children)' })
  @ApiQuery({ name: 'id', required: true })
  async deleteOdp(@Query('id') id: string) {
    return this.networkService.deleteOdp(id);
  }

  // ==================== ODCs ====================

  @Get('odcs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List ODCs with OLT info and ODP count' })
  async getOdcs() {
    return this.networkService.getOdcs();
  }

  @Post('odcs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create ODC' })
  async createOdc(@Body() body: Record<string, unknown>) {
    return this.networkService.createOdc(body);
  }

  @Put('odcs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update ODC' })
  async updateOdc(@Body() body: Record<string, unknown>) {
    return this.networkService.updateOdc(body);
  }

  @Delete('odcs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete ODC (blocks if has ODPs)' })
  @ApiQuery({ name: 'id', required: true })
  async deleteOdc(@Query('id') id: string) {
    return this.networkService.deleteOdc(id);
  }

  // ==================== OTBs ====================

  @Get('otbs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List OTBs with filters and pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'oltId', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortOrder', required: false })
  async getOtbs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('oltId') oltId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    return this.networkService.getOtbs({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      search, status, oltId, sortBy, sortOrder,
    });
  }

  @Post('otbs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create OTB (auto-syncs to network_nodes)' })
  async createOtb(@Body() body: Record<string, unknown>) {
    return this.networkService.createOtb(body);
  }

  // ==================== Nodes ====================

  @Get('nodes')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List network nodes (unified map) with filters' })
  @ApiQuery({ name: 'type', required: false, description: 'OLT | ODC | ODP | JOINT_CLOSURE' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  async getNodes(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.networkService.getNodes({
      type, status,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      search,
    });
  }

  // ==================== Servers ====================

  @Get('servers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List network servers' })
  async getServers() {
    return this.networkService.getServers();
  }

  @Post('servers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create network server' })
  async createServer(@Body() body: Record<string, unknown>) {
    return this.networkService.createServer(body);
  }

  @Put('servers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update network server' })
  async updateServer(@Body() body: Record<string, unknown>) {
    return this.networkService.updateServer(body);
  }

  @Delete('servers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete network server' })
  @ApiQuery({ name: 'id', required: true })
  async deleteServer(@Query('id') id: string) {
    return this.networkService.deleteServer(id);
  }
}
