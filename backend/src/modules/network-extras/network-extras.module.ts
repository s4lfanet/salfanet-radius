import { Module } from '@nestjs/common';
import { NetworkExtrasController } from './network-extras.controller';
import { NetworkExtrasService } from './network-extras.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [NetworkExtrasController],
  providers: [NetworkExtrasService],
})
export class NetworkExtrasModule {}
