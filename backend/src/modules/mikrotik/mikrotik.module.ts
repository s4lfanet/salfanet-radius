import { Module } from '@nestjs/common';
import { MikrotikController } from './mikrotik.controller';
import { MikrotikService } from './mikrotik.service';

@Module({
  controllers: [MikrotikController],
  providers: [MikrotikService],
})
export class MikrotikModule {}
