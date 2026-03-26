import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { logActivity } from '@/server/services/activity-log.service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { formatWIB } from '@/lib/timezone';

// Generate secure random token for payment link
function generatePaymentToken(): string {
  return randomBytes(32).toString('hex');
}

// POST - Generate invoices for users expiring soon or already expired (but still active)
export async function POST(request: NextRequest) {
  try {
    const now = new Date();

    console.log(`[Invoice Generate] Starting invoice generation at ${now.toISOString()}`);

    // Include isolated/blocked users because they may need invoice to pay and reactivate
    // EXCLUDE 'stop' status - users who have stopped subscription should NOT get new invoices
    const eligibleStatuses = [
      'active',
      'isolated',
      'blocked',
      'suspended',
      'ACTIVE',
      'ISOLATED',
      'BLOCKED',
      'SUSPENDED',
    ]

    // ========================================
    // PREPAID: Users expiring H-7 to H+30 (invoice generation window)
    // ========================================
    // Generate invoice 7 days before expiry up to 30 days ahead
    const prepaidStartDate = new Date(now);
    prepaidStartDate.setDate(prepaidStartDate.getDate() + 7); // Start from 7 days ahead
    prepaidStartDate.setHours(0, 0, 0, 0);

    const prepaidEndDate = new Date(now);
    prepaidEndDate.setDate(prepaidEndDate.getDate() + 30); // up to 30 days ahead
    prepaidEndDate.setHours(23, 59, 59, 999);

    const prepaidUsers = await prisma.pppoeUser.findMany({
      where: {
        status: { in: eligibleStatuses },
        subscriptionType: 'PREPAID',
        expiredAt: {
          gte: prepaidStartDate, // From 7 days ahead
          lte: prepaidEndDate,   // To 30 days ahead
        },
      },
      include: {
        profile: true,
        area: true,
        router: true,
      },
    });

    console.log(`[Invoice Generate] Found ${prepaidUsers.length} PREPAID users (range: H+7 to H+30)`);

    // ========================================
    // POSTPAID: Users expiring H-7 to H+30 (SAMA seperti PREPAID)
    // ========================================
    // POSTPAID juga punya expiredAt (billingDay bulan berikutnya)
    // Invoice generate H-7 sebelum expiredAt (sama logic dengan PREPAID)
    const postpaidUsers = await prisma.pppoeUser.findMany({
      where: {
        status: { in: eligibleStatuses },
        subscriptionType: 'POSTPAID',
        expiredAt: {
          gte: prepaidStartDate, // From 7 days ahead
          lte: prepaidEndDate,   // To 30 days ahead
        },
      },
      include: {
        profile: true,
        area: true,
        router: true,
      },
    });

    console.log(`[Invoice Generate] Found ${postpaidUsers.length} POSTPAID users (range: H+7 to H+30)`);

    // ========================================
    // CATCH-UP: Isolated/blocked/suspended users whose expiredAt is ALREADY PAST
    // These users missed the normal H+7~H+30 window and need an invoice to pay & reactivate
    // ========================================
    const catchUpUsers = await prisma.pppoeUser.findMany({
      where: {
        status: { in: ['isolated', 'ISOLATED', 'blocked', 'BLOCKED', 'suspended', 'SUSPENDED'] },
        subscriptionType: { in: ['PREPAID', 'POSTPAID'] },
        expiredAt: {
          lt: prepaidStartDate, // Already past the normal window
        },
        // Only include users who do NOT already have a PENDING/OVERDUE invoice
        invoices: {
          none: {
            status: { in: ['PENDING', 'OVERDUE'] },
          },
        },
      },
      include: {
        profile: true,
        area: true,
        router: true,
      },
    });

    console.log(`[Invoice Generate] Found ${catchUpUsers.length} catch-up users (isolated/expired, no pending invoice)`);

    const users = [...prepaidUsers, ...postpaidUsers, ...catchUpUsers];

    if (users.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No users need invoice generation today',
        generated: 0,
        skipped: 0,
      });
    }

    console.log(`[Invoice Generate] Total ${users.length} users to process`);

    // Get current month/year for invoice numbering
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    // Get existing invoice count for this month
    let invoiceCount = await prisma.invoice.count({
      where: {
        invoiceNumber: {
          startsWith: `INV-${year}${month}-`,
        },
      },
    });

    let generated = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Get company base URL for payment links
    // Priority: company.baseUrl → request Host header → env → localhost
    const company = await prisma.company.findFirst();
    const forwardedProto = request.headers.get('x-forwarded-proto') || 'http';
    const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
    const inferredBase = forwardedHost ? `${forwardedProto}://${forwardedHost}` : '';
    const baseUrl = (company?.baseUrl && !company.baseUrl.includes('localhost'))
      ? company.baseUrl
      : (inferredBase && !inferredBase.includes('localhost'))
        ? inferredBase
        : company?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    for (const user of users) {
      try {
        // Check if user already has unpaid invoice (any time)
        const existingInvoice = await prisma.invoice.findFirst({
          where: {
            userId: user.id,
            status: {
              in: ['PENDING', 'OVERDUE'],
            },
          },
        });

        if (existingInvoice) {
          skipped++;
          console.log(`⏭️  Skipped ${user.username} - Already has unpaid invoice (${existingInvoice.invoiceNumber})`);
          continue;
        }

        // Get amount from profile
        if (!user.profile) {
          skipped++;
          console.log(`⏭️  Skipped ${user.username} - No profile assigned`);
          continue;
        }

        const baseAmount = user.profile.price;

        // Calculate PPN if enabled on profile
        let invoiceAmount = baseAmount;
        let taxRate: number | null = null;
        if (user.profile.ppnActive && user.profile.ppnRate > 0) {
          taxRate = user.profile.ppnRate;
          invoiceAmount = Math.round(baseAmount + (baseAmount * taxRate / 100));
        }

        // Calculate due date based on subscription type
        let dueDate: Date;
        let invoiceType: string;

        if (user.subscriptionType === 'PREPAID') {
          // PREPAID: Due date = expiredAt (user must pay before expiry)
          if (!user.expiredAt) {
            skipped++;
            console.log(`⏭️  Skipped ${user.username} - PREPAID user has no expiredAt`);
            continue;
          }
          dueDate = user.expiredAt;
          invoiceType = 'RENEWAL';
        } else {
          // POSTPAID: Due date = expiredAt (sama seperti PREPAID)
          // expiredAt untuk POSTPAID = billingDay bulan berikutnya
          if (!user.expiredAt) {
            skipped++;
            console.log(`⏭️  Skipped ${user.username} - POSTPAID user has no expiredAt`);
            continue;
          }
          dueDate = user.expiredAt;
          invoiceType = 'MONTHLY';
        }

        // Generate invoice number
        invoiceCount++;
        const invoiceNumber = `INV-${year}${month}-${String(invoiceCount).padStart(4, '0')}`;

        // Generate payment token and link
        const paymentToken = generatePaymentToken();
        const paymentLink = `${baseUrl}/pay/${paymentToken}`;

        // Determine invoice status based on due date
        const isOverdue = dueDate < now;
        const invoiceStatus = isOverdue ? 'OVERDUE' : 'PENDING';

        // Create invoice with customer snapshot
        await prisma.invoice.create({
          data: {
            id: crypto.randomUUID(),
            invoiceNumber,
            userId: user.id,
            customerName: user.name,
            customerPhone: user.phone,
            customerEmail: user.email,
            customerUsername: user.username,
            amount: invoiceAmount,
            baseAmount: baseAmount,
            ...(taxRate !== null && { taxRate }),
            dueDate: dueDate,
            status: invoiceStatus,
            paymentToken,
            paymentLink,
            invoiceType: invoiceType as any,
          },
        });

        generated++;
        const expiredAtStr = user.expiredAt ? formatWIB(user.expiredAt, 'd MMMM yyyy') : 'N/A';
        const statusLabel = isOverdue ? '(OVERDUE)' : '(PENDING)';
        const ppnLabel = taxRate ? ` (incl. PPN ${taxRate}%)` : '';
        console.log(`✅ Generated invoice ${invoiceNumber} for ${user.username} - Rp ${invoiceAmount.toLocaleString()}${ppnLabel} (expires: ${expiredAtStr}) ${statusLabel}`);
      } catch (error: any) {
        errors.push(`${user.username}: ${error.message}`);
        console.error(`❌ Error generating invoice for ${user.username}:`, error);
      }
    }

    // Log activity
    try {
      const session = await getServerSession(authOptions);
      const month = now.toLocaleString('id-ID', { year: 'numeric', month: 'long' });
      await logActivity({
        userId: (session?.user as any)?.id,
        username: (session?.user as any)?.username || 'System',
        userRole: (session?.user as any)?.role,
        action: 'GENERATE_INVOICE',
        description: `Generated ${generated} invoices for ${month}`,
        module: 'invoice',
        status: errors.length > 0 ? 'warning' : 'success',
        request,
        metadata: {
          generated,
          skipped,
          total: users.length,
          period: month,
        },
      });
    } catch (logError) {
      console.error('Activity log error:', logError);
    }

    return NextResponse.json({
      success: true,
      message: `Generated ${generated} invoices, skipped ${skipped} users`,
      generated,
      skipped,
      total: users.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Generate invoices error:', error);
    return NextResponse.json(
      { error: 'Failed to generate invoices', details: (error as Error).message },
      { status: 500 }
    );
  }
}
