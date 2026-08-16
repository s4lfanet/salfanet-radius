import { type NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { createOrUpdateVirtualParameter, deleteVirtualParameter, getVirtualParameter } from '@/lib/genieacs/api-client';
import { prisma } from '@/server/db/client';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ vpId: string }> },
) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;

  try {
    const { vpId } = await params;
    // GenieACS is source of truth
    try {
      const remote = await getVirtualParameter(vpId);
      if (!remote) return fail('Virtual parameter not found', 404);
      return ok({ _id: (remote as { _id?: string })._id, script: (remote as { script?: string }).script, description: (remote as { description?: string }).description, syncedAt: new Date(), syncError: null });
    } catch (nbiErr) {
      const vp = await prisma.genieacsVpScript.findUnique({ where: { name: vpId } });
      if (!vp) return fail('Virtual parameter not found', 404);
      return ok({ _id: vp.name, script: vp.script, description: vp.description, syncedAt: vp.syncedAt, syncError: vp.syncError ?? (nbiErr as Error).message });
    }
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

    // 1. Push to GenieACS (source of truth)
    let syncError: string | null = null;
    try {
      await createOrUpdateVirtualParameter(vpId, script);
    } catch (syncErr) {
      syncError = (syncErr as Error).message;
    }

    // 2. Update Prisma cache
    await prisma.genieacsVpScript.upsert({
      where: { name: vpId },
      update: { script, description: description ?? null, syncedAt: syncError ? null : new Date(), syncError, updatedAt: new Date() },
      create: { name: vpId, script, description: description ?? null, syncedAt: syncError ? null : new Date(), syncError },
    });
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
    // 1. Delete from GenieACS (source of truth)
    try {
      await deleteVirtualParameter(vpId);
    } catch (err) {
      if (!String((err as Error).message).includes('404')) {
        return fail(`Failed to delete from GenieACS: ${(err as Error).message}`);
      }
    }
    // 2. Delete from Prisma cache
    await prisma.genieacsVpScript.deleteMany({ where: { name: vpId } });
    return ok({ _id: vpId });
  } catch (e) {
    return fail((e as Error).message);
  }
}
