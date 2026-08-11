import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AdminJwtPayload } from '../../modules/auth/auth.service';

/**
 * Extract the authenticated admin user from the request.
 * Usage:
 *   @Get('me')
 *   @ApiBearerAuth()
 *   getMe(@CurrentUser() user: AdminJwtPayload) { ... }
 *
 * The user object is populated by AdminGuard and contains:
 *   { sub, username, role, email, name }
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AdminJwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AdminJwtPayload;
    return data ? user?.[data] : user;
  },
);
