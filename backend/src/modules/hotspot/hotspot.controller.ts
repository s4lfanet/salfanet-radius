import { Body, Controller, Delete, Get, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { HotspotService } from './hotspot.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('hotspot')
@Controller('hotspot')
@UseGuards(AdminGuard)
export class HotspotController {
  constructor(private readonly hotspotService: HotspotService) {}

  // ==================== Profiles ====================

  @Get('profiles')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List hotspot profiles' })
  async getProfiles() {
    return this.hotspotService.getProfiles();
  }

  @Post('profiles')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create hotspot profile' })
  async createProfile(@Body() body: Record<string, unknown>) {
    return this.hotspotService.createProfile(body);
  }

  @Put('profiles')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update hotspot profile' })
  async updateProfile(@Body() body: Record<string, unknown>) {
    return this.hotspotService.updateProfile(body);
  }

  @Delete('profiles')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete hotspot profile (blocks if vouchers exist)' })
  @ApiQuery({ name: 'id', required: true })
  async deleteProfile(@Query('id') id: string) {
    return this.hotspotService.deleteProfile(id);
  }

  // ==================== Vouchers ====================

  @Get('voucher')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List vouchers with filters and pagination' })
  @ApiQuery({ name: 'profileId', required: false })
  @ApiQuery({ name: 'batchCode', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'routerId', required: false })
  @ApiQuery({ name: 'agentId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listVouchers(
    @Query('profileId') profileId?: string,
    @Query('batchCode') batchCode?: string,
    @Query('status') status?: string,
    @Query('routerId') routerId?: string,
    @Query('agentId') agentId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.hotspotService.listVouchers({
      profileId, batchCode, status, routerId, agentId,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Post('voucher')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate vouchers in batch (max 25,000)' })
  async generateVouchers(@Body() body: Record<string, unknown>) {
    const result = await this.hotspotService.generateVouchers(body as never);
    return { success: true, ...result, message: `${result.count} vouchers generated` };
  }

  @Delete('voucher')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete voucher or batch' })
  @ApiQuery({ name: 'id', required: false })
  @ApiQuery({ name: 'batchCode', required: false })
  async deleteVouchers(
    @Query('id') id?: string,
    @Query('batchCode') batchCode?: string,
  ) {
    const result = await this.hotspotService.deleteVouchers({ id, batchCode });
    return { message: `${result.count} voucher(s) deleted`, count: result.count };
  }

  @Patch('voucher')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update agent, router, or profile for multiple vouchers' })
  async patchVouchers(@Body() body: { ids: string[]; profileId?: string; routerId?: string | null; agentId?: string | null; clearAgent?: boolean; clearRouter?: boolean }) {
    return this.hotspotService.patchVouchers(body.ids, body);
  }

  @Delete('voucher/bulk')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bulk delete vouchers by IDs' })
  async bulkDelete(@Body() body: { ids: string[] }) {
    return this.hotspotService.bulkDelete(body.ids);
  }

  @Delete('voucher/delete-expired')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete all expired vouchers' })
  async deleteExpired() {
    return this.hotspotService.deleteExpired();
  }
}
