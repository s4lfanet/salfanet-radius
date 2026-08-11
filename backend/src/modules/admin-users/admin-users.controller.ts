import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminUsersService } from './admin-users.service';
import { AdminGuard } from '../../common/guards/admin.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@ApiTags('admin-users')
@Controller('admin/users')
@UseGuards(AdminGuard, PermissionsGuard)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @ApiBearerAuth()
  @Permissions('users.view')
  @ApiOperation({ summary: 'Get all admin users' })
  async getAdminUsers() {
    return this.adminUsersService.getAdminUsers();
  }

  @Get(':id')
  @ApiBearerAuth()
  @Permissions('users.view')
  @ApiOperation({ summary: 'Get admin user by ID' })
  async getAdminUser(@Param('id') id: string) {
    return this.adminUsersService.getAdminUserById(id);
  }

  @Post()
  @ApiBearerAuth()
  @Permissions('users.create')
  @ApiOperation({ summary: 'Create new admin user' })
  async createAdminUser(@Body() body: Record<string, unknown>) {
    return this.adminUsersService.createAdminUser(body as never);
  }

  @Put(':id')
  @ApiBearerAuth()
  @Permissions('users.manage')
  @ApiOperation({ summary: 'Update admin user' })
  async updateAdminUser(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.adminUsersService.updateAdminUser(id, body as never);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @Permissions('users.manage')
  @ApiOperation({ summary: 'Delete admin user (cannot delete Super Admin)' })
  async deleteAdminUser(@Param('id') id: string) {
    return this.adminUsersService.deleteAdminUser(id);
  }

  @Post(':id/reset-permissions')
  @ApiBearerAuth()
  @Permissions('users.manage')
  @ApiOperation({ summary: 'Reset user permissions to role template' })
  async resetPermissions(@Param('id') id: string) {
    return this.adminUsersService.resetPermissions(id);
  }
}
