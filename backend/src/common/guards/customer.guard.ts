import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../../modules/auth/auth.service';

/**
 * CustomerGuard — authenticates PPPoE customers via Bearer token.
 * Token is verified against the customerSession table in the database.
 *
 * Usage:
 *   @UseGuards(CustomerGuard)
 *   @Get('profile')
 *   getProfile(@Req() req) { const { userId } = req.customer; }
 */
@Injectable()
export class CustomerGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Authorization token required');
    }

    const payload = await this.authService.verifyCustomerToken(token);
    if (!payload) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    (request as any).customer = payload;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }
    return undefined;
  }
}
