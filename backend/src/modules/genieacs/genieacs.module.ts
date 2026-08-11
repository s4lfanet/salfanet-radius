import { Module } from '@nestjs/common';
import { GenieacsController } from './genieacs.controller';
import { GenieacsService } from './genieacs.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [GenieacsController],
  providers: [GenieacsService],
})
export class GenieacsModule {}
