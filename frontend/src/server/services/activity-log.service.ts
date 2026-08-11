import 'server-only'
import { prisma } from '@/server/db/client';
import { NextRequest } from 'next/server';
import { nowWIB } from '@/lib/timezone';

export type ActivityModule = 
  | 'pppoe'
  | 'hotspot'
  | 'voucher'
  | 'invoice'
  | 'payment'
  | 'agent'
  | 'session'
  | 'transaction'
  | 'system'
  | 'network'
  | 'whatsapp'
  | 'genieacs'
  | 'settings'
  | 'user'
  | 'auth';

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
  metadata?: Record<string, any>;
  request?: NextRequest;
}

/**
 * Log user activity to database
 */
export async function logActivity(params: LogActivityParams) {
  try {
    const {
      userId,
      username,
      userRole,
      action,
      description,
      module,
      status = 'success',
      ipAddress,
      metadata,
      request,
    } = params;

    // Get IP address from request if not provided
    let ip = ipAddress;
    if (!ip && request) {
      ip = request.headers.get('x-forwarded-for') || 
           request.headers.get('x-real-ip') || 
           'unknown';
    }

    await prisma.activityLog.create({
      data: {
        userId,
        username,
        userRole,
        action,
        description,
        module,
        status,
        ipAddress: ip,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });

    console.log(`[Activity] ${username} - ${action} (${module}) - ${status}`);

    // Create notifications for various activities
    if (module === 'system' && status === 'error' && 
        ['health_check', 'auto_restart_failed', 'backup_failed', 'database_error'].includes(action)) {
      try {
        await prisma.notification.create({
          data: {
            type: 'system_alert',
            title: 'Peringatan Sistem',
            message: description,
            link: '/admin/settings/system',
            createdAt: nowWIB(),
          },
        });
      } catch (notifError) {
        console.error('[System Alert Notification Error]', notifError);
      }
    }

    // Create notification for suspicious activities
    if (status === 'warning' && module === 'auth' && 
        ['failed_login_attempts', 'concurrent_sessions', 'unusual_location'].includes(action)) {
      try {
        const { NotificationService } = await import('@/server/services/notifications/dispatcher.service')
        await NotificationService.notifySuspiciousActivity({
          username,
          activity: description,
          ipAddress: ip
        })
      } catch (notifError) {
        console.error('[Security Alert Notification Error]', notifError);
      }
    }
  } catch (error) {
    console.error('[Activity Log Error]', error);
    // Don't throw error to prevent activity logging from breaking the main flow
  }
}

/**
 * Get recent activities for dashboard
 */
export async function getRecentActivities(limit: number = 10) {
  try {
    const activities = await prisma.activityLog.findMany({
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
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

    return activities.map((activity: any) => ({
      id: activity.id,
      user: activity.username,
      action: activity.description,
      time: activity.createdAt.toISOString(),
      status: activity.status as 'success' | 'warning' | 'error',
      module: activity.module,
    }));
  } catch (error) {
    console.error('[Get Activities Error]', error);
    return [];
  }
}

/**
 * Get activities by module
 */
export async function getActivitiesByModule(module: ActivityModule, limit: number = 20) {
  try {
    return await prisma.activityLog.findMany({
      where: { module },
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    });
  } catch (error) {
    console.error('[Get Activities By Module Error]', error);
    return [];
  }
}

/**
 * Get activities by user
 */
export async function getActivitiesByUser(userId: string, limit: number = 20) {
  try {
    return await prisma.activityLog.findMany({
      where: { userId },
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    });
  } catch (error) {
    console.error('[Get Activities By User Error]', error);
    return [];
  }
}

/**
 * Clean old activities (keep last N days)
 */
export async function cleanOldActivities(daysToKeep: number = 30) {
  const startedAt = new Date();
  const { nanoid } = await import('nanoid');
  
  // Create history record in database
  const history = await prisma.cronHistory.create({
    data: {
      id: nanoid(),
      jobType: 'activity_log_cleanup',
      status: 'running',
      startedAt,
    },
  });

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await prisma.activityLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    console.log(`[Activity] Cleaned ${result.count} old activities`);
    
    // Update history with success
    const completedAt = new Date();
    await prisma.cronHistory.update({
      where: { id: history.id },
      data: {
        status: 'success',
        completedAt,
        duration: completedAt.getTime() - startedAt.getTime(),
        result: `Cleaned ${result.count} old activities (older than ${daysToKeep} days)`,
      },
    });
    
    return {
      success: true,
      deleted: result.count,
      message: `Cleaned ${result.count} old activities (older than ${daysToKeep} days)`
    };
  } catch (error: any) {
    console.error('[Clean Activities Error]', error);
    
    // Update history with error
    const completedAt = new Date();
    await prisma.cronHistory.update({
      where: { id: history.id },
      data: {
        status: 'error',
        completedAt,
        duration: completedAt.getTime() - startedAt.getTime(),
        error: error.message,
      },
    });
    
    return {
      success: false,
      deleted: 0,
      error: error.message
    };
  }
}
