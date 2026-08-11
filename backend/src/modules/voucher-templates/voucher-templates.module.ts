import { Module } from '@nestjs/common';
import { VoucherTemplatesController } from './voucher-templates.controller';
import { VoucherTemplatesService } from './voucher-templates.service';

@Module({
  controllers: [VoucherTemplatesController],
  providers: [VoucherTemplatesService],
})
export class VoucherTemplatesModule {}
