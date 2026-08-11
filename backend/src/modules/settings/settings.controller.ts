import { Body, Controller, Get, Headers, HttpException, HttpStatus, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminJwtPayload } from '../auth/auth.service';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // ==================== Company (public) ====================

  @Public()
  @Get('company')
  @ApiOperation({ summary: 'Get company info for branding (public)' })
  async getCompanyPublic() {
    return this.settingsService.getCompanyPublic();
  }

  // ==================== Timezone ====================

  @Post('timezone')
  @ApiBearerAuth()
  @UseGuards(AdminGuard, PermissionsGuard)
  @Permissions('settings.manage')
  @ApiOperation({ summary: 'Update system timezone (Super Admin — modifies .env, MySQL, system)' })
  async updateTimezone(
    @Body() body: { timezone: string },
    @Headers('x-internal-call') internalCall?: string,
  ) {
    const isInternalCall = internalCall === 'true';
    return this.settingsService.updateTimezone(body.timezone, isInternalCall);
  }

  // ==================== Isolation ====================

  @Get('isolation')
  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get isolation settings' })
  async getIsolationSettings() {
    return this.settingsService.getIsolationSettings();
  }

  @Put('isolation')
  @ApiBearerAuth()
  @UseGuards(AdminGuard, PermissionsGuard)
  @Permissions('settings.manage')
  @ApiOperation({ summary: 'Update isolation settings (modifies radgroupreply + VPS routes)' })
  async updateIsolationSettings(@Body() body: Record<string, unknown>) {
    return this.settingsService.updateIsolationSettings(body as never);
  }

  // ==================== Map ====================

  @Public()
  @Get('map')
  @ApiOperation({ summary: 'Get map settings (public)' })
  async getMapSettings() {
    return this.settingsService.getMapSettings();
  }

  @Put('map')
  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update map settings' })
  async updateMapSettings(@Body() body: Record<string, unknown>) {
    return this.settingsService.updateMapSettings(body as never);
  }

  // ==================== Restart Services ====================

  @Public()
  @Get('restart-services')
  @ApiOperation({ summary: 'Get restart services status' })
  async getRestartServicesStatus() {
    return this.settingsService.getRestartServicesStatus();
  }

  @Post('restart-services')
  @ApiBearerAuth()
  @UseGuards(AdminGuard, PermissionsGuard)
  @Permissions('settings.manage')
  @ApiOperation({ summary: 'Restart PM2/FreeRADIUS services (Super Admin, Linux only)' })
  async restartServices(@Body() body: { services: string; delay?: number }) {
    return this.settingsService.restartServices(body.services, body.delay);
  }
}
