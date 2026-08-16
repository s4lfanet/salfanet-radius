import { NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { createOrUpdateProvision, deleteProvision, getProvision } from '@/lib/genieacs/api-client';
import { prisma } from '@/server/db/client';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ provisionId: string }> }) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;
  try {
    const { provisionId } = await params;
    // GenieACS is source of truth
    try {
      const remote = await getProvision(provisionId);
      if (!remote) return fail('Provision not found', 404);
      return ok({ _id: (remote as { _id?: string })._id, script: (remote as { script?: string }).script, description: (remote as { description?: string }).description, syncedAt: new Date(), syncError: null });
    } catch (nbiErr) {
      // Fallback to Prisma cache
      const p = await prisma.genieacsProvision.findUnique({ where: { name: provisionId } });
      if (!p) return fail('Provision not found', 404);
      return ok({ _id: p.name, script: p.script, description: p.description, syncedAt: p.syncedAt, syncError: p.syncError ?? (nbiErr as Error).message });
    }
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ provisionId: string }> }) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;
  try {
    const { provisionId } = await params;
    const body = await req.json();
    const { script, description } = body ?? {};
    if (typeof script !== 'string') return fail('script is required', 400);

    // 1. Push to GenieACS (source of truth)
    let syncError: string | null = null;
    try {
      await createOrUpdateProvision(provisionId, script);
    } catch (syncErr) {
      syncError = (syncErr as Error).message;
    }

    // 2. Update Prisma cache
    await prisma.genieacsProvision.upsert({
      where: { name: provisionId },
      update: { script, description: description ?? null, syncedAt: syncError ? null : new Date(), syncError, updatedAt: new Date() },
      create: { name: provisionId, script, description: description ?? null, syncedAt: syncError ? null : new Date(), syncError },
    });
    return ok({ _id: provisionId, syncError });
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ provisionId: string }> }) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;
  try {
    const { provisionId } = await params;
    // 1. Delete from GenieACS (source of truth) — fail hard if NBI error (not 404)
    try {
      await deleteProvision(provisionId);
    } catch (err) {
      // If GenieACS says not found, continue to delete from cache
      if (!String((err as Error).message).includes('404')) {
        return fail(`Failed to delete from GenieACS: ${(err as Error).message}`);
      }
    }
    // 2. Delete from Prisma cache
    await prisma.genieacsProvision.deleteMany({ where: { name: provisionId } });
    return ok({ _id: provisionId });
  } catch (e) {
    return fail((e as Error).message);
  }
}
