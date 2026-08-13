import { NextRequest, NextResponse } from 'next/server';
import { restoreBackup } from '@/server/services/backup.service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { unlink, mkdir } from 'fs/promises';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import path from 'path';
import os from 'os';

// Allow up to 5 minutes for large restore operations
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is SUPER_ADMIN
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Only SUPER_ADMIN can restore database' }, { status: 403 });
    }

    console.log(`[Restore API] User ${session.user.username} initiated database restore`);

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const isGzip = file.name.endsWith('.sql.gz') || file.name.endsWith('.gz');
    const isSql = file.name.endsWith('.sql');

    if (!isSql && !isGzip) {
      return NextResponse.json({ error: 'File must be .sql or .sql.gz format' }, { status: 400 });
    }

    // Stream file to disk to avoid memory spike with large SQL files
    // (loading into memory crashes PM2's max_memory_restart threshold)
    const ext = isGzip ? (file.name.endsWith('.sql.gz') ? '.sql.gz' : '.gz') : '.sql';
    const tmpDir = path.join(os.tmpdir(), 'salfanet-restore');
    await mkdir(tmpDir, { recursive: true });
    const tempFilepath = path.join(tmpDir, `restore_temp_${Date.now()}${ext}`);

    const webStream = file.stream();
    const nodeReadable = Readable.fromWeb(webStream as Parameters<typeof Readable.fromWeb>[0]);
    const writeStream = createWriteStream(tempFilepath);
    await pipeline(nodeReadable, writeStream);

    console.log('[Restore API] File uploaded, starting restore...');

    try {
      // restoreBackup handles both .sql and .sql.gz/.gz
      await restoreBackup(tempFilepath);
    } finally {
      // Always clean up temp file
      await unlink(tempFilepath).catch(() => {});
    }

    console.log('[Restore API] Database restored successfully');

    return NextResponse.json({
      success: true,
      message: 'Database restored successfully',
    });
  } catch (error: any) {
    console.error('[Restore API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
