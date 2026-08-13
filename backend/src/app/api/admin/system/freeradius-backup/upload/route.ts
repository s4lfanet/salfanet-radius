import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { getAppDir, getBackupDir } from '../route';

export const dynamic = 'force-dynamic';

// Max upload size: 10MB
const MAX_SIZE = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Validate mime type
    if (file.type !== 'application/gzip' && file.type !== 'application/x-gzip'
      && file.type !== 'application/octet-stream' && !file.name.endsWith('.tar.gz')) {
      return NextResponse.json({ error: 'File harus berupa .tar.gz' }, { status: 400 });
    }

    // Validate size
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: `File terlalu besar (maks 10MB)` }, { status: 400 });
    }

    // Sanitize filename — only allow alphanumeric, dash, underscore, dot
    const safeName = file.name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    if (!safeName.endsWith('.tar.gz')) {
      return NextResponse.json({ error: 'File harus .tar.gz' }, { status: 400 });
    }

    // Validate archive can actually be read (basic integrity check)
    const appDir = getAppDir();
    const backupDir = getBackupDir(appDir);
    const destPath = path.join(backupDir, safeName);

    // Prevent overwrite with dup name
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const finalName = safeName.replace('.tar.gz', '') + '_uploaded-' + timestamp + '.tar.gz';
    const finalPath = path.join(backupDir, finalName);

    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(finalPath, buffer);

    // Verify it's a valid tar.gz
    try {
      execSync(`tar -tzf "${finalPath}" > /dev/null 2>&1`);
    } catch {
      // Remove invalid file
      try { execSync(`rm -f "${finalPath}"`); } catch { /* ignore */ }
      return NextResponse.json({ error: 'File tidak valid atau bukan tar.gz yang benar' }, { status: 400 });
    }

    return NextResponse.json({ success: true, savedAs: finalName });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
