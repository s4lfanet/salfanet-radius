import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { Prisma } from '@prisma/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { ADJUSTMENT_TYPES, splitInvoiceTax, type AdjustmentType } from '@/lib/regulatory/levy';

const fail = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const MAX_INT = 2147483647;

/** POST /api/keuangan/kewajiban/adjustments */
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission('keuangan.edit');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const body = await request.json();
    const year = Number(body.year);
    const month = Number(body.month);
    const type = body.type as AdjustmentType;
    const description = String(body.description ?? '').trim().slice(0, 255);
    let amount = Number(body.amount);
    let invoiceNumber: string | null = null;

    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) return fail('Periode tidak valid');
    if (!ADJUSTMENT_TYPES.includes(type)) return fail('Jenis penyesuaian tidak dikenal');
    if (!description) return fail('Keterangan wajib diisi');

    if (type === 'WRITE_OFF') {
      const number = String(body.invoiceNumber ?? '').trim();
      if (!number) return fail('Nomor tagihan wajib diisi');
      const invoice = await prisma.invoice.findUnique({
        where: { invoiceNumber: number },
        select: { invoiceNumber: true, status: true, invoiceType: true, amount: true, taxRate: true, addonAmount: true },
      });
      if (!invoice) return fail('Tagihan tidak ditemukan', 404);
      if (invoice.invoiceType === 'TOPUP') return fail('Top-up saldo bukan pendapatan, jadi tidak perlu dihapusbukukan');
      if (invoice.status !== 'PENDING' && invoice.status !== 'OVERDUE') return fail('Hanya tagihan yang belum dibayar yang bisa dihapusbukukan');
      // The base excludes PPN, so only the revenue part of the invoice comes off it.
      amount = splitInvoiceTax(invoice).revenue;
      invoiceNumber = invoice.invoiceNumber;
    }
    if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_INT) return fail('Jumlah tidak valid');

    const actor = authCheck.session?.user as { username?: string; name?: string } | undefined;
    await prisma.regulatoryAdjustment.create({
      data: { id: nanoid(), year, month, type, amount, description, invoiceNumber, createdBy: actor?.username || actor?.name || null },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return fail('Tagihan ini sudah dihapusbukukan', 409);
    }
    console.error('[Kewajiban] Adjustment save failed:', error);
    return fail('Gagal menyimpan penyesuaian', 500);
  }
}

/** DELETE /api/keuangan/kewajiban/adjustments?id= */
export async function DELETE(request: NextRequest) {
  const authCheck = await requirePermission('keuangan.edit');
  if (!authCheck.authorized) return authCheck.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return fail('ID wajib diisi');
  const { count } = await prisma.regulatoryAdjustment.deleteMany({ where: { id } });
  return count ? NextResponse.json({ success: true }) : fail('Penyesuaian tidak ditemukan', 404);
}
