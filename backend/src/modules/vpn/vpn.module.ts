import { Module } from '@nestjs/common';
import { VpnController } from './vpn.controller';
import { VpnService } from './vpn.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [VpnController],
  providers: [VpnService],
})
export class VpnModule {}
