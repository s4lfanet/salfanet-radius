import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();
  try {
    const { searchParams } = request.nextUrl;
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '10');
    const sinceParam = searchParams.get('since');

    // Build where clause
    const where: any = {};
    if (unreadOnly) where.isRead = false;
    if (type) where.type = type;
    if (sinceParam) where.createdAt = { gte: new Date(sinceParam) };

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    const unreadCount = await prisma.notification.count({
      where: { isRead: false },
    });

    // Get category counts
    const allNotifications = await prisma.notification.groupBy({
      by: ['type'],
      _count: {
        id: true,
      },
    });

    const categoryCounts: Record<string, number> = {};
    allNotifications.forEach((item) => {
      categoryCounts[item.type] = item._count.id;
    });

    return ok({ success: true, notifications, unreadCount, categoryCounts });
  } catch (error: unknown) {
    console.error('Get notifications error:', error);
    return serverError();
  }
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();
  try {
    const { notificationIds, markAll } = await request.json();

    if (markAll) {
      // Mark all as read
      await prisma.notification.updateMany({
        where: { isRead: false },
        data: { isRead: true },
      });
    } else if (notificationIds && Array.isArray(notificationIds)) {
      // Mark specific notifications as read
      await prisma.notification.updateMany({
        where: {
          id: { in: notificationIds },
        },
        data: { isRead: true },
      });
    } else {
      return badRequest('Invalid request: supply notificationIds[] or markAll');
    }

    return ok({ message: 'Notifications marked as read' });
  } catch (error: unknown) {
    console.error('Update notifications error:', error);
    return serverError();
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();
  try {
    const { searchParams } = request.nextUrl;
    const id = searchParams.get('id');
    const ids = searchParams.get('ids');

    // Bulk delete
    if (ids) {
      const idArray = ids.split(',').filter(Boolean);
      
      if (idArray.length === 0) return badRequest('No IDs provided');

      await prisma.notification.deleteMany({ where: { id: { in: idArray } } });
      return ok({ message: `${idArray.length} notifications deleted`, count: idArray.length });
    }

    if (!id) return badRequest('Notification ID required');

    await prisma.notification.delete({ where: { id } });
    return ok({ message: 'Notification deleted' });
  } catch (error: unknown) {
    console.error('Delete notification error:', error);
    return serverError();
  }
}
