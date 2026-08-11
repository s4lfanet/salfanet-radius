import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('sessions')
@Controller('sessions')
@UseGuards(AdminGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

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
  @ApiOperation({ summary: 'Get realtime sessions from MikroTik API (deferred)' })
  @ApiQuery({ name: 'routerId', required: false })
  async getRealtime(@Query('routerId') routerId?: string) {
    return this.sessionsService.getRealtimeSessions(routerId);
  }

  @Get('export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export sessions (JSON format, Excel/PDF deferred)' })
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
  ) {
    return this.sessionsService.exportSessions({
      format, type, routerId, username, startDate, endDate, mode,
    });
  }

  @Post('sync')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trigger session sync job (deferred)' })
  @ApiQuery({ name: 'type', required: false, description: 'pppoe | hotspot | all (default: all)' })
  async syncSessions(@Query('type') type?: string) {
    return this.sessionsService.syncSessions(type);
  }
}
