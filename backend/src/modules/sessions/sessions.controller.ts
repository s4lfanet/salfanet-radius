import { Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { SessionsService } from './sessions.service';
import { ExportService } from './export.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('sessions')
@Controller('sessions')
@UseGuards(AdminGuard)
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly exportService: ExportService,
  ) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active sessions (radacct + synthetic hotspot)' })
  @ApiQuery({ name: 'type', required: false, description: 'pppoe | hotspot' })
  @ApiQuery({ name: 'routerId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'live', required: false, description: 'true to enable live traffic overlay (deferred)' })
  async listSessions(
    @Query('type') type?: string,
    @Query('routerId') routerId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('live') live?: string,
  ) {
    return this.sessionsService.listActiveSessions({
      type, routerId, search,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      live: live === 'true',
    });
  }

  @Get('realtime')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get realtime sessions from MikroTik API' })
  @ApiQuery({ name: 'routerId', required: false })
  async getRealtime(@Query('routerId') routerId?: string) {
    return this.sessionsService.getRealtimeSessions(routerId);
  }

  @Get('export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export sessions (Excel/PDF/JSON)' })
  @ApiQuery({ name: 'format', required: false, description: 'excel | pdf | json (default: json)' })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'routerId', required: false })
  @ApiQuery({ name: 'username', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'mode', required: false, description: 'active | history (default: history)' })
  async exportSessions(
    @Query('format') format?: string,
    @Query('type') type?: string,
    @Query('routerId') routerId?: string,
    @Query('username') username?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('mode') mode?: string,
    @Res({ passthrough: false }) res?: Response,
  ) {
    const fmt = format || 'json';
    const params = { format: fmt, type, routerId, username, startDate, endDate, mode };

    if (fmt === 'excel') {
      const { buffer, filename } = await this.exportService.exportSessionsToExcel(params);
      res!.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res!.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res!.end(buffer);
    }

    if (fmt === 'pdf') {
      const { buffer, filename } = await this.exportService.exportSessionsToPdf(params);
      res!.setHeader('Content-Type', 'application/pdf');
      res!.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res!.end(buffer);
    }

    // JSON format — delegate to sessionsService for backward compatibility
    return this.sessionsService.exportSessions(params);
  }

  @Post('sync')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trigger session sync job (pppoe/hotspot/all)' })
  @ApiQuery({ name: 'type', required: false, description: 'pppoe | hotspot | all (default: all)' })
  async syncSessions(@Query('type') type?: string) {
    return this.sessionsService.syncSessions(type);
  }
}
