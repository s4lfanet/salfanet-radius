import { Module } from '@nestjs/common';
import { EvoucherController } from './evoucher.controller';
import { EvoucherService } from './evoucher.service';

@Module({
  controllers: [EvoucherController],
  providers: [EvoucherService],
})
export class EvoucherModule {}
