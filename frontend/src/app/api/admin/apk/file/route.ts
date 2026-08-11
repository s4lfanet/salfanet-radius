import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

const APK_DIR = '/var/data/salfanet/apk';
const VALID_ROLES = ['admin', 'customer', 'technician', 'agent'] as const;
type RoleKey = typeof VALID_ROLES[number];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const role = req.nextUrl.searchParams.get('role') as RoleKey;
  if (!role || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const apkPath = join(APK_DIR, role, 'app.apk');
  if (!existsSync(apkPath)) {
    return NextResponse.json({ error: 'APK belum tersedia. Build terlebih dahulu.' }, { status: 404 });
  }

  // Determine filename from status.json
  let filename = `salfanet-${role}.apk`;
  try {
    const statusPath = join(APK_DIR, role, 'status.json');
    if (existsSync(statusPath)) {
      const s = JSON.parse(readFileSync(statusPath, 'utf-8'));
      if (s.appName) filename = `${s.appName.replace(/\s+/g, '-').toLowerCase()}.apk`;
    }
  } catch { /* use default */ }

  const buf = readFileSync(apkPath);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buf.length),
      'Cache-Control': 'no-store',
    },
  });
}
