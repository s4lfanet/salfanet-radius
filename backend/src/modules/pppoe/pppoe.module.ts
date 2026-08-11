import { Module } from '@nestjs/common';
import { PppoeController } from './pppoe.controller';
import { PppoeService } from './pppoe.service';
import { ActivityLogModule } from '../activity-log/activity-log.module';

@Module({
  imports: [ActivityLogModule],
  controllers: [PppoeController],
  providers: [PppoeService],
})
export class PppoeModule {}
