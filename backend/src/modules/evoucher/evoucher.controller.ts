import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { EvoucherService } from './evoucher.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('evoucher')
@Controller('evoucher')
export class EvoucherController {
  constructor(private readonly evoucherService: EvoucherService) {}

  @Public()
  @Get('profiles')
  @ApiOperation({ summary: 'List e-voucher profiles (public)' })
  async listProfiles() {
    return this.evoucherService.listProfiles();
  }

  @Public()
  @Get('order/:token')
  @ApiOperation({ summary: 'Get voucher order by payment token (public)' })
  async getOrderByToken(@Param('token') token: string) {
    return this.evoucherService.getOrderByToken(token);
  }

  @Public()
  @Post('purchase')
  @ApiOperation({ summary: 'Create e-voucher purchase order (public)' })
  async createPurchase(@Body() body: {
    profileId: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    notificationMethod?: string;
    quantity?: number;
  }) {
    return this.evoucherService.createPurchase(body);
  }
}
