import { NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { getFiles, uploadFile, deleteFile } from '@/lib/genieacs/api-client';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';
import { logActivity } from '@/server/services/activity-log.service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

export async function GET() {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;
  try {
    const items = await getFiles();
    return ok(items, items.length);
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;
  const limited = await rateLimit(req, RateLimitPresets.strict);
  if (limited) return limited;
  try {
    const form = await req.formData();
    const file = form.get('file');
    const fileName = String(form.get('fileName') ?? '');
    const fileType = (form.get('fileType') as string | null) ?? undefined;
    const oui = (form.get('oui') as string | null) ?? undefined;
    const productClass = (form.get('productClass') as string | null) ?? undefined;
    const version = (form.get('version') as string | null) ?? undefined;
    if (!fileName) return fail('fileName is required', 400);
    if (!(file instanceof Blob)) return fail('file is required', 400);
    const buf = new Uint8Array(await file.arrayBuffer());
    await uploadFile(fileName, buf, { fileType, oui, productClass, version });
    const session = await getServerSession(authOptions);
    await logActivity({
      username: session?.user?.name ?? 'unknown',
      userId: session?.user?.id,
      action: 'genieacs.file.upload',
      description: `Uploaded GenieACS file: ${fileName} (type: ${fileType ?? 'unset'})`,
      module: 'genieacs',
      request: req,
    });
    return ok({ fileName });
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;
  const limited = await rateLimit(req, RateLimitPresets.moderate);
  if (limited) return limited;
  try {
    const body = await req.json().catch(() => ({}));
    const fileName = body?.fileName;
    if (!fileName || typeof fileName !== 'string') return fail('fileName is required', 400);
    await deleteFile(fileName);
    const session = await getServerSession(authOptions);
    await logActivity({
      username: session?.user?.name ?? 'unknown',
      userId: session?.user?.id,
      action: 'genieacs.file.delete',
      description: `Deleted GenieACS file: ${fileName}`,
      module: 'genieacs',
      status: 'warning',
      request: req,
    });
    return ok({ fileName });
  } catch (e) {
    return fail((e as Error).message);
  }
}
