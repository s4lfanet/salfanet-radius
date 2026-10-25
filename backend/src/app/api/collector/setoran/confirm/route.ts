import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { setInvoiceConfirmation } from '@/server/services/settlement.service';

const MAX_BATCH = 500;

/** Confirm (or take back the confirmation of) several collector payments at once. */
export async function POST(req: NextRequest) {
  const authCheck = await requirePermission('keuangan.edit');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { invoiceIds, confirm } = await req.json();
    if (!Array.isArray(invoiceIds) || invoiceIds.length === 0 || invoiceIds.some((id) => typeof id !== 'string')) {
      return NextResponse.json({ error: 'invoiceIds harus berisi minimal satu invoice' }, { status: 400 });
    }
    if (invoiceIds.length > MAX_BATCH) {
      return NextResponse.json({ error: `Paling banyak ${MAX_BATCH} pembayaran sekali proses` }, { status: 400 });
    }
    if (typeof confirm !== 'boolean') {
      return NextResponse.json({ error: 'confirm harus true atau false' }, { status: 400 });
    }

    const updated = await setInvoiceConfirmation(invoiceIds, confirm, authCheck.userId);
    return NextResponse.json({ success: true, updated });
  } catch (error) {
    console.error('Bulk settlement confirmation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
