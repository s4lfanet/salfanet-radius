import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DataUsageService } from './data-usage.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('data-usage')
@Controller('data-usage')
@UseGuards(AdminGuard)
export class DataUsageController {
  constructor(private readonly dataUsageService: DataUsageService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get bandwidth usage per user for a date range' })
  @ApiQuery({ name: 'username', required: false })
  @ApiQuery({ name: 'startDate', required: false, description: 'ISO date (default: 30 days ago)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'ISO date (default: now)' })
  async getUserUsage(
    @Query('username') username?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.dataUsageService.getUserUsage({ username, startDate, endDate });
  }

  @Get('monthly')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get monthly bandwidth summary per user' })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({ name: 'month', required: false, type: Number, description: '0-11 (default: current month)' })
  async getMonthlySummary(
    @Query('year') year?: number,
    @Query('month') month?: number,
  ) {
    return this.dataUsageService.getMonthlySummary({
      year: year ? Number(year) : undefined,
      month: month !== undefined ? Number(month) : undefined,
    });
  }

  @Get('top')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get top bandwidth consumers' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'default: 20' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'default: 30' })
  async getTopConsumers(
    @Query('limit') limit?: number,
    @Query('days') days?: number,
  ) {
    return this.dataUsageService.getTopConsumers({
      limit: limit ? Number(limit) : undefined,
      days: days ? Number(days) : undefined,
    });
  }

  @Post('aggregate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually trigger data usage aggregation' })
  async triggerAggregation() {
    return this.dataUsageService.runAggregation();
  }
}
