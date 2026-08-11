import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { writeFile } from 'fs/promises';
import path from 'path';

/**
 * Upload Payment Proof
 * POST /api/customer/payments/[id]/proof
 */

// Helper to verify customer token
async function verifyCustomerToken(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return null;

    const session = await prisma.customerSession.findFirst({
      where: {
        token,
        verified: true,
        expiresAt: { gte: new Date() },
      },
    });

    if (!session) return null;

    return await prisma.pppoeUser.findUnique({
      where: { id: session.userId },
    });
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyCustomerToken(request);
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: paymentId } = await params;

    // Verify payment belongs to user
    const payment = await prisma.manualPayment.findFirst({
      where: {
        id: paymentId,
        userId: user.id,
      },
    });

    if (!payment) {
      return NextResponse.json(
        { success: false, message: 'Payment tidak ditemukan' },
        { status: 404 }
      );
    }

    // Get form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, message: 'File tidak ditemukan' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, message: 'File harus berupa gambar (JPG, PNG, WEBP)' },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, message: 'Ukuran file maksimal 5MB' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const ext = file.name.split('.').pop();
    const filename = `payment-proof-${paymentId}-${Date.now()}.${ext}`;
    const { getUploadDir } = require('@/lib/upload-dir');
    const uploadDir = getUploadDir('payments');
    const filepath = path.join(uploadDir, filename);

    // Save file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);

    // Update payment with proof URL
    const proofUrl = `/uploads/payments/${filename}`;
    const updatedPayment = await prisma.manualPayment.update({
      where: { id: paymentId },
      data: {
        receiptImage: proofUrl,
        status: 'PENDING', // Set to pending for admin review
      },
      select: {
        id: true,
        receiptImage: true,
        status: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Bukti pembayaran berhasil diupload. Menunggu konfirmasi admin.',
      data: {
        id: updatedPayment.id,
        proofUrl: updatedPayment.receiptImage,
        status: updatedPayment.status.toLowerCase(),
      },
    });
  } catch (error: any) {
    console.error('Upload payment proof error:', error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan', error: error.message },
      { status: 500 }
    );
  }
}
