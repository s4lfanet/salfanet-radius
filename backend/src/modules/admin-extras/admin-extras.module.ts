import { Module } from '@nestjs/common';
import { AdminExtrasController } from './admin-extras.controller';
import { AdminExtrasService } from './admin-extras.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AdminExtrasController],
  providers: [AdminExtrasService],
})
export class AdminExtrasModule {}
