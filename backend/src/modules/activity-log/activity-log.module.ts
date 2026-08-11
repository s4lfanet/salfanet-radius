import { Module } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';

@Module({
  providers: [ActivityLogService],
  exports: [ActivityLogService],
})
export class ActivityLogModule {}
