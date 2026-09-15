import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// Cache the generated icon in memory (invalidated on process restart / deploy)
const iconCache: Map<string, { buffer: Buffer; etag: string; ts: number }> = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function fallbackIcon(size: number): Buffer {
  // Return the static icon file from /public/pwa/
  const candidates = [
    path.join(process.cwd(), `public/pwa/icon-${size}.png`),
    path.join(process.cwd(), `../public/pwa/icon-${size}.png`),
    path.join('/var/www/salfanet-radius', `public/pwa/icon-${size}.png`),
    path.join('/var/www/salfanet-radius/frontend', `public/pwa/icon-${size}.png`),
    path.join('/var/www/salfanet-radius/backend', `public/pwa/icon-${size}.png`),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p);
  }
  // Last resort: 1×1 transparent PNG
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
}

async function resizeToSquare(inputBuffer: Buffer, size: number, maskable: boolean): Promise<Buffer> {
  // dynamic import to avoid build-time errors on environments without sharp
  const sharp = (await import('sharp')).default;
  const image = sharp(inputBuffer);
  if (maskable) {
    // Maskable icons are cropped by the OS — pad onto an opaque white
    // background (logos uploaded here are typically dark-on-transparent)
    // and shrink to the safe zone (~80%).
    const inner = Math.round(size * 0.8);
    const resized = await image
      .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    return sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([{ input: resized, gravity: 'center' }])
      .png()
      .toBuffer();
  }
  // 'any' purpose — keep transparency, pad to square
  return image
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function fetchExternalImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

function getLogoPath(logoValue: string): string | null {
  // Logo stored as /api/uploads/... (DB format), /uploads/..., or uploads/...
  const match = logoValue.match(/^\/?(?:api\/)?uploads\/(.+)$/);
  if (!match) return null;
  const uploadDir = process.env.UPLOAD_DIR || '/var/data/salfanet/uploads';
  const rel = match[1];
  const candidates = [
    path.join(uploadDir, rel),
    path.join(process.cwd(), 'public', 'uploads', rel),
    path.join('/var/www/salfanet-radius/public', 'uploads', rel),
    path.join('/var/www/salfanet-radius/frontend/public', 'uploads', rel),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawSize = parseInt(searchParams.get('size') || '192', 10);
  const size = rawSize === 512 ? 512 : rawSize === 180 ? 180 : 192;
  const maskable = searchParams.get('maskable') === '1';

  const cacheKey = `icon-${size}-${maskable ? 'm' : 'a'}`;
  const cached = iconCache.get(cacheKey);

  // ETag check
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    const ifNoneMatch = req.headers.get('if-none-match');
    if (ifNoneMatch === cached.etag) {
      return new NextResponse(null, { status: 304 });
    }
    return new NextResponse(new Uint8Array(cached.buffer), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=300, must-revalidate',
        'ETag': cached.etag,
      },
    });
  }

  let iconBuffer: Buffer | null = null;

  try {
    // Fetch company logo from DB
    const company = await prisma.company.findFirst({ select: { logo: true } });
    const logoValue = company?.logo || null;

    if (logoValue) {
      // Case 1: local file path
      const diskPath = getLogoPath(logoValue);
      if (diskPath) {
        iconBuffer = readFileSync(diskPath);
      }
      // Case 2: external URL (http/https)
      else if (logoValue.startsWith('http://') || logoValue.startsWith('https://')) {
        iconBuffer = await fetchExternalImage(logoValue);
      }
    }
  } catch {
    // DB unavailable — fall through to static fallback
  }

  // Resize to exact square, or fall back to static PNG
  let finalBuffer: Buffer;
  try {
    if (iconBuffer) {
      finalBuffer = await resizeToSquare(iconBuffer, size, maskable);
    } else {
      finalBuffer = fallbackIcon(size);
    }
  } catch {
    finalBuffer = fallbackIcon(size);
  }

  const etag = `"${size}-${Date.now()}"`;
  iconCache.set(cacheKey, { buffer: finalBuffer, etag, ts: Date.now() });

  return new NextResponse(new Uint8Array(finalBuffer), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300, must-revalidate',
      'ETag': etag,
    },
  });
}
