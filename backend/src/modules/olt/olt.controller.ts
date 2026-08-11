import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { OltService } from './olt.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('olt')
@Controller('olt')
export class OltController {
  constructor(private readonly oltService: OltService) {}

  @Get(':id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get OLT detail with routers, ONUs, alerts, metrics' })
  async getOltDetail(@Param('id') id: string, @Query('onuStatus') onuStatus?: string) {
    return this.oltService.getOltDetail(id, onuStatus);
  }

  @Put(':id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update OLT monitoring settings' })
  async updateOlt(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.oltService.updateOlt(id, body as never);
  }

  @Get(':id/chassis')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get OLT chassis slot layout' })
  async getChassis(@Param('id') id: string) {
    return this.oltService.getChassis(id);
  }

  @Get(':id/onus')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List ONU statuses for OLT' })
  async listOnuStatuses(@Param('id') id: string, @Query('status') status?: string) {
    return this.oltService.listOnuStatuses(id, status);
  }

  @Get(':id/onus/register')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get ONU registration metadata' })
  async getOnuRegisterMetadata(
    @Param('id') id: string,
    @Query('frame') frame?: string,
    @Query('slot') slot?: string,
    @Query('port') port?: string,
    @Query('onuId') onuId?: string,
    @Query('serialNumber') serialNumber?: string,
  ) {
    return this.oltService.getOnuRegisterMetadata(id, {
      frame: frame ? parseInt(frame) : undefined,
      slot: slot ? parseInt(slot) : undefined,
      port: port ? parseInt(port) : undefined,
      onuId: onuId ? parseInt(onuId) : undefined,
      serialNumber,
    });
  }

  @Post(':id/onus/register')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register ONU on OLT' })
  async registerOnu(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.oltService.registerOnu(id, body as never);
  }

  @Get(':id/onus/:onuId/detail')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get ONU detail with customer info' })
  async getOnuDetail(@Param('id') id: string, @Param('onuId') onuId: string) {
    return this.oltService.getOnuDetail(id, onuId);
  }

  @Delete(':id/onus/:onuId/delete')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete ONU from OLT' })
  async deleteOnu(@Param('id') id: string, @Param('onuId') onuId: string, @Req() req: Request) {
    const resolvedBy = (req as any).user?.username || 'admin';
    return this.oltService.deleteOnu(id, onuId);
  }

  @Get(':id/alerts')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List OLT alerts' })
  async listAlerts(
    @Param('id') id: string,
    @Query('isResolved') isResolved?: string,
    @Query('severity') severity?: string,
  ) {
    return this.oltService.listAlerts(id, {
      isResolved: isResolved === 'true' ? true : isResolved === 'false' ? false : undefined,
      severity,
    });
  }

  @Post(':id/alerts/:alertId/resolve')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resolve OLT alert' })
  async resolveAlert(@Param('alertId') alertId: string, @Req() req: Request) {
    const resolvedBy = (req as any).user?.username || 'admin';
    return this.oltService.resolveAlert(alertId, resolvedBy);
  }

  @Get(':id/metrics')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List OLT performance metrics' })
  async listMetrics(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.oltService.listPerformanceMetrics(id, limit ? parseInt(limit) : undefined);
  }

  @Get('alert-settings')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List alert settings' })
  async getAlertSettings(@Query('oltId') oltId?: string) {
    return this.oltService.getAlertSettings(oltId);
  }

  @Put('alert-settings/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update alert settings' })
  async updateAlertSettings(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.oltService.updateAlertSettings(id, body);
  }
}
