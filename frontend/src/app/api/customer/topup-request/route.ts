import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { rateLimit } from '@/server/middleware/rate-limit';
import { getUploadDir } from '@/lib/upload-dir';

export async function POST(request: NextRequest) {
  const rateLimitResult = await rateLimit(request, { max: 5, windowMs: 60 * 1000 });
  if (rateLimitResult) return rateLimitResult;

  try {
    // Authenticate via customer Bearer token
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = await prisma.customerSession.findFirst({
      where: {
        token,
        verified: true,
        expiresAt: { gte: new Date() },
      },
    });

    if (!session) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // Get PPPoE user directly from session
    const pppoeUser = await prisma.pppoeUser.findUnique({
      where: { id: session.userId },
    });

    if (!pppoeUser) {
      return NextResponse.json({ error: 'PPPoE user not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const amount = parseInt(formData.get('amount') as string);
    const paymentMethod = formData.get('paymentMethod') as string;
    const note = formData.get('note') as string || '';
    const proofFile = formData.get('proof') as File;
    const timestamp = Date.now();

    if (isNaN(amount) || amount < 10000) {
      return NextResponse.json({ error: 'Minimum top-up adalah Rp 10.000' }, { status: 400 });
    }

    let proofPath: string | null = null;

    // Handle file upload
    if (proofFile && paymentMethod !== 'CASH') {
      const bytes = await proofFile.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const filename = `topup-${pppoeUser.id}-${timestamp}-${proofFile.name}`;
      const uploadsDir = getUploadDir('topup-proofs');

      const filepath = join(uploadsDir, filename);
      await writeFile(filepath, buffer);
      proofPath = `/uploads/topup-proofs/${filename}`;
    }

    // Get or create INCOME category for deposits
    let depositCategory = await prisma.transactionCategory.findFirst({
      where: { name: 'DEPOSIT_REQUEST', type: 'INCOME' }
    });

    if (!depositCategory) {
      depositCategory = await prisma.transactionCategory.create({
        data: {
          id: `cat-${Date.now()}`,
          name: 'DEPOSIT_REQUEST',
          type: 'INCOME',
          description: 'Customer deposit/top-up requests',
          isActive: true
        }
      });
    }

    // Store request data in notes as JSON
    const requestData = {
      status: 'PENDING',
      pppoeUserId: pppoeUser.id,
      pppoeUsername: pppoeUser.username,
      requestedBy: pppoeUser.name,
      paymentMethod: paymentMethod,
      note: note,
      proofPath: proofPath,
      requestedAt: new Date().toISOString(),
    };

    // Create transaction request
    const transaction = await prisma.transaction.create({
      data: {
        id: `txn-${Date.now()}`,
        categoryId: depositCategory.id,
        amount: amount,
        type: 'INCOME',
        description: `Top-up request dari ${pppoeUser.name} (@${pppoeUser.username})`,
        reference: `TOPUP-${pppoeUser.id}-${timestamp}`,
        notes: JSON.stringify(requestData),
        createdBy: pppoeUser.id,
      },
    });

    // TODO: Send notification to admin (WhatsApp/Email)
    // This can be implemented later with notification system

    return NextResponse.json({
      success: true,
      message: 'Permintaan top-up berhasil dikirim',
      transaction: {
        id: transaction.id,
        amount: transaction.amount,
        reference: transaction.reference,
        status: 'PENDING',
      },
    });

  } catch (error) {
    console.error('Top-up request error:', error);
    return NextResponse.json(
      { error: 'Gagal memproses permintaan top-up' },
      { status: 500 }
    );
  }
}
