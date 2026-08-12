import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { generateTransactionId, generateCategoryId } from '@/server/services/billing/invoice.service';
import { managePppSecret, shouldManagePppSecretForSuspend, kickPppoeSession } from '@/server/services/mikrotik/ppp-secret.service';

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
        router: { select: { id: true, authMode: true } },
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
      const nasIdentifier = userRecord.router?.id || null;
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

        // Ensure password exists in radcheck — with nas_identifier
        await prisma.$executeRaw`
          INSERT INTO radcheck (username, attribute, op, value, nas_identifier)
          VALUES (${userRecord.username}, 'Cleartext-Password', ':=', ${userRecord.password}, ${nasIdentifier})
          ON DUPLICATE KEY UPDATE value = ${userRecord.password}
        `;

        // Restore original subscription group — delete by username, insert with nas_identifier
        await prisma.$executeRaw`
          DELETE FROM radusergroup WHERE username = ${userRecord.username}
        `;
        await prisma.$executeRaw`
          INSERT INTO radusergroup (username, groupname, priority, nas_identifier)
          VALUES (${userRecord.username}, ${userRecord.profile.groupName}, 1, ${nasIdentifier})
        `;

        // Restore static IP — delete by username+attribute, insert with nas_identifier
        await prisma.$executeRaw`
          DELETE FROM radreply WHERE username = ${userRecord.username} AND attribute = 'Framed-IP-Address'
        `;
        if (userRecord.ipAddress) {
          await prisma.$executeRaw`
            INSERT INTO radreply (username, attribute, op, value, nas_identifier)
            VALUES (${userRecord.username}, 'Framed-IP-Address', ':=', ${userRecord.ipAddress}, ${nasIdentifier})
            ON DUPLICATE KEY UPDATE value = ${userRecord.ipAddress}
          `;
        }

        // Restore PPP secret profile in MikroTik (critical for local/hybrid mode)
        // Change profile back to original + enable + kick active session
        if (userRecord.router?.id && shouldManagePppSecretForSuspend(userRecord.router.authMode)) {
          managePppSecret(userRecord.router.id, 'enable', {
            username: userRecord.username,
            password: userRecord.password,
            profile: userRecord.profile.groupName,
          }).then((r) => {
            console.log(`[MarkPaid] PPP secret restored to "${userRecord.profile.groupName}" for ${userRecord.username}: ${r.message}`);
          }).catch((e) => {
            console.error(`[MarkPaid] PPP secret restore failed for ${userRecord.username}:`, e?.message || e);
          });

          // Kick active session so user reconnects with restored profile
          kickPppoeSession(userRecord.router.id, userRecord.username).then((kicked) => {
            console.log(`[MarkPaid] Kicked ${kicked} session(s) for ${userRecord.username}`);
          }).catch((e) => {
            console.error(`[MarkPaid] Kick failed for ${userRecord.username}:`, e?.message || e);
          });
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
