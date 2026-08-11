import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { TOTP } from 'otpauth';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionsService } from './permissions.service';
import { LoginDto, TwoFactorVerifyDto } from './dto/auth.dto';

export interface AdminJwtPayload {
  sub: string; // user id
  username: string;
  role: string;
  email?: string | null;
  name?: string | null;
}

export interface AgentJwtPayload {
  agentId: string;
  phone: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly permissionsService: PermissionsService,
  ) {}

  /**
   * Validate admin credentials (step 1 of login)
   * Returns 2FA pending token if 2FA enabled, or full user if not.
   */
  async validateAdminCredentials(dto: LoginDto): Promise<{
    requiresTwoFactor: boolean;
    twoFactorToken?: string;
    user?: AdminJwtPayload;
  }> {
    const user = await this.prisma.adminUser.findUnique({
      where: { username: dto.username },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid username or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    const isValid = await bcrypt.compare(dto.password, user.password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid username or password');
    }

    // 2FA gate
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      await this.prisma.adminTwoFactorPending.create({
        data: {
          id: crypto.randomUUID(),
          token,
          userId: user.id,
          expiresAt,
        },
      });

      return { requiresTwoFactor: true, twoFactorToken: token };
    }

    // No 2FA — update last login and return user
    await this.prisma.adminUser.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    await this.logLoginActivity(user.id, user.username, user.role, false);

    return {
      requiresTwoFactor: false,
      user: {
        sub: user.id,
        username: user.username,
        role: user.role,
        email: user.email,
        name: user.name,
      },
    };
  }

  /**
   * Verify 2FA code (step 2 of login)
   */
  async verifyTwoFactor(dto: TwoFactorVerifyDto): Promise<AdminJwtPayload> {
    const pending = await this.prisma.adminTwoFactorPending.findUnique({
      where: { token: dto.tfaToken },
    });

    if (!pending || pending.expiresAt < new Date()) {
      throw new UnauthorizedException('2FA session expired. Please log in again.');
    }

    const user = await this.prisma.adminUser.findUnique({
      where: { id: pending.userId },
    });

    if (!user || !user.twoFactorSecret) {
      throw new UnauthorizedException('Invalid 2FA session.');
    }

    const totp = new TOTP({
      secret: user.twoFactorSecret,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });
    const delta = totp.validate({ token: dto.tfaCode.replace(/\s/g, ''), window: 1 });
    if (delta === null) {
      throw new UnauthorizedException('Invalid authenticator code. Please try again.');
    }

    // Consume pending token
    await this.prisma.adminTwoFactorPending.delete({ where: { token: dto.tfaToken } });

    // Update last login
    await this.prisma.adminUser.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    await this.logLoginActivity(user.id, user.username, user.role, true);

    return {
      sub: user.id,
      username: user.username,
      role: user.role,
      email: user.email,
      name: user.name,
    };
  }

  /**
   * Generate JWT token for admin user
   */
  async generateAdminToken(payload: AdminJwtPayload): Promise<string> {
    const secret = this.configService.get<string>('NEXTAUTH_SECRET');
    const maxAge = 30 * 24 * 60 * 60; // 30 days — matches NextAuth config

    return this.jwtService.signAsync(payload, {
      secret,
      expiresIn: maxAge,
    });
  }

  /**
   * Verify admin JWT token (for NextAuth cookie compatibility)
   */
  async verifyAdminToken(token: string): Promise<AdminJwtPayload | null> {
    try {
      const secret = this.configService.get<string>('NEXTAUTH_SECRET');
      const payload = await this.jwtService.verifyAsync<AdminJwtPayload>(token, { secret });

      // Verify user still exists and is active
      const user = await this.prisma.adminUser.findUnique({
        where: { id: payload.sub },
        select: { id: true, username: true, email: true, name: true, role: true, isActive: true },
      });

      if (!user || !user.isActive) {
        return null;
      }

      return {
        sub: user.id,
        username: user.username,
        role: user.role,
        email: user.email,
        name: user.name,
      };
    } catch {
      return null;
    }
  }

  /**
   * Sign agent JWT token (7 day expiry — matches frontend config)
   */
  async signAgentToken(agentId: string, phone: string): Promise<string> {
    const secret = this.getAgentJwtSecret();
    return this.jwtService.signAsync(
      { agentId, phone } satisfies AgentJwtPayload,
      { secret, expiresIn: '7d' },
    );
  }

  /**
   * Verify agent JWT token
   */
  async verifyAgentToken(token: string): Promise<AgentJwtPayload | null> {
    try {
      const secret = this.getAgentJwtSecret();
      const payload = await this.jwtService.verifyAsync<AgentJwtPayload>(token, { secret });
      if (typeof payload.agentId !== 'string' || typeof payload.phone !== 'string') return null;
      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Sign technician JWT token
   */
  async signTechnicianToken(technicianId: string, username: string): Promise<string> {
    const secret = this.configService.get<string>(
      'JWT_SECRET',
      'your-secret-key-change-this-in-production',
    );
    return this.jwtService.signAsync(
      { technicianId, username },
      { secret, expiresIn: '7d' },
    );
  }

  /**
   * Verify technician JWT token
   */
  async verifyTechnicianToken(token: string): Promise<{
    technicianId: string;
    username: string;
  } | null> {
    try {
      const secret = this.configService.get<string>(
        'JWT_SECRET',
        'your-secret-key-change-this-in-production',
      );
      const payload = await this.jwtService.verifyAsync(token, { secret });
      if (typeof payload.technicianId !== 'string') return null;
      return payload as { technicianId: string; username: string };
    } catch {
      return null;
    }
  }

  /**
   * Verify customer Bearer token (customerSession table)
   */
  async verifyCustomerToken(token: string): Promise<{
    userId: string;
    sessionId: string;
  } | null> {
    const session = await this.prisma.customerSession.findFirst({
      where: {
        token,
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) return null;

    return {
      userId: session.userId,
      sessionId: session.id,
    };
  }

  /**
   * Get current admin user data (for /auth/me endpoint)
   */
  async getAdminUser(userId: string) {
    const user = await this.prisma.adminUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        phone: true,
        lastLogin: true,
        twoFactorEnabled: true,
      },
    });

    if (!user) return null;

    const permissions = await this.permissionsService.getUserPermissions(userId);

    return {
      ...user,
      permissions,
    };
  }

  private getAgentJwtSecret(): string {
    const secret = this.configService.get<string>('AGENT_JWT_SECRET');
    if (!secret || secret.length < 32) {
      this.logger.warn(
        'AGENT_JWT_SECRET not configured or too short. Using fallback dev secret.',
      );
      return 'dev-agent-secret-change-in-production-please-set-env!!';
    }
    return secret;
  }

  private async logLoginActivity(
    userId: string,
    username: string,
    role: string,
    isTwoFactor: boolean,
  ): Promise<void> {
    try {
      await this.prisma.activityLog.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          username,
          userRole: role as never,
          action: 'LOGIN',
          description: `User logged in${isTwoFactor ? ' (2FA)' : ''}: ${username} (${role})`,
          module: 'auth',
          status: 'success',
          createdAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error('Activity log error:', error);
    }
  }
}
