import { Module } from '@nestjs/common';
import { PaymentGatewayController } from './payment-gateway.controller';
import { PaymentCreateService } from './payment-create.service';
import { PaymentWebhookService } from './payment-webhook.service';
import { ActivityLogModule } from '../activity-log/activity-log.module';

@Module({
  imports: [ActivityLogModule],
  controllers: [PaymentGatewayController],
  providers: [PaymentCreateService, PaymentWebhookService],
})
export class PaymentGatewayModule {}
