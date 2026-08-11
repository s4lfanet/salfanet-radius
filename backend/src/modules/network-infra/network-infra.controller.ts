import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NetworkInfraService } from './network-infra.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('network-infra')
@Controller('network')
export class NetworkInfraController {
  constructor(private readonly networkInfraService: NetworkInfraService) {}

  // ==================== TRACE ====================

  @Get('trace')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trace fiber path from core/customer/ODP/device' })
  async trace(
    @Query('type') type: string,
    @Query('coreId') coreId?: string,
    @Query('customerId') customerId?: string,
    @Query('odpId') odpId?: string,
    @Query('deviceType') deviceType?: string,
    @Query('deviceId') deviceId?: string,
    @Query('direction') direction?: string,
  ) {
    return this.networkInfraService.trace({ type, coreId, customerId, odpId, deviceType, deviceId, direction });
  }

  // ==================== CABLES ====================

  @Get('cables')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List fiber cables' })
  async listCables(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('cableType') cableType?: string,
    @Query('includeDetails') includeDetails?: string,
  ) {
    return this.networkInfraService.listCables({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      search, status, cableType,
      includeDetails: includeDetails === 'true',
    });
  }

  @Get('cables/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get cable detail' })
  async getCable(@Param('id') id: string, @Query('includeDetails') includeDetails?: string) {
    return this.networkInfraService.getCable(id, includeDetails === 'true');
  }

  @Post('cables')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create fiber cable with tubes and cores' })
  async createCable(@Body() body: Record<string, unknown>) {
    return this.networkInfraService.createCable(body as never);
  }

  @Put('cables/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update cable' })
  async updateCable(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.networkInfraService.updateCable(id, body);
  }

  @Delete('cables/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete cable (if no assigned cores)' })
  async deleteCable(@Param('id') id: string) {
    return this.networkInfraService.deleteCable(id);
  }

  // ==================== SPLICES ====================

  @Get('splices')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List splice points' })
  async listSplices(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('deviceType') deviceType?: string,
    @Query('deviceId') deviceId?: string,
    @Query('status') status?: string,
    @Query('spliceType') spliceType?: string,
  ) {
    return this.networkInfraService.listSplices({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      deviceType, deviceId, status, spliceType,
    });
  }

  @Get('splices/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get splice detail' })
  async getSplice(@Param('id') id: string) {
    return this.networkInfraService.getSplice(id);
  }

  @Post('splices')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create splice point' })
  async createSplice(@Body() body: Record<string, unknown>) {
    return this.networkInfraService.createSplice(body as never);
  }

  @Delete('splices/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete splice and release cores' })
  async deleteSplice(@Param('id') id: string) {
    return this.networkInfraService.deleteSplice(id);
  }

  // ==================== JOINT CLOSURES ====================

  @Get('joint-closures')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List joint closures' })
  async listJointClosures(@Query('type') type?: string, @Query('status') status?: string, @Query('search') search?: string) {
    return this.networkInfraService.listJointClosures({ type, status, search });
  }

  @Get('joint-closures/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get joint closure detail' })
  async getJointClosure(@Param('id') id: string) {
    return this.networkInfraService.getJointClosure(id);
  }

  @Post('joint-closures')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create joint closure' })
  async createJointClosure(@Body() body: Record<string, unknown>) {
    return this.networkInfraService.createJointClosure(body);
  }

  @Put('joint-closures/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update joint closure' })
  async updateJointClosure(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.networkInfraService.updateJointClosure(id, body);
  }

  @Delete('joint-closures/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete joint closure' })
  async deleteJointClosure(@Param('id') id: string) {
    return this.networkInfraService.deleteJointClosure(id);
  }

  // ==================== FIBER PATHS ====================

  @Get('fiber-paths')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List fiber paths' })
  async listFiberPaths(@Query('status') status?: string, @Query('search') search?: string) {
    return this.networkInfraService.listFiberPaths({ status, search });
  }

  @Get('fiber-paths/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get fiber path detail' })
  async getFiberPath(@Param('id') id: string) {
    return this.networkInfraService.getFiberPath(id);
  }

  @Post('fiber-paths')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create fiber path' })
  async createFiberPath(@Body() body: Record<string, unknown>) {
    return this.networkInfraService.createFiberPath(body);
  }

  @Put('fiber-paths/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update fiber path' })
  async updateFiberPath(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.networkInfraService.updateFiberPath(id, body);
  }

  @Delete('fiber-paths/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete fiber path' })
  async deleteFiberPath(@Param('id') id: string) {
    return this.networkInfraService.deleteFiberPath(id);
  }

  // ==================== AUTO-CONNECT ====================

  @Post('auto-connect')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Smart auto-connect for unified map' })
  async autoConnect(@Body() body: { sourceId: string; sourceType: string; targetId: string; targetType: string; cableSpec?: Record<string, unknown> }) {
    return this.networkInfraService.autoConnect(body);
  }

  // ==================== MAP SETTINGS ====================

  @Get('map-settings')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get map settings' })
  async getMapSettings() {
    return this.networkInfraService.getMapSettings();
  }

  @Put('map-settings')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update map settings' })
  async updateMapSettings(@Body() body: Record<string, unknown>) {
    return this.networkInfraService.updateMapSettings(body);
  }
}
