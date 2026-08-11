import { Module } from '@nestjs/common';
import { NetworkInfraController } from './network-infra.controller';
import { NetworkInfraService } from './network-infra.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [NetworkInfraController],
  providers: [NetworkInfraService],
})
export class NetworkInfraModule {}
