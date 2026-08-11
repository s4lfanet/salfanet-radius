import { Body, Controller, Post, Req, HttpCode, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { PaymentCreateService } from './payment-create.service';
import { PaymentWebhookService } from './payment-webhook.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('payment-gateway')
@Controller('payment')
export class PaymentGatewayController {
  constructor(
    private readonly createService: PaymentCreateService,
    private readonly webhookService: PaymentWebhookService,
  ) {}

  @Public()
  @Post('create')
  @HttpCode(200)
  @ApiOperation({ summary: 'Create payment transaction (Midtrans/Xendit/Duitku/Tripay)' })
  async createPayment(@Body() body: Record<string, unknown>) {
    return this.createService.createPayment(body as never);
  }

  @Public()
  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Unified payment webhook (Midtrans/Xendit/Duitku/Tripay)' })
  async webhook(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const contentType = req.headers['content-type'] || '';
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers[key] = value;
    }

    const result = await this.webhookService.processWebhook(rawBody, contentType, headers);
    res.status(result.status);
    return result.body;
  }
}
