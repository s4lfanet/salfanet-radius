import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionsService } from '../auth/permissions.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('permissions')
@Controller('permissions')
@UseGuards(AdminGuard)
export class PermissionsController {
  constructor(
    private readonly permissionsService: PermissionsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /api/v1/permissions — all permissions grouped by category
   */
  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all permissions grouped by category' })
  async getAllPermissions() {
    const grouped = await this.permissionsService.getAllPermissionsGrouped();
    return { success: true, permissions: grouped };
  }

  /**
   * GET /api/v1/permissions/role-templates — permission templates per role
   */
  @Get('role-templates')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get permission templates for all roles' })
  async getRoleTemplates() {
    const rolePermissions = await this.prisma.rolePermission.findMany({
      include: {
        permission: {
          select: {
            id: true,
            key: true,
            name: true,
            category: true,
          },
        },
      },
    });

    const templates: Record<string, string[]> = {
      SUPER_ADMIN: [],
      FINANCE: [],
      CUSTOMER_SERVICE: [],
      TECHNICIAN: [],
      MARKETING: [],
      VIEWER: [],
    };

    for (const rp of rolePermissions) {
      const role = rp.role as string;
      if (templates[role]) {
        templates[role].push(rp.permission.key);
      }
    }

    return { success: true, templates };
  }
}
