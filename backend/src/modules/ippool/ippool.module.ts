import { Module } from '@nestjs/common';
import { IppoolController } from './ippool.controller';
import { IppoolService } from './ippool.service';

@Module({
  controllers: [IppoolController],
  providers: [IppoolService],
})
export class IppoolModule {}
