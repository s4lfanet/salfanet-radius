import { Module } from '@nestjs/common';
import { ManualPaymentsController } from './manual-payments.controller';
import { ManualPaymentsService } from './manual-payments.service';
import { ActivityLogModule } from '../activity-log/activity-log.module';

@Module({
  imports: [ActivityLogModule],
  controllers: [ManualPaymentsController],
  providers: [ManualPaymentsService],
})
export class ManualPaymentsModule {}
