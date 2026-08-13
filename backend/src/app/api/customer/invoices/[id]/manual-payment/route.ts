import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { writeFile } from 'fs/promises';
import path from 'path';
import { getUploadDir } from '@/lib/upload-dir';

async function verifyCustomerToken(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const session = await prisma.customerSession.findFirst({
    where: { token, verified: true, expiresAt: { gte: new Date() } },
  });
  if (!session) return null;
  return prisma.pppoeUser.findUnique({ where: { id: session.userId } });
}

/**
 * POST /api/customer/invoices/[id]/manual-payment
 * Submit manual bank-transfer proof for an unpaid invoice.
 *
 * Body (multipart/form-data):
 *   bankName*     — name of the bank used
 *   accountName*  — sender's account name
 *   notes         — optional notes
 *   file          — optional proof image (jpg/png/webp, max 5 MB)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyCustomerToken(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id: invoiceId } = await params;

    // Verify invoice belongs to this user and is unpaid
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, userId: user.id },
    });

    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Tagihan tidak ditemukan' }, { status: 404 });
    }

    if (invoice.status === 'PAID') {
      return NextResponse.json({ success: false, error: 'Tagihan sudah lunas' }, { status: 400 });
    }

    // Check for existing pending manual payment for this invoice
    const existing = await prisma.manualPayment.findFirst({
      where: { invoiceId, status: 'PENDING' },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Bukti transfer sudah dikirim dan sedang menunggu konfirmasi admin' },
        { status: 409 }
      );
    }

    const formData = await request.formData();
    const bankName = (formData.get('bankName') as string | null)?.trim();
    const accountName = (formData.get('accountName') as string | null)?.trim();
    const notes = (formData.get('notes') as string | null)?.trim() || null;
    const file = formData.get('file') as File | null;

    if (!bankName) {
      return NextResponse.json({ success: false, error: 'Nama bank wajib diisi' }, { status: 400 });
    }
    if (!accountName) {
      return NextResponse.json({ success: false, error: 'Nama pengirim wajib diisi' }, { status: 400 });
    }

    // Handle optional proof image upload
    let receiptImage: string | null = null;
    if (file && file.size > 0) {
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json(
          { success: false, error: 'File harus berupa gambar (JPG, PNG, WEBP)' },
          { status: 400 }
        );
      }
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json({ success: false, error: 'Ukuran file maksimal 5MB' }, { status: 400 });
      }

      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const filename = `manual-proof-${invoiceId}-${Date.now()}.${ext}`;
      const uploadDir = getUploadDir('payment-proofs');
      const bytes = await file.arrayBuffer();
      await writeFile(path.join(uploadDir, filename), Buffer.from(bytes));
      receiptImage = `/uploads/payment-proofs/${filename}`;
    }

    // Create manualPayment record
    const manualPayment = await prisma.manualPayment.create({
      data: {
        userId: user.id,
        invoiceId,
        amount: invoice.amount,
        paymentDate: new Date(),
        bankName,
        accountName,
        notes,
        receiptImage,
        status: 'PENDING',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Bukti transfer berhasil dikirim. Admin akan mengkonfirmasi dalam 1×24 jam.',
      data: { id: manualPayment.id, status: 'pending' },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Manual payment submit error:', msg);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
