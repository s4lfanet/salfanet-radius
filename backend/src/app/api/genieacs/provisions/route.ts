import { NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { createOrUpdateProvision } from '@/lib/genieacs/api-client';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';
import { logActivity } from '@/server/services/activity-log.service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';

export async function GET() {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;
  try {
    // Read from Prisma (source of truth)
    const items = await prisma.genieacsProvision.findMany({ orderBy: { name: 'asc' } });
    return ok(items.map(p => ({ _id: p.name, script: p.script, description: p.description, syncedAt: p.syncedAt, syncError: p.syncError })), items.length);
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;
  const limited = await rateLimit(req, RateLimitPresets.moderate);
  if (limited) return limited;
  try {
    const body = await req.json();
    const { _id, script, description } = body ?? {};
    if (!_id || typeof _id !== 'string') return fail('_id is required', 400);
    if (typeof script !== 'string') return fail('script is required', 400);

    // 1. Save to Prisma (source of truth)
    await prisma.genieacsProvision.upsert({
      where: { name: _id },
      update: { script, description: description ?? null, syncedAt: null, syncError: null, updatedAt: new Date() },
      create: { name: _id, script, description: description ?? null },
    });

    // 2. Push to GenieACS NBI (best-effort, non-blocking)
    let syncError: string | null = null;
    try {
      await createOrUpdateProvision(_id, script);
      await prisma.genieacsProvision.update({ where: { name: _id }, data: { syncedAt: new Date(), syncError: null } });
    } catch (syncErr) {
      syncError = (syncErr as Error).message;
      await prisma.genieacsProvision.update({ where: { name: _id }, data: { syncError } });
    }

    const session = await getServerSession(authOptions);
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
