import { Module } from '@nestjs/common';
import { ExtrasController } from './extras.controller';
import { ExtrasService } from './extras.service';
import { AuthModule } from '../auth/auth.module';
import { PaymentGatewayModule } from '../payment-gateway/payment-gateway.module';

@Module({
  imports: [AuthModule, PaymentGatewayModule],
  controllers: [ExtrasController],
  providers: [ExtrasService],
})
export class ExtrasModule {}
