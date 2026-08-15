import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { readFile } from 'fs/promises';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission('settings.view');
    if (!authCheck.authorized) return authCheck.response;
    const session = authCheck.session;

    const { id } = await params;

    // Get backup info from database
    const backup = await prisma.backupHistory.findUnique({
      where: { id },
    });

    if (!backup || !backup.filepath) {
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    }

    console.log(`[Download API] User ${(session.user as any).username} downloading backup ${backup.filename}`);

    // Read file
    const fileBuffer = await readFile(backup.filepath);

    // Return file as download
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/sql',
        'Content-Disposition': `attachment; filename="${backup.filename}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error('[Download API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
