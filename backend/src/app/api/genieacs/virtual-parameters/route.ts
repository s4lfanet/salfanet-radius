import { type NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { createOrUpdateVirtualParameter, getVirtualParameters } from '@/lib/genieacs/api-client';
import { prisma } from '@/server/db/client';

/**
 * GET /api/genieacs/virtual-parameters
 *   Returns all VP scripts from GenieACS NBI (source of truth).
 *   Falls back to Prisma cache when GenieACS is unreachable.
 *
 * POST /api/genieacs/virtual-parameters
 *   body: { _id: string, script: string, description?: string }
 *   Pushes to GenieACS NBI and caches to Prisma.
 */
export async function GET() {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;

  try {
    // GenieACS is source of truth
    try {
      const remote = await getVirtualParameters();
      // Sync to Prisma cache (best-effort)
      for (const v of remote) {
        const name = (v as { _id?: string })._id ?? '';
        if (!name) continue;
        await prisma.genieacsVpScript.upsert({
          where: { name },
          update: { script: (v as { script?: string }).script ?? '', syncedAt: new Date(), syncError: null },
          create: { name, script: (v as { script?: string }).script ?? '' },
        }).catch(() => { /* best-effort */ });
      }
      return ok(remote.map(v => ({ _id: (v as { _id?: string })._id, script: (v as { script?: string }).script, description: (v as { description?: string }).description, syncedAt: new Date(), syncError: null })), remote.length);
    } catch (nbiErr) {
      console.warn('[GenieACS] NBI GET /virtual_parameters failed, using Prisma cache:', (nbiErr as Error).message);
      const items = await prisma.genieacsVpScript.findMany({ orderBy: { name: 'asc' } });
      return ok(items.map(v => ({ _id: v.name, script: v.script, description: v.description, syncedAt: v.syncedAt, syncError: v.syncError ?? (nbiErr as Error).message })), items.length);
    }
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    const { _id, script, description } = body ?? {};
    if (!_id || typeof _id !== 'string') return fail('_id is required', 400);
    if (typeof script !== 'string') return fail('script is required', 400);

    // 1. Push to GenieACS (source of truth)
    let syncError: string | null = null;
    try {
      await createOrUpdateVirtualParameter(_id, script);
    } catch (syncErr) {
      syncError = (syncErr as Error).message;
    }

    // 2. Cache to Prisma
    await prisma.genieacsVpScript.upsert({
      where: { name: _id },
      update: { script, description: description ?? null, syncedAt: syncError ? null : new Date(), syncError, updatedAt: new Date() },
      create: { name: _id, script, description: description ?? null, syncedAt: syncError ? null : new Date(), syncError },
    });
    return ok({ _id, syncError });
  } catch (e) {
    return fail((e as Error).message);
  }
}
