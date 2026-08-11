import { Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from '../auth/permissions.service';

@Module({
  controllers: [PermissionsController],
  // PermissionsService is provided by AuthModule which is already imported globally
})
export class PermissionsModule {}
