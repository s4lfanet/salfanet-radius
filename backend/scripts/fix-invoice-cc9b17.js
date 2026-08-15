// Fix invoice INV-20260815-CC9B17 that is PAID but has no payment record
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const inv = await prisma.invoice.findFirst({
    where: { invoiceNumber: 'INV-20260815-CC9B17' },
    include: { payments: true, user: { select: { id: true, username: true, name: true } } }
  });

  if (!inv) {
    console.log('Invoice not found — already cleaned or does not exist');
    return;
  }

  console.log('Invoice found:', JSON.stringify({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    amount: inv.amount,
    userId: inv.userId,
    username: inv.user?.username,
    paymentsCount: inv.payments.length,
  }, null, 2));

  if (inv.status === 'PAID' && inv.payments.length === 0) {
    // Create missing payment record
    const payment = await prisma.payment.create({
      data: {
        id: `pay_fix_${Date.now()}`,
        invoiceId: inv.id,
        amount: inv.amount,
        method: 'MANUAL_FIX',
        status: 'PAID',
        notes: 'Backfilled payment record — invoice was PAID but no payment record existed (data integrity fix)',
        paidAt: inv.paidAt || new Date(),
        createdAt: new Date(),
      }
    });
    console.log('✅ Created missing payment record:', payment.id);

    // Also create Keuangan ledger entry if missing
    const existingTx = await prisma.transaction.findFirst({
      where: { reference: `INV-FIX-${inv.id}` }
    });
    if (!existingTx) {
      let cat = await prisma.transactionCategory.findFirst({ where: { name: 'Pembayaran PPPoE' } });
      if (!cat) {
        cat = await prisma.transactionCategory.create({
          data: {
            id: `cat_fix_${Date.now()}`,
            name: 'Pembayaran PPPoE',
            type: 'INCOME',
            description: 'Pembayaran invoice PPPoE',
          }
        });
      }
      await prisma.transaction.create({
        data: {
          id: `txn_fix_${Date.now()}`,
          categoryId: cat.id,
          amount: inv.amount,
          type: 'INCOME',
          description: `Backfill payment for ${inv.invoiceNumber}`,
          reference: `INV-FIX-${inv.id}`,
          notes: 'Data integrity fix for PAID invoice without payment record',
          createdAt: inv.paidAt || new Date(),
          createdBy: 'system',
        }
      });
      console.log('✅ Created missing Keuangan ledger entry');
    }
  } else {
    console.log('Invoice is not in the expected state (PAID with no payments) — no fix needed');
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
