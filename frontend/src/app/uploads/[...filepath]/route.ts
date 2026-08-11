import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { existsSync } from 'fs';
import { UPLOAD_DIR } from '@/lib/upload-dir';

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

/**
 * Catch-all route: serves any uploaded file from the persistent UPLOAD_DIR.
 *
 * Matches URLs like:
 *   /uploads/payment-proofs/proof-123.jpg
 *   /uploads/logos/logo-abc.png
 *   /uploads/pppoe-customers/id-cards/ktp-xxx.jpg
 *   /uploads/registrations/reg-ktp-xxx.jpg
 *   /uploads/topup-proofs/topup-xxx.jpg
 *   /uploads/payments/payment-proof-xxx.jpg
 *
 * Falls back to legacy public/uploads/ for files uploaded before migration.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filepath: string[] }> }
) {
  try {
    const { filepath: segments } = await params;

    // Security: reject path traversal
    for (const seg of segments) {
      if (seg === '..' || seg.includes('/') || seg.includes('\\') || seg.includes('\0')) {
        return new NextResponse('Invalid path', { status: 400 });
      }
    }

    // Only allow known image extensions
    const filename = segments[segments.length - 1];
    const ext = extname(filename).toLowerCase();
    const contentType = CONTENT_TYPES[ext];
    if (!contentType) {
      return new NextResponse('Unsupported file type', { status: 400 });
    }

    // Restrict filename characters
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
      return new NextResponse('Invalid filename', { status: 400 });
    }

    // Try persistent upload dir first, then legacy public/uploads/
    const relativePath = join(...segments);
    let filepath = join(UPLOAD_DIR, relativePath);

    if (!existsSync(filepath)) {
      // Fallback: legacy location (public/uploads/)
      filepath = join(process.cwd(), 'public', 'uploads', relativePath);
      if (!existsSync(filepath)) {
        return new NextResponse('File not found', { status: 404 });
      }
    }

    const file = await readFile(filepath);

    return new NextResponse(file, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Serve upload error:', error);
    return new NextResponse('Failed to serve file', { status: 500 });
  }
}
