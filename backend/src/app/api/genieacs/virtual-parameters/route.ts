import { type NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { createOrUpdateVirtualParameter } from '@/lib/genieacs/api-client';
import { prisma } from '@/server/db/client';

/**
 * GET /api/genieacs/virtual-parameters
 *   Returns all VP scripts from Prisma (source of truth).
 *
 * POST /api/genieacs/virtual-parameters
 *   body: { _id: string, script: string, description?: string }
 *   Saves to Prisma and syncs to GenieACS NBI.
 */
export async function GET() {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;

  try {
    const items = await prisma.genieacsVpScript.findMany({ orderBy: { name: 'asc' } });
    return ok(items.map(v => ({ _id: v.name, script: v.script, description: v.description, syncedAt: v.syncedAt, syncError: v.syncError })), items.length);
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

    // 1. Save to Prisma
    await prisma.genieacsVpScript.upsert({
      where: { name: _id },
      update: { script, description: description ?? null, syncedAt: null, syncError: null, updatedAt: new Date() },
      create: { name: _id, script, description: description ?? null },
    });

    // 2. Sync to GenieACS
    let syncError: string | null = null;
    try {
      await createOrUpdateVirtualParameter(_id, script);
      await prisma.genieacsVpScript.update({ where: { name: _id }, data: { syncedAt: new Date(), syncError: null } });
    } catch (syncErr) {
      syncError = (syncErr as Error).message;
      await prisma.genieacsVpScript.update({ where: { name: _id }, data: { syncError } });
    }
    return ok({ _id, syncError });
  } catch (e) {
    return fail((e as Error).message);
  }
}
