import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('payment')
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Public()
  @Get('check-order')
  @ApiOperation({ summary: 'Check order status (invoice, topup, agent deposit)' })
  @ApiQuery({ name: 'orderId', required: true })
  async checkOrder(@Query('orderId') orderId: string) {
    return this.paymentService.checkOrder(orderId);
  }

  @Public()
  @Get('duitku-methods')
  @ApiOperation({ summary: 'Get Duitku payment methods' })
  @ApiQuery({ name: 'amount', required: false, type: Number })
  async getDuitkuMethods(@Query('amount') amount?: string) {
    return this.paymentService.getDuitkuMethods(amount ? parseInt(amount) : undefined);
  }
}
