import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthService, AdminJwtPayload } from '../../modules/auth/auth.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * AdminGuard — authenticates admin users via JWT.
 *
 * Token sources (in priority order):
 * 1. Authorization: Bearer <token> header
 * 2. next-auth.session-token cookie (NextAuth JWT compatibility)
 *
 * The verified payload is attached to request.user as AdminJwtPayload.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();

    // Extract token from Authorization header or NextAuth cookie
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const payload = await this.authService.verifyAdminToken(token);
    if (!payload) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Attach user to request for downstream use
    (request as any).user = payload;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    // Method 1: Bearer token from Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Method 2: NextAuth session cookie
    // NextAuth stores JWT in cookies named:
    //   - next-auth.session-token (default)
    //   - __Secure-next-auth.session-token (HTTPS)
    const cookies = request.headers.cookie;
    if (cookies) {
      const cookieMap = this.parseCookies(cookies);
      const sessionToken =
        cookieMap['next-auth.session-token'] ||
        cookieMap['__Secure-next-auth.session-token'];
      if (sessionToken) {
        // NextAuth JWT token IS the raw JWT — return it directly
        return sessionToken;
      }
    }

    return undefined;
  }

  private parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    for (const part of cookieHeader.split(';')) {
      const [name, ...valueParts] = part.trim().split('=');
      if (name && valueParts.length > 0) {
        cookies[name] = valueParts.join('=');
      }
    }
    return cookies;
  }
}
