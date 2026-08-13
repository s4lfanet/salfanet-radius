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

  const roleDir    = join(APK_DIR, role);
  const statusFile = join(roleDir, 'status.json');
  const apkFile    = join(roleDir, 'app.apk');

  const apkAvailable = existsSync(apkFile);
  const apkSize      = apkAvailable ? statSync(apkFile).size : 0;

  if (!existsSync(statusFile)) {
    return NextResponse.json({ status: 'idle', apkAvailable, apkSize });
  }

  try {
    const data = JSON.parse(readFileSync(statusFile, 'utf-8'));

    // Mark as stale if building > 15 minutes (process probably died)
    if (data.status === 'building') {
      const elapsed = Date.now() - new Date(data.startedAt).getTime();
      if (elapsed > 15 * 60 * 1000) {
        return NextResponse.json({ ...data, status: 'stale', apkAvailable, apkSize });
      }
    }

    return NextResponse.json({ ...data, apkAvailable, apkSize });
  } catch {
    return NextResponse.json({ status: 'idle', apkAvailable, apkSize });
  }
}
