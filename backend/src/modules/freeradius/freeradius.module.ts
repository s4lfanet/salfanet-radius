import { Module } from '@nestjs/common';
import { FreeradiusController } from './freeradius.controller';
import { FreeradiusService } from './freeradius.service';

@Module({
  controllers: [FreeradiusController],
  providers: [FreeradiusService],
  exports: [FreeradiusService],
})
export class FreeradiusModule {}
