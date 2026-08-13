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
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
    };

    if (!contentTypes[ext]) {
      return new NextResponse('Unsupported file type', { status: 400 });
    }

    const filepath = path.join(UPLOAD_DIR, 'logos', filename);

    // Fallback to legacy location
    const legacyPath = path.join(process.cwd(), 'public', 'uploads', 'logos', filename);
    const resolvedPath = existsSync(filepath) ? filepath : legacyPath;

    // Check if file exists
    if (!existsSync(resolvedPath)) {
      return new NextResponse('File not found', { status: 404 });
    }

    // Read file
    const fileBuffer = await readFile(resolvedPath);

    const contentType = contentTypes[ext];

    // Return file with proper headers
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Error serving logo:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
