import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { getUploadDir } from '@/lib/upload-dir';

// POST - Public upload for registration ID card photos (no auth required)
// Rate-limited by file size and type checks only
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Tipe file tidak valid. Hanya JPG, PNG, WebP.' },
        { status: 400 }
      );
    }

    // Validate file size (max 3MB for public endpoint)
    const maxSize = 3 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: 'Ukuran file melebihi batas 3MB.' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uniqueId = randomBytes(10).toString('hex');
    const timestamp = Date.now();
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const filename = `reg-ktp-${timestamp}-${uniqueId}.${extension}`;

    const uploadDir = getUploadDir('registrations');

    const filepath = join(uploadDir, filename);
    await writeFile(filepath, buffer);

    return NextResponse.json({
      success: true,
      url: `/uploads/registrations/${filename}`,
    });
  } catch (error: any) {
    console.error('Public registration upload error:', error);
    return NextResponse.json(
      { success: false, error: 'Upload gagal' },
      { status: 500 }
    );
  }
}
