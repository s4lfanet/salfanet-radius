import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IppoolService } from './ippool.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('ippool')
@Controller('ippool')
@UseGuards(AdminGuard)
export class IppoolController {
  constructor(private readonly ippoolService: IppoolService) {}

  // ==================== Statistics ====================

  @Get('stats')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get IP pool statistics (total, allocated, free)' })
  async getStats() {
    return this.ippoolService.getStats();
  }

  // ==================== Pool Listing ====================

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all IP pools with summary' })
  async listPools() {
    return this.ippoolService.listPools();
  }

  @Get(':poolName')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get pool details with recent allocations' })
  async getPoolDetails(@Param('poolName') poolName: string) {
    return this.ippoolService.getPoolDetails(poolName);
  }

  // ==================== Pool Management ====================

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create new IP pool' })
  async createPool(@Body() body: { pool_name: string; network: string; start: number; end: number }) {
    return this.ippoolService.createPool(body);
  }

  @Put('expand')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Expand existing pool with additional IPs' })
  async expandPool(@Body() body: { pool_name: string; network: string; start: number; end: number }) {
    return this.ippoolService.expandPool(body);
  }

  @Delete()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete pool (only if no IPs allocated)' })
  async deletePool(@Query('poolName') poolName: string) {
    return this.ippoolService.deletePool(poolName);
  }

  // ==================== Pool-Group Mapping ====================

  @Get('mappings/list')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all Pool-Name → group mappings (radgroupreply)' })
  async getPoolMappings() {
    return this.ippoolService.getPoolMappings();
  }

  @Post('mappings')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Map Pool-Name to a RADIUS group (radgroupreply)' })
  async mapPoolToGroup(@Body() body: { groupname: string; pool_name: string }) {
    return this.ippoolService.mapPoolToGroup(body);
  }

  @Delete('mappings/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove Pool-Name mapping from group' })
  async deletePoolMapping(@Param('id') id: number) {
    return this.ippoolService.deletePoolMapping(Number(id));
  }
}
