import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type ActivityModule =
  | 'pppoe' | 'hotspot' | 'voucher' | 'invoice' | 'payment'
  | 'agent' | 'session' | 'transaction' | 'system' | 'network'
  | 'whatsapp' | 'genieacs' | 'settings' | 'user' | 'auth';

export type ActivityStatus = 'success' | 'warning' | 'error';

interface LogActivityParams {
  userId?: string;
  username: string;
  userRole?: string;
  action: string;
  description: string;
  module: ActivityModule;
  status?: ActivityStatus;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Activity Log Service — ported from frontend src/server/services/activity-log.service.ts
 */
@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logActivity(params: LogActivityParams): Promise<void> {
    try {
      await this.prisma.activityLog.create({
        data: {
          id: crypto.randomUUID(),
          userId: params.userId || null,
          username: params.username,
          userRole: params.userRole as never,
          action: params.action,
          description: params.description,
          module: params.module as never,
          status: params.status || 'success',
          ipAddress: params.ipAddress || null,
          createdAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error('Activity log error:', error);
    }
  }

  async getRecentActivities(limit: number = 10) {
    try {
      const activities = await this.prisma.activityLog.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          username: true,
          action: true,
          description: true,
          module: true,
          status: true,
          createdAt: true,
        },
      });

      return activities.map((activity) => ({
        id: activity.id,
        user: activity.username,
        action: activity.description,
        time: activity.createdAt.toISOString(),
        status: activity.status as 'success' | 'warning' | 'error',
        module: activity.module,
      }));
    } catch (error) {
      this.logger.error('Get activities error:', error);
      return [];
    }
  }
}
