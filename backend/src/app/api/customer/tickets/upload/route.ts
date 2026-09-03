import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { getUploadDir } from '@/lib/upload-dir';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';
import { prisma } from '@/server/db/client';

async function getSession(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;

  return prisma.customerSession.findFirst({
    where: {
      token,
      verified: true,
      expiresAt: { gte: new Date() },
    },
  });
}

function detectFileType(buffer: Buffer): 'png' | 'jpg' | 'webp' | 'pdf' | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return 'png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === '%PDF') {
    return 'pdf';
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const limited = await rateLimit(request, RateLimitPresets.strict);
    if (limited) {
      return NextResponse.json(
        { success: false, error: 'Too many uploads. Try again later.' },
        { status: 429 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file uploaded' },
        { status: 400 }
      );
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: 'File size exceeds 10MB limit.' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const detectedType = detectFileType(buffer);
    if (!detectedType) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Only JPG, PNG, WebP, and PDF are allowed.' },
        { status: 400 }
      );
    }

    const uniqueId = randomBytes(8).toString('hex');
    const timestamp = Date.now();
    const filename = `ticket-${timestamp}-${uniqueId}.${detectedType}`;

    const uploadDir = getUploadDir('tickets');
    const filepath = join(uploadDir, filename);
    await writeFile(filepath, buffer);

    const publicUrl = `/uploads/tickets/${filename}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      filename,
      fileType: detectedType,
    });
  } catch (error: any) {
    console.error('Ticket upload error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Upload failed' },
      { status: 500 }
    );
  }
}
