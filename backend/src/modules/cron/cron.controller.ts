import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CronService } from './cron.service';
import { AdminGuard } from '../../common/guards/admin.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('cron')
@Controller('cron')
export class CronController {
  constructor(private readonly cronService: CronService) {}

  // ==================== TRIGGER ====================

  @Public() // Cron triggers are typically called by internal scheduler or curl with secret
  @Post(':jobType')
  @ApiOperation({ summary: 'Trigger a cron job manually' })
  async triggerJob(@Param('jobType') jobType: string) {
    return this.cronService.triggerJob(jobType);
  }

  // ==================== SCHEDULES ====================

  @Get('schedules')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List cron schedules' })
  async listSchedules() { return this.cronService.listSchedules(); }

  @Put('schedules/:jobType')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update cron schedule' })
  async updateSchedule(@Param('jobType') jobType: string, @Body() body: { schedule?: string; enabled?: boolean; updatedBy?: string }) {
    return this.cronService.updateSchedule(jobType, body);
  }

  @Delete('schedules/:jobType')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete cron schedule' })
  async deleteSchedule(@Param('jobType') jobType: string) { return this.cronService.deleteSchedule(jobType); }

  // ==================== STATUS ====================

  @Get('status')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get cron job status and health' })
  async getStatus() { return this.cronService.getStatus(); }
}
