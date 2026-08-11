import { Body, Controller, Get, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService, AdminJwtPayload } from './auth.service';
import { PermissionsService } from './permissions.service';
import { LoginDto, TwoFactorVerifyDto } from './dto/auth.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('auth')
@Controller('auth')
@UseGuards(AdminGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly permissionsService: PermissionsService,
  ) {}

  /**
   * Admin login — step 1 (credentials) + step 2 (2FA if enabled)
   */
  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Admin login with username/password' })
  @ApiResponse({ status: 200, description: 'Login successful or 2FA required' })
  async login(@Body() dto: LoginDto) {
    const result = await this.authService.validateAdminCredentials(dto);

    if (result.requiresTwoFactor) {
      return {
        success: true,
        requiresTwoFactor: true,
        tfaToken: result.twoFactorToken,
        message: 'Two-factor authentication required',
      };
    }

    const token = await this.authService.generateAdminToken(result.user!);

    return {
      success: true,
      requiresTwoFactor: false,
      token,
      user: {
        id: result.user!.sub,
        username: result.user!.username,
        role: result.user!.role,
        name: result.user!.name,
        email: result.user!.email,
      },
    };
  }

  /**
   * Admin 2FA verification — step 2
   */
  @Public()
  @Post('verify-2fa')
  @ApiOperation({ summary: 'Verify 2FA code and complete login' })
  async verifyTwoFactor(@Body() dto: TwoFactorVerifyDto) {
    const payload = await this.authService.verifyTwoFactor(dto);
    const token = await this.authService.generateAdminToken(payload);

    return {
      success: true,
      token,
      user: {
        id: payload.sub,
        username: payload.username,
        role: payload.role,
        name: payload.name,
        email: payload.email,
      },
    };
  }

  /**
   * Get current authenticated user info
   */
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated admin user' })
  async getMe(@CurrentUser() user: AdminJwtPayload) {
    const adminUser = await this.authService.getAdminUser(user.sub);
    if (!adminUser) {
      throw new UnauthorizedException('User not found');
    }
    return adminUser;
  }

  /**
   * Get current user's permissions
   */
  @Get('permissions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user permissions' })
  async getMyPermissions(@CurrentUser() user: AdminJwtPayload) {
    const permissions = await this.permissionsService.getUserPermissions(user.sub);
    const isSuperAdmin = await this.permissionsService.isSuperAdmin(user.sub);

    return {
      permissions,
      isSuperAdmin,
      role: user.role,
    };
  }

  /**
   * Verify token (for external services / frontend to check if token is valid)
   */
  @Get('verify')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify if current token is valid' })
  async verifyToken(@CurrentUser() user: AdminJwtPayload) {
    return {
      valid: true,
      user: {
        id: user.sub,
        username: user.username,
        role: user.role,
      },
    };
  }

  /**
   * Logout (stateless JWT — client just discards token)
   */
  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout (stateless — client discards token)' })
  async logout() {
    return {
      success: true,
      message: 'Logged out successfully',
    };
  }
}
