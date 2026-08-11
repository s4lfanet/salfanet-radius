import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsService } from '../../modules/auth/permissions.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AdminJwtPayload } from '../../modules/auth/auth.service';

/**
 * PermissionsGuard — checks if the authenticated user has required permissions.
 *
 * Must be used AFTER AdminGuard (which sets request.user).
 *
 * Usage:
 *   @UseGuards(AdminGuard, PermissionsGuard)
 *   @Permissions('users.view')
 *   @Get('users')
 *   getUsers() { ... }
 *
 * Super Admin bypasses all permission checks.
 * If no @Permissions() decorator is set, only authentication is required.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no permissions required, allow (auth already checked by AdminGuard)
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AdminJwtPayload;
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Super Admin bypasses all permission checks
    const isSuper = await this.permissionsService.isSuperAdmin(user.sub);
    if (isSuper) {
      return true;
    }

    // Check if user has ANY of the required permissions
    const hasAccess = await this.permissionsService.hasAnyPermission(
      user.sub,
      requiredPermissions,
    );

    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
