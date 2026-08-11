import { Module } from '@nestjs/common';
import { AgentPortalController } from './agent-portal.controller';
import { AgentPortalService } from './agent-portal.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AgentPortalController],
  providers: [AgentPortalService],
})
export class AgentPortalModule {}
