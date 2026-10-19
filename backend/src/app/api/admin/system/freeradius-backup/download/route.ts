import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { createReadStream, existsSync, statSync } from 'fs';
import { backupPath } from '@/server/services/freeradius-backup.service';

export const dynamic = 'force-dynamic';

/** Downloads one archive. Super Admin only: it holds the database password and NAS secrets. */
export async function GET(request: NextRequest) {
  const authCheck = await requirePermission('settings.view');
  if (!authCheck.authorized) return authCheck.response;
  if (authCheck.session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const file = request.nextUrl.searchParams.get('file') || '';
  const filePath = backupPath(file);
  if (!filePath) return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  if (!existsSync(filePath)) return NextResponse.json({ error: 'File not found' }, { status: 404 });

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
