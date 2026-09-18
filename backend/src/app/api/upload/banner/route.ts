import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { writeFile } from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { getUploadDir } from '@/lib/upload-dir';

// Raw upload is intentionally generous — the file is always re-encoded/
// compressed below before it's written to disk, so admins don't need to
// pre-shrink photos themselves. This cap only guards against absurd payloads.
const MAX_RAW_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_WIDTH = 1920; // banners are wide, short — never need to be taller than this in practice
const WEBP_QUALITY = 82;

const allowedMimes: Record<string, true> = {
  'image/png': true,
  'image/jpeg': true,
  'image/jpg': true,
  'image/webp': true,
  'image/avif': true,
  'image/gif': true,
};

export async function POST(request: NextRequest) {
  try {
    const authCheck = await requirePermission('settings.edit');
    if (!authCheck.authorized) return authCheck.response;
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!allowedMimes[file.type]) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Only PNG, JPG, WebP, AVIF, and GIF are allowed.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_RAW_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File size too large. Maximum 20MB allowed.' },
        { status: 400 }
      );
    }

    const originalBuffer = Buffer.from(await file.arrayBuffer());

    // Animated GIFs are passed through as-is — re-encoding to static webp
    // would silently drop the animation, which is surprising for an upload
    // that just says "banner". Everything else is normalized to webp:
    // auto-rotated (EXIF), capped to a sane max width, and compressed —
    // this is what lets the raw upload limit be generous.
    let outputBuffer: Buffer;
    let extension: string;
    if (file.type === 'image/gif') {
      outputBuffer = originalBuffer;
      extension = 'gif';
    } else {
      outputBuffer = await sharp(originalBuffer)
        .rotate()
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
      extension = 'webp';
    }

    const uploadsDir = getUploadDir('banners');
    const filename = `banner-${nanoid(10)}.${extension}`;
    const filepath = path.join(uploadsDir, filename);
    await writeFile(filepath, outputBuffer);

    const url = `/api/uploads/banners/${filename}`;

    return NextResponse.json({
      success: true,
      url,
      filename,
      originalSize: originalBuffer.length,
      finalSize: outputBuffer.length,
    });
  } catch (error: any) {
    console.error('Upload banner error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to upload file' },
      { status: 500 }
    );
  }
}
