import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { getUploadDir } from '@/lib/upload-dir';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';

// This endpoint is intentionally public (unauthenticated): it's used from the
// token-based /pay-manual page where customers are not logged in. Because
// there is no session to gate on, the file content itself must be untrusted
// input — never trust the client-supplied Content-Type or filename.

// Magic-byte signatures for the only formats we accept. The declared
// Content-Type/filename are attacker-controlled and are NOT used to decide
// what gets written to disk or which extension the stored file gets.
function detectImageType(buffer: Buffer): 'png' | 'jpg' | 'webp' | null {
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
  return null;
}

export async function POST(request: NextRequest) {
  try {
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

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: 'File size exceeds 5MB limit.' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Detect the real file type from content, not from the client-supplied
    // Content-Type header or filename — both are attacker-controlled and were
    // previously used to smuggle an .svg (script-capable) file past the
    // declared-type allowlist.
    const detectedType = detectImageType(buffer);
    if (!detectedType) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Only JPG, PNG, and WebP are allowed.' },
        { status: 400 }
      );
    }

    // Generate unique filename — extension comes from the detected type only.
    const uniqueId = randomBytes(8).toString('hex');
    const timestamp = Date.now();
    const filename = `payment-proof-${timestamp}-${uniqueId}.${detectedType}`;

    const uploadDir = getUploadDir('payment-proofs');
    const filepath = join(uploadDir, filename);
    await writeFile(filepath, buffer);

    // Return public URL
    const publicUrl = `/uploads/payment-proofs/${filename}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      filename,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Upload failed' },
      { status: 500 }
    );
  }
}
