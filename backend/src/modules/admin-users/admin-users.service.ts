import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionsService } from '../auth/permissions.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  /**
   * Get all admin users — ported from /api/admin/users GET
   */
  async getAdminUsers() {
    const users = await this.prisma.adminUser.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, username: true, email: true, name: true, role: true,
        isActive: true, phone: true, createdAt: true, updatedAt: true, lastLogin: true,
        userPermissions: { select: { permission: { select: { key: true } } } },
      },
    });

    const usersWithPermissions = users.map((user) => ({
      ...user,
      permissions: user.userPermissions.map((up) => up.permission.key),
      userPermissions: undefined,
    }));

    return { success: true, users: usersWithPermissions };
  }

  /**
   * Create new admin user — ported from /api/admin/users POST
   */
  async createAdminUser(body: {
    username: string; email?: string; password: string; name?: string;
    role?: string; phone?: string; isActive?: boolean; permissions?: string[];
  }) {
    const { username, email, password, name, role, phone, isActive, permissions } = body;

    if (!username || !password) {
      throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
    }

    // Format phone number
    let formattedPhone = phone;
    if (phone) {
      const normalized = phone.replace(/\D/g, '');
      formattedPhone = normalized.startsWith('62')
        ? normalized
        : normalized.startsWith('0')
        ? '62' + normalized.substring(1)
        : '62' + normalized;
    }

    // Check if username already exists
    const existing = await this.prisma.adminUser.findUnique({ where: { username } });
    if (existing) {
      throw new HttpException('Username already exists', HttpStatus.BAD_REQUEST);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.adminUser.create({
      data: {
        id: crypto.randomUUID(),
        username,
        email: email || null,
        password: hashedPassword,
        name: name || username,
        role: (role as never) || ('OPERATOR' as never),
        phone: formattedPhone || null,
        isActive: isActive !== undefined ? isActive : true,
      },
      select: {
        id: true, username: true, email: true, name: true, role: true,
        isActive: true, phone: true, createdAt: true,
      },
    });

    // Add custom permissions if provided
    if (permissions && Array.isArray(permissions) && permissions.length > 0) {
      const permissionRecords = await this.prisma.permission.findMany({
        where: { key: { in: permissions } },
        select: { id: true },
      });
      await this.prisma.userPermission.createMany({
        data: permissionRecords.map((p) => ({
          id: crypto.randomUUID(),
          userId: user.id,
          permissionId: p.id,
        })),
      });
    }

    return { success: true, user: { ...user, permissions: permissions || [] } };
  }

  /**
   * Get single admin user by ID
   */
  async getAdminUserById(id: string) {
    const user = await this.prisma.adminUser.findUnique({
      where: { id },
      select: {
        id: true, username: true, email: true, name: true, role: true,
        isActive: true, phone: true, createdAt: true, updatedAt: true, lastLogin: true,
        twoFactorEnabled: true,
        userPermissions: { select: { permission: { select: { key: true } } } },
      },
    });

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    return {
      success: true,
      user: {
        ...user,
        permissions: user.userPermissions.map((up) => up.permission.key),
        userPermissions: undefined,
      },
    };
  }

  /**
   * Update admin user
   */
  async updateAdminUser(id: string, body: {
    email?: string; name?: string; role?: string; phone?: string;
    isActive?: boolean; password?: string; permissions?: string[];
  }) {
    const user = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const updateData: Record<string, unknown> = {};
    if (body.email !== undefined) updateData.email = body.email || null;
    if (body.name !== undefined) updateData.name = body.name;
    if (body.role !== undefined) updateData.role = body.role as never;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.phone !== undefined) {
      if (body.phone) {
        const normalized = body.phone.replace(/\D/g, '');
        updateData.phone = normalized.startsWith('62')
          ? normalized
          : normalized.startsWith('0')
          ? '62' + normalized.substring(1)
          : '62' + normalized;
      } else {
        updateData.phone = null;
      }
    }
    if (body.password) {
      updateData.password = await bcrypt.hash(body.password, 10);
    }

    const updated = await this.prisma.adminUser.update({
      where: { id },
      data: updateData,
      select: {
        id: true, username: true, email: true, name: true, role: true,
        isActive: true, phone: true, createdAt: true, updatedAt: true,
      },
    });

    // Update permissions if provided
    if (body.permissions !== undefined) {
      await this.permissionsService.setUserPermissions(id, body.permissions);
    }

    return { success: true, user: updated };
  }

  /**
   * Delete admin user
   */
  async deleteAdminUser(id: string) {
    const user = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    if (user.role === 'SUPER_ADMIN') {
      throw new HttpException('Cannot delete Super Admin user', HttpStatus.BAD_REQUEST);
    }

    await this.prisma.userPermission.deleteMany({ where: { userId: id } });
    await this.prisma.adminUser.delete({ where: { id } });
    return { success: true, message: 'User deleted successfully' };
  }

  /**
   * Reset user permissions to role template
   */
  async resetPermissions(id: string) {
    const user = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    await this.permissionsService.resetUserPermissionsToRole(id);
    const permissions = await this.permissionsService.getRolePermissions(user.role);
    return { success: true, message: 'Permissions reset to role template', permissions };
  }
}
