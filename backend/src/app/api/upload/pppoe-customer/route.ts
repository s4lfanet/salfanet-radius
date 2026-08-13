import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { getUploadDir } from '@/lib/upload-dir';

// POST - Upload foto pelanggan (KTP atau foto instalasi)
// FormData: file (File), type ('idCard' | 'installation')
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = (formData.get('type') as string) || 'installation';

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Tipe file tidak valid. Hanya JPG, PNG, dan WebP yang diizinkan.' },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: 'Ukuran file melebihi batas 5MB.' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uniqueId = randomBytes(8).toString('hex');
    const timestamp = Date.now();
    const extension = file.name.split('.').pop() || 'jpg';

    // Subfolder berdasarkan type
    const subfolder = type === 'idCard' ? 'id-cards' : 'installations';
    const prefix = type === 'idCard' ? 'ktp' : 'install';
    const filename = `${prefix}-${timestamp}-${uniqueId}.${extension}`;

    const uploadDir = getUploadDir('pppoe-customers', subfolder);

    const filepath = join(uploadDir, filename);
    await writeFile(filepath, buffer);

    const publicUrl = `/uploads/pppoe-customers/${subfolder}/${filename}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      filename,
    });
  } catch (error: any) {
    console.error('Upload pppoe customer error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Upload gagal' },
      { status: 500 }
    );
  }
}
