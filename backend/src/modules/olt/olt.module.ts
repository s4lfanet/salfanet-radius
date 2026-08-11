import { Module } from '@nestjs/common';
import { OltController } from './olt.controller';
import { OltService } from './olt.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [OltController],
  providers: [OltService],
})
export class OltModule {}
