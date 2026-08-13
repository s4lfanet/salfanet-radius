import 'server-only'
import { prisma } from '@/server/db/client';
import { NextRequest } from 'next/server';
import { nowWIB } from '@/lib/timezone';

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
  metadata?: Record<string, any>;
  request?: NextRequest;
}

/**
 * Log user activity to database (simplified for frontend auth only).
 * Full notification dispatch is handled by backend.
 */
export async function logActivity(params: LogActivityParams) {
  try {
    const { userId, username, userRole, action, description, module, status = 'success', ipAddress, metadata, request } = params;

    let ip = ipAddress;
    if (!ip && request) {
      ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined;
    }

    await prisma.activityLog.create({
      data: {
        userId: userId || null,
        username,
        userRole: userRole || null,
        action,
        description,
        module,
        status,
        ipAddress: ip || null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        createdAt: nowWIB(),
      },
    });
  } catch (error) {
    console.error('[ActivityLog] Failed to log:', error);
  }
}
