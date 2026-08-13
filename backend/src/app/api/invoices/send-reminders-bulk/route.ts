import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { sendInvoiceReminder } from '@/server/services/notifications/whatsapp-templates.service';

/**
 * POST /api/invoices/send-reminders-bulk
 * Send WA reminders for all PENDING/OVERDUE invoices.
 * Previously delegated to NestJS backend cron — now native Next.js.
 *
 * Body (optional):
 *   daysBefore: number — remind invoices due within X days (default: 7)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const daysBefore = body.daysBefore ?? 7;
    const now = new Date();
    const remindBefore = new Date(now.getTime() + daysBefore * 24 * 60 * 60 * 1000);

    // Find invoices needing reminders
    const invoices = await prisma.invoice.findMany({
      where: {
        status: { in: ['PENDING', 'OVERDUE'] },
        dueDate: { lte: remindBefore },
        customerPhone: { not: null },
      },
      select: {
        id: true, invoiceNumber: true, amount: true, dueDate: true, status: true,
        customerName: true, customerPhone: true, customerUsername: true,
        paymentLink: true, sentReminders: true,
      },
    });

    // Check WA provider
    const waProviders = await prisma.whatsapp_providers.findMany({ where: { isActive: true } });
    if (waProviders.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No active WhatsApp provider configured',
      }, { status: 400 });
    }

    const company = await prisma.company.findFirst({ select: { name: true, phone: true, baseUrl: true } });
    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const inv of invoices) {
      try {
        if (!inv.customerPhone) { skipped++; continue; }

        // Parse sentReminders to avoid duplicates
        let sentDays: number[] = [];
        try { sentDays = inv.sentReminders ? JSON.parse(inv.sentReminders) : []; } catch {}
        const daysUntilDue = Math.ceil((inv.dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        if (sentDays.includes(daysUntilDue)) { skipped++; continue; }

        await sendInvoiceReminder({
          phone: inv.customerPhone,
          customerName: inv.customerName || inv.customerUsername || 'Customer',
          customerUsername: inv.customerUsername || undefined,
          invoiceNumber: inv.invoiceNumber,
          amount: inv.amount,
          dueDate: inv.dueDate,
          paymentLink: inv.paymentLink || '',
          companyName: company?.name || '',
          companyPhone: company?.phone || '',
          isOverdue: inv.status === 'OVERDUE' || inv.dueDate < now,
          daysOverdue: inv.dueDate < now ? Math.ceil((now.getTime() - inv.dueDate.getTime()) / (24 * 60 * 60 * 1000)) : 0,
        });

        sentDays.push(daysUntilDue);
        await prisma.invoice.update({
          where: { id: inv.id },
          data: { sentReminders: JSON.stringify(sentDays) },
        });
        sent++;
      } catch (e: any) {
        errors.push(`${inv.invoiceNumber}: ${e?.message || e}`);
      }
    }

    return NextResponse.json({
      success: true,
      sent,
      skipped,
      total: invoices.length,
      errors,
      message: `${sent} reminder terkirim, ${skipped} dilewati`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to send bulk reminders' },
      { status: 500 }
    );
  }
}
