import { Module } from '@nestjs/common';
import { TechnicianPortalController } from './technician-portal.controller';
import { TechnicianPortalService } from './technician-portal.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [TechnicianPortalController],
  providers: [TechnicianPortalService],
})
export class TechnicianPortalModule {}
