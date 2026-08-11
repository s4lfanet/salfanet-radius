import { Body, Controller, Delete, Get, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { AdminGuard } from '../../common/guards/admin.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('invoices')
@Controller('invoices')
@UseGuards(AdminGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List invoices with filters and stats' })
  @ApiQuery({ name: 'status', required: false, description: 'UNPAID | PAID | PENDING | OVERDUE | all' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'month', required: false, description: 'YYYY-MM' })
  async getInvoices(
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
    @Query('month') month?: string,
  ) {
    return this.invoicesService.getInvoices({
      status, userId,
      limit: limit ? parseInt(limit) : undefined,
      month,
    });
  }

  @Get('counts')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get invoice counts by status' })
  async getInvoiceCounts() {
    return this.invoicesService.getInvoiceCounts();
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create invoice manually' })
  async createInvoice(@Body() body: Record<string, unknown>) {
    return this.invoicesService.createInvoice(body as never);
  }

  @Put()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update invoice (mark as paid, etc) — core update + RADIUS sync' })
  async updateInvoice(@Body() body: Record<string, unknown>) {
    return this.invoicesService.updateInvoice(body as never);
  }

  @Delete()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete invoice(s)' })
  @ApiQuery({ name: 'id', required: false })
  @ApiQuery({ name: 'ids', required: false, description: 'Comma-separated IDs for bulk delete' })
  async deleteInvoices(
    @Query('id') id?: string,
    @Query('ids') ids?: string,
  ) {
    return this.invoicesService.deleteInvoices({ id, ids });
  }
}
