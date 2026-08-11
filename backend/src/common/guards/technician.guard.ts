import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../../modules/auth/auth.service';

/**
 * TechnicianGuard — authenticates technicians via Bearer JWT.
 * Token is signed with JWT_SECRET (technician-secret.ts).
 *
 * Usage:
 *   @UseGuards(TechnicianGuard)
 *   @Get('assignments')
 *   getAssignments(@Req() req) { const { technicianId } = req.technician; }
 */
@Injectable()
export class TechnicianGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Authorization header required');
    }

    const payload = await this.authService.verifyTechnicianToken(token);
    if (!payload) {
      throw new UnauthorizedException('Invalid or expired technician token');
    }

    (request as any).technician = payload;
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
