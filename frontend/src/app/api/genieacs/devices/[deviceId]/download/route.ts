import { type NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { downloadFirmware } from '@/lib/genieacs/api-client';

/**
 * POST /api/genieacs/devices/[deviceId]/download
 * body: {
 *   fileType: string,   e.g. "1 Firmware Upgrade Image"
 *   fileName: string,   ID of the file already uploaded to GenieACS FS
 *   targetFileName?: string
 * }
 *
 * Queues a TR-069 Download RPC task.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;

  try {
    const { deviceId } = await params;
    const body = await req.json();
    const { fileType, fileName, targetFileName } = body ?? {};
    if (!fileType || !fileName) {
      return fail('fileType and fileName are required', 400);
    }
    const task = await downloadFirmware(deviceId, fileType, fileName, targetFileName);
    return ok(task);
  } catch (e) {
    return fail((e as Error).message);
  }
}
