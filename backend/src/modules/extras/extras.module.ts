import { Module } from '@nestjs/common';
import { ExtrasController } from './extras.controller';
import { ExtrasService } from './extras.service';
import { AuthModule } from '../auth/auth.module';
import { PaymentGatewayModule } from '../payment-gateway/payment-gateway.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { EmailModule } from '../email/email.module';
import { GenieacsModule } from '../genieacs/genieacs.module';
import { MikrotikModule } from '../mikrotik/mikrotik.module';
import { ExportModule } from '../export/export.module';

@Module({
  imports: [AuthModule, PaymentGatewayModule, WhatsAppModule, EmailModule, GenieacsModule, MikrotikModule, ExportModule],
  controllers: [ExtrasController],
  providers: [ExtrasService],
})
export class ExtrasModule {}
