import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { EmailService } from '@/server/services/notifications/email.service';
import { requirePermission } from '@/server/middleware/api-auth';

export async function GET() {
  try {
    const authCheck = await requirePermission('settings.view');
    if (!authCheck.authorized) return authCheck.response;

    const settings = await prisma.emailSettings.findFirst();
    
    if (!settings) {
      return NextResponse.json({
        enabled: false,
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: '',
        smtpPassword: '',
        fromEmail: '',
        fromName: 'RADIUS Notification',
        notifyNewUser: true,
        notifyExpired: true,
        notifyInvoice: true,
        notifyPayment: true,
        reminderEnabled: true,
        reminderTime: '09:00',
        reminderDays: '7,3,1',
      });
    }

    // Don't send password to client
    const { smtpPassword, ...rest } = settings;
    return NextResponse.json({
      ...rest,
      smtpPassword: '********', // Masked
    });
  } catch (error: any) {
    console.error('Get email settings error:', error);
    return NextResponse.json(
      { error: 'Failed to get email settings', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authCheck = await requirePermission('settings.edit');
    if (!authCheck.authorized) return authCheck.response;

    const body = await request.json();
    let {
      enabled,
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUser,
      smtpPassword,
      fromEmail,
      fromName,
      notifyNewUser,
      notifyExpired,
      notifyInvoice,
      notifyPayment,
      reminderEnabled,
      reminderTime,
      reminderDays,
    } = body;

    // Clean password - remove all whitespace (common issue with copy-paste)
    if (smtpPassword && smtpPassword !== '********') {
      smtpPassword = smtpPassword.replace(/\s+/g, '');
    }

    // Validation
    if (!smtpHost || !smtpPort || !smtpUser || !fromEmail) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if settings exist
    const existing = await prisma.emailSettings.findFirst();

    const data = {
      enabled: enabled ?? false,
      smtpHost,
      smtpPort: parseInt(smtpPort),
      smtpSecure: smtpSecure ?? false,
      smtpUser,
      fromEmail,
      fromName: fromName || 'RADIUS Notification',
      notifyNewUser: notifyNewUser ?? true,
      notifyExpired: notifyExpired ?? true,
      notifyInvoice: notifyInvoice ?? true,
      notifyPayment: notifyPayment ?? true,
      reminderEnabled: reminderEnabled ?? true,
      reminderTime: reminderTime || '09:00',
      reminderDays: reminderDays || '7,3,1',
    };

    // Only update password if it's not masked
    if (smtpPassword && smtpPassword !== '********') {
      Object.assign(data, { smtpPassword });
    }

    let settings;
    if (existing) {
      settings = await prisma.emailSettings.update({
        where: { id: existing.id },
        data,
      });
    } else {
      // For new settings, password is required
      if (!smtpPassword || smtpPassword === '********') {
        return NextResponse.json(
          { error: 'SMTP password is required' },
          { status: 400 }
        );
      }

      settings = await prisma.emailSettings.create({
        data: {
          id: Math.random().toString(36).substring(2, 15),
          ...data,
          smtpPassword,
        },
      });
    }

    // Don't send password to client
    const { smtpPassword: _, ...rest } = settings;
    return NextResponse.json({
      ...rest,
      smtpPassword: '********',
    });
  } catch (error: any) {
    console.error('Save email settings error:', error);
    return NextResponse.json(
      { error: 'Failed to save email settings', details: error.message },
      { status: 500 }
    );
  }
}
