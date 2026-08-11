import { Module } from '@nestjs/common';
import { KeuanganController } from './keuangan.controller';
import { KeuanganService } from './keuangan.service';
import { ActivityLogModule } from '../activity-log/activity-log.module';

@Module({
  imports: [ActivityLogModule],
  controllers: [KeuanganController],
  providers: [KeuanganService],
})
export class KeuanganModule {}
