import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { nanoid } from 'nanoid';
import { randomBytes } from 'crypto';
import { badRequest, unauthorized } from '@/lib/api-response';

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
 *   PREPAID   → user.expiredAt (the actual expiry already set on the user)
 *
 * Returns { generated, skipped, errors[] }
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

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

    // Helper: due date for POSTPAID = billingDay of targetMonth (clamped to days in month)
    const getDueDatePostpaid = (billingDay: number | null): Date => {
      const bd = billingDay ?? 1;
      const daysInMonth = new Date(year, month, 0).getDate(); // last day of targetMonth
      const day = Math.min(bd, daysInMonth);
      return new Date(year, month - 1, day, 23, 59, 59, 999);
    };

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

    // Month range for duplicate check: from 1st to last day of targetMonth
    const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    // Batch fetch existing invoices for this month (MONTHLY/RENEWAL type)
    const existingInvoices = await prisma.invoice.findMany({
      where: {
        userId: { in: users.map(u => u.id) },
        invoiceType: { in: ['MONTHLY', 'RENEWAL'] },
        dueDate: { gte: monthStart, lte: monthEnd },
        status: { not: 'CANCELLED' },
      },
      select: { userId: true },
    });
    const usersWithInvoice = new Set(existingInvoices.map(i => i.userId).filter(Boolean) as string[]);

    let generated = 0;
    let skipped = 0;
    const errors: { username: string; error: string }[] = [];

    for (const user of users) {
      try {
        // Skip if already has invoice for this month
        if (skipExisting && usersWithInvoice.has(user.id)) {
          skipped++;
          continue;
        }

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
          dueDate = user.expiredAt;
          invoiceType = 'RENEWAL';
        } else {
          // POSTPAID: due date = billingDay of targetMonth
          dueDate = getDueDatePostpaid((user as any).billingDay ?? null);
          invoiceType = 'MONTHLY';
        }

        // Calculate amount (apply PPN if enabled)
        const baseAmount = user.profile.price;
        let amount = baseAmount;
        let taxRate: number | null = null;
        if (user.profile.ppnActive && user.profile.ppnRate > 0) {
          taxRate = user.profile.ppnRate;
          amount = Math.round(baseAmount + (baseAmount * taxRate / 100));
        }

        const invoiceId = nanoid();
        const invoiceNumber = `INV-${year}${String(month).padStart(2, '0')}-${invoiceId.slice(0, 8).toUpperCase()}`;
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
      errors,
      message: `${generated} tagihan berhasil dibuat, ${skipped} dilewati${errors.length > 0 ? `, ${errors.length} gagal` : ''}`,
    });
  } catch (err) {
    console.error('[Generate Invoice] Error:', err);
    return NextResponse.json({ success: false, error: 'Gagal generate tagihan' }, { status: 500 });
  }
}
