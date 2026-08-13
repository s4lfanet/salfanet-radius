import { type NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { createOrUpdateVirtualParameter, deleteVirtualParameter } from '@/lib/genieacs/api-client';
import { prisma } from '@/server/db/client';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ vpId: string }> },
) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;

  try {
    const { vpId } = await params;
    const vp = await prisma.genieacsVpScript.findUnique({ where: { name: vpId } });
    if (!vp) return fail('Virtual parameter not found', 404);
    return ok({ _id: vp.name, script: vp.script, description: vp.description, syncedAt: vp.syncedAt, syncError: vp.syncError });
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ vpId: string }> },
) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;

  try {
    const { vpId } = await params;
    const body = await req.json();
    const { script, description } = body ?? {};
    if (typeof script !== 'string') return fail('script is required', 400);

    await prisma.genieacsVpScript.upsert({
      where: { name: vpId },
      update: { script, description: description ?? null, syncedAt: null, syncError: null, updatedAt: new Date() },
      create: { name: vpId, script, description: description ?? null },
    });

    let syncError: string | null = null;
    try {
      await createOrUpdateVirtualParameter(vpId, script);
      await prisma.genieacsVpScript.update({ where: { name: vpId }, data: { syncedAt: new Date(), syncError: null } });
    } catch (syncErr) {
      syncError = (syncErr as Error).message;
      await prisma.genieacsVpScript.update({ where: { name: vpId }, data: { syncError } });
    }
    return ok({ _id: vpId, syncError });
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ vpId: string }> },
) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;

  try {
    const { vpId } = await params;
    await prisma.genieacsVpScript.deleteMany({ where: { name: vpId } });
    try { await deleteVirtualParameter(vpId); } catch { /* ignore if not found */ }
    return ok({ _id: vpId });
  } catch (e) {
    return fail((e as Error).message);
  }
}
