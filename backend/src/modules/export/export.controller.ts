import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { ExportService } from './export.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('export')
@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('invoices/:id/pdf')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Download invoice PDF' })
  async invoicePdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.exportService.generateInvoicePdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${id}.pdf"`);
    res.send(buffer);
  }

  @Get('invoices/excel')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Export invoices to Excel' })
  async invoicesExcel(@Query('status') status?: string, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string, @Res() res?: Response) {
    const buffer = await this.exportService.exportInvoicesExcel({ status, startDate, endDate });
    res!.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res!.setHeader('Content-Disposition', `attachment; filename="invoices-${Date.now()}.xlsx"`);
    res!.send(buffer);
  }

  @Get('pppoe-users/excel')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Export PPPoE users to Excel' })
  async pppoeUsersExcel(@Query('status') status?: string, @Query('areaId') areaId?: string, @Query('profileId') profileId?: string, @Res() res?: Response) {
    const buffer = await this.exportService.exportPppoeUsersExcel({ status, areaId, profileId });
    res!.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res!.setHeader('Content-Disposition', `attachment; filename="pppoe-users-${Date.now()}.xlsx"`);
    res!.send(buffer);
  }

  @Get('hotspot-vouchers/excel')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Export hotspot vouchers to Excel' })
  async hotspotVouchersExcel(@Query('status') status?: string, @Query('profileId') profileId?: string, @Res() res?: Response) {
    const buffer = await this.exportService.exportHotspotVouchersExcel({ status, profileId });
    res!.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res!.setHeader('Content-Disposition', `attachment; filename="vouchers-${Date.now()}.xlsx"`);
    res!.send(buffer);
  }

  @Get('hotspot-rekap/excel')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Export hotspot voucher rekap to Excel' })
  async hotspotRekapExcel(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string, @Query('agentId') agentId?: string, @Res() res?: Response) {
    const buffer = await this.exportService.exportHotspotRekapExcel({ startDate, endDate, agentId });
    res!.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res!.setHeader('Content-Disposition', `attachment; filename="rekap-voucher-${Date.now()}.xlsx"`);
    res!.send(buffer);
  }
}
