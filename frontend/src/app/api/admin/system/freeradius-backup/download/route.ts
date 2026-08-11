import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { existsSync, statSync, createReadStream } from 'fs';
import path from 'path';
import { getAppDir, getBackupDir, SAFE_BACKUP_FILENAME } from '../route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const file = request.nextUrl.searchParams.get('file');
  if (!file || !SAFE_BACKUP_FILENAME.test(file)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const appDir = getAppDir();
  const backupDir = path.resolve(getBackupDir(appDir));
  const filePath = path.resolve(path.join(backupDir, file));

  // Prevent path traversal
  if (!filePath.startsWith(backupDir + path.sep) && filePath !== backupDir) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const stat = statSync(filePath);
  const stream = createReadStream(filePath);

  const body = new ReadableStream({
    start(controller) {
      stream.on('data', (chunk) => controller.enqueue(chunk));
      stream.on('end', () => controller.close());
      stream.on('error', (err) => controller.error(err));
    },
    cancel() {
      stream.destroy();
    },
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${file}"`,
      'Content-Length': String(stat.size),
    },
  });
}
