import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { ExportService } from './export.service';
import { MikrotikModule } from '../mikrotik/mikrotik.module';
import { SessionSyncModule } from '../session-sync/session-sync.module';

@Module({
  imports: [MikrotikModule, SessionSyncModule],
  controllers: [SessionsController],
  providers: [SessionsService, ExportService],
  exports: [ExportService],
})
export class SessionsModule {}
