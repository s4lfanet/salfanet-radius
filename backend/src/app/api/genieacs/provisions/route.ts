import { NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { createOrUpdateProvision, getProvisions } from '@/lib/genieacs/api-client';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';
import { logActivity } from '@/server/services/activity-log.service';
import { prisma } from '@/server/db/client';

export async function GET() {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;
  try {
    // GenieACS is source of truth — fetch from NBI first.
    // Prisma acts as offline cache fallback when GenieACS is unreachable.
    try {
      const remote = await getProvisions();
      // Sync to Prisma cache (best-effort, non-blocking)
      for (const p of remote) {
        const name = (p as { _id?: string })._id ?? '';
        if (!name) continue;
        await prisma.genieacsProvision.upsert({
          where: { name },
          update: { script: (p as { script?: string }).script ?? '', syncedAt: new Date(), syncError: null },
          create: { name, script: (p as { script?: string }).script ?? '' },
        }).catch(() => { /* best-effort */ });
      }
      return ok(remote.map(p => ({ _id: (p as { _id?: string })._id, script: (p as { script?: string }).script, description: (p as { description?: string }).description, syncedAt: new Date(), syncError: null })), remote.length);
    } catch (nbiErr) {
      // Fallback to Prisma cache if GenieACS is unreachable
      console.warn('[GenieACS] NBI GET /provisions failed, using Prisma cache:', (nbiErr as Error).message);
      const items = await prisma.genieacsProvision.findMany({ orderBy: { name: 'asc' } });
      return ok(items.map(p => ({ _id: p.name, script: p.script, description: p.description, syncedAt: p.syncedAt, syncError: p.syncError ?? (nbiErr as Error).message })), items.length);
    }
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;
  const limited = await rateLimit(req, RateLimitPresets.moderate);
  if (limited) return fail('Too many requests', 429);
  try {
    const body = await req.json();
    const { _id, script, description } = body ?? {};
    if (!_id || typeof _id !== 'string') return fail('_id is required', 400);
    if (typeof script !== 'string') return fail('script is required', 400);

    // 1. Push to GenieACS NBI (source of truth)
    let syncError: string | null = null;
    try {
      await createOrUpdateProvision(_id, script);
    } catch (syncErr) {
      syncError = (syncErr as Error).message;
    }

    // 2. Save to Prisma cache
    await prisma.genieacsProvision.upsert({
      where: { name: _id },
      update: { script, description: description ?? null, syncedAt: syncError ? null : new Date(), syncError, updatedAt: new Date() },
      create: { name: _id, script, description: description ?? null, syncedAt: syncError ? null : new Date(), syncError },
    });

    const session = auth.session;
    await logActivity({
      username: session?.user?.name ?? 'unknown',
      userId: session?.user?.id,
      action: 'genieacs.provision.upsert',
      description: `Upserted GenieACS provision: ${_id}`,
      module: 'genieacs',
      request: req,
    });
    return ok({ _id, syncError });
  } catch (e) {
    return fail((e as Error).message);
  }
}
