import { Module } from '@nestjs/common';
import { SessionSyncController } from './session-sync.controller';
import { SessionSyncService } from './session-sync.service';
import { FreeradiusModule } from '../freeradius/freeradius.module';
import { MikrotikModule } from '../mikrotik/mikrotik.module';

@Module({
  imports: [FreeradiusModule, MikrotikModule],
  controllers: [SessionSyncController],
  providers: [SessionSyncService],
  exports: [SessionSyncService],
})
export class SessionSyncModule {}
