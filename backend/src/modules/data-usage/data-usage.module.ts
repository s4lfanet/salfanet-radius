import { Module } from '@nestjs/common';
import { DataUsageController } from './data-usage.controller';
import { DataUsageService } from './data-usage.service';

@Module({
  controllers: [DataUsageController],
  providers: [DataUsageService],
})
export class DataUsageModule {}
