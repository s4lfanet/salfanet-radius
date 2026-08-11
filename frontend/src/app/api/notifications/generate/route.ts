import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { NotificationService } from '@/server/services/notifications/dispatcher.service';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Handle empty body - default to 'all'
    let type = 'all';
    try {
      const body = await request.json();
      type = body.type || 'all';
    } catch {
      // Empty body, use default
    }

    let count = 0;

    if (type === 'overdue_invoices' || type === 'all') {
      count += await NotificationService.checkOverdueInvoices();
    }

    if (type === 'expired_users' || type === 'all') {
      count += await NotificationService.checkExpiredUsers();
    }

    if (type === 'pending_registrations' || type === 'all') {
      count += await NotificationService.checkPendingRegistrations();
    }

    if (type === 'test') {
      // Create test notifications
      await NotificationService.create({
        type: 'system_alert',
        title: 'Test Notification',
        message: 'This is a test notification to verify the system is working',
        link: '/admin',
      });
      count = 1;
    }

    return NextResponse.json({
      success: true,
      message: `Generated ${count} notification(s)`,
      count,
    });
  } catch (error: any) {
    console.error('Generate notifications error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
