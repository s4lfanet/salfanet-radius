import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Permission Service — ported from frontend src/server/auth/permissions.ts
 *
 * Logic:
 * 1. Check user's custom permissions first (userPermission table)
 * 2. If custom permissions exist, use only those (active ones)
 * 3. Otherwise, fallback to role template permissions (rolePermission table)
 */
@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all permission keys for a user
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    const user = await this.prisma.adminUser.findUnique({
      where: { id: userId },
      include: {
        userPermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!user) {
      return [];
    }

    // If user has custom permissions, use those
    if (user.userPermissions.length > 0) {
      return user.userPermissions
        .filter((up) => up.permission.isActive)
        .map((up) => up.permission.key);
    }

    // Otherwise, fallback to role template
    return this.getRolePermissions(user.role);
  }

  /**
   * Get default permissions for a role (template)
   */
  async getRolePermissions(role: string): Promise<string[]> {
    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { role: role as never },
      include: {
        permission: true,
      },
    });

    return rolePermissions
      .filter((rp) => rp.permission.isActive)
      .map((rp) => rp.permission.key);
  }

  /**
   * Check if a user has a specific permission
   */
  async hasPermission(userId: string, permissionKey: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.includes(permissionKey);
  }

  /**
   * Check if a user has ANY of the specified permissions
   */
  async hasAnyPermission(userId: string, permissionKeys: string[]): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    return permissionKeys.some((key) => permissions.includes(key));
  }

  /**
   * Check if a user has ALL of the specified permissions
   */
  async hasAllPermissions(userId: string, permissionKeys: string[]): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    return permissionKeys.every((key) => permissions.includes(key));
  }

  /**
   * Check if user is Super Admin (bypasses all permission checks)
   */
  async isSuperAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.adminUser.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    return user?.role === 'SUPER_ADMIN';
  }

  /**
   * Get all permissions grouped by category
   */
  async getAllPermissionsGrouped() {
    const permissions = await this.prisma.permission.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });

    const grouped: Record<string, typeof permissions> = {};
    for (const perm of permissions) {
      if (!grouped[perm.category]) {
        grouped[perm.category] = [];
      }
      grouped[perm.category].push(perm);
    }

    return grouped;
  }

  /**
   * Set custom permissions for a user (replaces all)
   */
  async setUserPermissions(userId: string, permissionKeys: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.userPermission.deleteMany({ where: { userId } });

      const permissions = await tx.permission.findMany({
        where: {
          key: { in: permissionKeys },
          isActive: true,
        },
      });

      const userPermissions = permissions.map((perm) => ({
        id: crypto.randomUUID(),
        userId,
        permissionId: perm.id,
      }));

      if (userPermissions.length > 0) {
        await tx.userPermission.createMany({ data: userPermissions });
      }
    });
  }

  /**
   * Reset user permissions to role template
   */
  async resetUserPermissionsToRole(userId: string): Promise<void> {
    await this.prisma.userPermission.deleteMany({ where: { userId } });
  }
}
