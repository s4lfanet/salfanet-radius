import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { UPLOAD_DIR } from '@/lib/upload-dir';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    // Reject path traversal and unexpected characters.
    if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      return new NextResponse('Invalid filename', { status: 400 });
    }

    // Restrict to expected filename pattern used by uploads.
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
      return new NextResponse('Invalid filename', { status: 400 });
    }

    const ext = path.extname(filename).toLowerCase();
    const contentTypes: { [key: string]: string } = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.avif': 'image/avif',
      '.gif': 'image/gif',
    };

    if (!contentTypes[ext]) {
      return new NextResponse('Unsupported file type', { status: 400 });
    }

    const filepath = path.join(UPLOAD_DIR, 'banners', filename);

    if (!existsSync(filepath)) {
      return new NextResponse('File not found', { status: 404 });
    }

    const fileBuffer = await readFile(filepath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentTypes[ext],
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Error serving banner:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
