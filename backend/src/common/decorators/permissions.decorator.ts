import { SetMetadata } from '@nestjs/common';

/**
 * Required permission keys — checked by PermissionsGuard.
 * Usage:
 *   @Permissions('users.view')
 *   @Get('users')
 *   getUsers() { ... }
 *
 *   @Permissions('users.create', 'users.manage')  // ANY of these
 *   @Post('users')
 *   createUser() { ... }
 *
 * Super Admin bypasses all permission checks.
 */
export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);
