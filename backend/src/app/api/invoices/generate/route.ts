import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { nanoid } from 'nanoid';
import { randomBytes } from 'crypto';
import { badRequest } from '@/lib/api-response';
import { generateInvoiceNumber } from '@/server/services/billing/invoice.service';
import {
  companyDate,
  companyMonthRange,
  postpaidDueDate,
  prepaidDueDate,
} from '@/server/services/billing/invoice-schedule';

/**
 * POST /api/invoices/generate
 *
 * Body:
 *   targetMonth : 'YYYY-MM'   — billing month (used for POSTPAID due date calculation)
 *   scope       : 'all' | 'single'
 *   userId?     : string       — required when scope='single'
 *   skipExisting: boolean      — skip users that already have invoice for that month (default: true)
 *   sendWa      : boolean      — send WA notification after generating (default: false)
 *
 * Due date logic:
 *   POSTPAID  → billingDay of targetMonth (or last day of month if billingDay > days in month)
 *   PREPAID   → the expiry date itself. Only customers whose expiry falls in
 *               targetMonth (or earlier and still unbilled) get a bill; one
 *               paid through a later month is skipped as "notDue".
 *
 * Returns { generated, skipped, notDue, errors[] }
 */
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission('invoices.create');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const body = await request.json();
    const { targetMonth, scope, userId, skipExisting = true, sendWa = false } = body;

    if (!targetMonth || !/^\d{4}-\d{2}$/.test(targetMonth)) {
      return badRequest('targetMonth harus format YYYY-MM');
    }
    if (!scope || !['all', 'single'].includes(scope)) {
      return badRequest('scope harus "all" atau "single"');
    }
    if (scope === 'single' && !userId) {
      return badRequest('userId diperlukan untuk scope=single');
    }

    const [year, month] = targetMonth.split('-').map(Number);


    // Build user query — include BOTH POSTPAID and PREPAID
    const userWhere: Record<string, unknown> = {
      status: { in: ['active', 'isolated'] },
    };
    if (scope === 'single') userWhere.id = userId;

    const users = await prisma.pppoeUser.findMany({
      where: userWhere,
      include: {
        profile: { select: { id: true, name: true, price: true, ppnActive: true, ppnRate: true } },
      },
    });

    if (users.length === 0) {
      return NextResponse.json({ success: true, generated: 0, skipped: 0, errors: [], message: 'Tidak ada pelanggan ditemukan' });
    }

    // Fetch company baseUrl for payment links
    const company = await prisma.company.findFirst({ select: { baseUrl: true, name: true, phone: true } });
    const baseUrl = company?.baseUrl || 'http://localhost:3000';

    const { end: targetEnd } = companyMonthRange(year, month);
    const monthKey = (d: Date) => {
      const c = companyDate(d);
      return `${c.year}-${c.month}`;
    };

    // Existing bills keyed by customer + due-date month (a PREPAID catch-up
    // bill can be due before targetMonth).
    const existingInvoices = await prisma.invoice.findMany({
      where: {
        userId: { in: users.map(u => u.id) },
        invoiceType: { in: ['MONTHLY', 'RENEWAL'] },
        dueDate: { lte: targetEnd },
        status: { not: 'CANCELLED' },
      },
      select: { userId: true, dueDate: true },
    });
    const billedMonths = new Set(existingInvoices.map(i => `${i.userId}:${monthKey(i.dueDate)}`));

    let generated = 0;
    let skipped = 0;
    let notDue = 0;
    const errors: { username: string; error: string }[] = [];

    for (const user of users) {
      try {
        if (!user.profile) {
          errors.push({ username: user.username, error: 'Paket tidak ditemukan' });
          continue;
        }

        // Determine due date based on subscription type
        const subscriptionType = (user as any).subscriptionType || 'POSTPAID';
        let dueDate: Date;
        let invoiceType: string;

        if (subscriptionType === 'PREPAID') {
          if (!user.expiredAt) {
            // PREPAID without expiredAt — skip, cannot determine due date
            skipped++;
            continue;
          }
          dueDate = prepaidDueDate(new Date(user.expiredAt));
          // Paid through a later month: no bill for targetMonth.
          if (dueDate > targetEnd) {
            notDue++;
            continue;
          }
          invoiceType = 'RENEWAL';
        } else {
          dueDate = postpaidDueDate(year, month, (user as any).billingDay);
          invoiceType = 'MONTHLY';
        }

        if (skipExisting && billedMonths.has(`${user.id}:${monthKey(dueDate)}`)) {
          skipped++;
          continue;
        }
        billedMonths.add(`${user.id}:${monthKey(dueDate)}`);

        // Calculate amount (apply user discount + PPN if enabled)
        const baseAmount = Math.max(0, user.profile.price - (user.discount || 0));
        let amount = baseAmount;
        let taxRate: number | null = null;
        if (user.profile.ppnActive && user.profile.ppnRate > 0) {
          taxRate = user.profile.ppnRate;
          amount = Math.round(baseAmount + (baseAmount * taxRate / 100));
        }

        const invoiceId = nanoid();
        const invoiceNumber = generateInvoiceNumber();
        const paymentToken = randomBytes(32).toString('hex');
        const paymentLink = `${baseUrl}/pay/${paymentToken}`;

        await prisma.invoice.create({
          data: {
            id: invoiceId,
            invoiceNumber,
            userId: user.id,
            amount,
            baseAmount,
            ...(taxRate !== null && { taxRate }),
            dueDate,
            status: 'PENDING',
            invoiceType: invoiceType as any,
            customerName: user.name,
            customerPhone: user.phone,
            customerEmail: user.email || null,
            customerUsername: user.username,
            paymentToken,
            paymentLink,
            createdAt: new Date(),
          },
        });

        // Optionally send WA notification
        if (sendWa && user.phone) {
          try {
            const { sendInvoiceReminder } = await import('@/server/services/notifications/whatsapp-templates.service');
            await sendInvoiceReminder({
              phone: user.phone,
              customerName: user.name,
              customerUsername: user.username,
              invoiceNumber,
              amount,
              dueDate,
              paymentLink,
              companyName: company?.name || '',
              companyPhone: company?.phone || '',
            });
          } catch {
            // WA failure is non-fatal
          }
        }

        generated++;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push({ username: user.username, error: errMsg });
      }
    }

    return NextResponse.json({
      success: true,
      generated,
      skipped,
      notDue,
      errors,
      message: `${generated} tagihan berhasil dibuat, ${skipped} dilewati${notDue > 0 ? `, ${notDue} prabayar belum jatuh tempo` : ''}${errors.length > 0 ? `, ${errors.length} gagal` : ''}`,
    });
  } catch (err) {
    console.error('[Generate Invoice] Error:', err);
    return NextResponse.json({ success: false, error: 'Gagal generate tagihan' }, { status: 500 });
  }
}
