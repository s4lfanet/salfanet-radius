import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../../modules/auth/auth.service';

/**
 * AgentGuard — authenticates agents via Bearer JWT.
 * Token is signed with AGENT_JWT_SECRET (7 day expiry).
 *
 * Usage:
 *   @UseGuards(AgentGuard)
 *   @Get('sales')
 *   getSales(@AgentUser() agent: AgentJwtPayload) { ... }
 */
@Injectable()
export class AgentGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Authorization header required');
    }

    const payload = await this.authService.verifyAgentToken(token);
    if (!payload) {
      throw new UnauthorizedException('Invalid or expired agent token');
    }

    (request as any).agent = payload;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return undefined;
  }
}
