import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { generateTransactionId, generateCategoryId } from '@/server/services/billing/invoice.service';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    // Fetch user with profile data needed for RADIUS restoration
    const userRecord = await prisma.pppoeUser.findUnique({
      where: { id },
      select: {
        username: true,
        password: true,
        ipAddress: true,
        profile: { select: { groupName: true } },
      },
    });

    if (!userRecord) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get unpaid invoices for user
    const unpaidInvoices = await prisma.invoice.findMany({
      where: {
        userId: id,
        status: { in: ['PENDING', 'OVERDUE'] },
      },
      orderBy: { dueDate: 'asc' },
    });

    if (unpaidInvoices.length === 0) {
      return NextResponse.json(
        { error: 'No unpaid invoices found' },
        { status: 404 }
      );
    }

    const now = new Date();
    const markedCount = unpaidInvoices.length;
    const totalAmount = unpaidInvoices.reduce((sum, inv) => sum + inv.amount, 0);

    // Mark all unpaid invoices as paid
    await prisma.invoice.updateMany({
      where: {
        userId: id,
        status: { in: ['PENDING', 'OVERDUE'] },
      },
      data: {
        status: 'PAID',
        paidAt: now,
      },
    });

    // Find or create transaction category for subscription
    let category = await prisma.transactionCategory.findFirst({
      where: { name: 'Subscription', type: 'INCOME' },
    });
    
    if (!category) {
      category = await prisma.transactionCategory.create({
        data: {
          id: generateCategoryId(),
          name: 'Subscription',
          type: 'INCOME',
        },
      });
    }

    // Create transaction records
    for (const invoice of unpaidInvoices) {
      await prisma.transaction.create({
        data: {
          id: await generateTransactionId(),
          categoryId: category.id,
          type: 'INCOME',
          amount: invoice.amount,
          description: `Pembayaran tagihan ${invoice.invoiceNumber}`,
          reference: invoice.invoiceNumber,
          date: now,
        },
      });
    }

    // Update user status to active
    const updatedUser = await prisma.pppoeUser.update({
      where: { id },
      data: { status: 'active' },
      select: { username: true },
    });

    // Restore RADIUS tables so the user reconnects with correct profile.
    // Critical when user was isolated (radusergroup = 'isolir') — without this
    // they would still get restricted isolir access even after paying.
    if (userRecord.profile) {
      try {
        // Remove any old rejection/suspension markers
        await prisma.radcheck.deleteMany({
          where: { username: userRecord.username, attribute: 'Auth-Type' },
        });
        await prisma.radcheck.deleteMany({
          where: { username: userRecord.username, attribute: 'NAS-IP-Address' },
        });
        await prisma.radreply.deleteMany({
          where: { username: userRecord.username, attribute: 'Reply-Message' },
        });

        // Ensure password exists in radcheck
        await prisma.$executeRaw`
          INSERT INTO radcheck (username, attribute, op, value)
          VALUES (${userRecord.username}, 'Cleartext-Password', ':=', ${userRecord.password})
          ON DUPLICATE KEY UPDATE value = ${userRecord.password}
        `;

        // Restore original subscription group
        await prisma.$executeRaw`
          DELETE FROM radusergroup WHERE username = ${userRecord.username}
        `;
        await prisma.$executeRaw`
          INSERT INTO radusergroup (username, groupname, priority)
          VALUES (${userRecord.username}, ${userRecord.profile.groupName}, 1)
        `;

        // Restore static IP
        await prisma.radreply.deleteMany({
          where: { username: userRecord.username, attribute: 'Framed-IP-Address' },
        });
        if (userRecord.ipAddress) {
          await prisma.$executeRaw`
            INSERT INTO radreply (username, attribute, op, value)
            VALUES (${userRecord.username}, 'Framed-IP-Address', ':=', ${userRecord.ipAddress})
            ON DUPLICATE KEY UPDATE value = ${userRecord.ipAddress}
          `;
        }

        // Send CoA disconnect so user immediately reconnects with restored profile
        const { disconnectPPPoEUser } = await import('@/server/services/radius/coa-handler.service');
        const coaResult = await disconnectPPPoEUser(userRecord.username);
        console.log(`[MarkPaid] RADIUS restored + CoA disconnect for ${userRecord.username}:`, coaResult);
      } catch (radiusError: any) {
        console.error('[MarkPaid] RADIUS restore error (non-fatal):', radiusError?.message);
      }
    }

    return NextResponse.json({
      success: true,
      markedCount,
      totalAmount,
      message: `${markedCount} tagihan telah dibayar (Total: Rp ${totalAmount.toLocaleString('id-ID')})`,
    });
  } catch (error) {
    console.error('Mark paid error:', error);
    return NextResponse.json(
      { error: 'Failed to mark invoices as paid' },
      { status: 500 }
    );
  }
}
