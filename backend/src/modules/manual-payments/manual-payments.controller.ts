import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { ManualPaymentsService } from './manual-payments.service';
import { AdminGuard } from '../../common/guards/admin.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('manual-payments')
@Controller('manual-payments')
export class ManualPaymentsController {
  constructor(private readonly manualPaymentsService: ManualPaymentsService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List manual payments with filters' })
  async list(
    @Query('userId') userId?: string,
    @Query('status') status?: string,
    @Query('month') month?: string,
  ) {
    return this.manualPaymentsService.listManualPayments({ userId, status, month });
  }

  @Post()
  @Public()
  @ApiOperation({ summary: 'Submit new manual payment (public — customer portal)' })
  async create(@Body() body: Record<string, unknown>) {
    return this.manualPaymentsService.createManualPayment(body as never);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get single manual payment' })
  async getOne(@Param('id') id: string) {
    return this.manualPaymentsService.getManualPayment(id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve or reject manual payment (admin)' })
  async process(
    @Param('id') id: string,
    @Body() body: { action: string; rejectionReason?: string },
    @Req() req: Request,
  ) {
    const approvedBy = (req as any).user?.name || (req as any).user?.email || 'Admin';
    return this.manualPaymentsService.processManualPayment(id, body, approvedBy);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete manual payment (admin)' })
  async delete(@Param('id') id: string) {
    return this.manualPaymentsService.deleteManualPayment(id);
  }
}
