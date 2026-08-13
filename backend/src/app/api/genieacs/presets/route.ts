import { NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { createOrUpdatePreset } from '@/lib/genieacs/api-client';
import { prisma } from '@/server/db/client';

export async function GET() {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;
  try {
    const items = await prisma.genieacsPreset.findMany({ orderBy: { weight: 'asc' } });
    return ok(items.map(p => ({
      _id: p.name,
      weight: p.weight,
      channel: p.channel,
      schedule: p.schedule,
      events: p.events ? JSON.parse(p.events) : undefined,
      precondition: p.precondition,
      provisions: JSON.parse(p.provisions),
      description: p.description,
      syncedAt: p.syncedAt,
      syncError: p.syncError,
    })), items.length);
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;
  try {
    const body = await req.json();
    const { _id, weight, channel, schedule, events, precondition, provisions, description } = body ?? {};
    if (!_id || typeof _id !== 'string') return fail('_id is required', 400);
    if (!provisions) return fail('provisions is required', 400);

    const provisionsJson = JSON.stringify(Array.isArray(provisions) ? provisions : []);
    const eventsJson = events ? JSON.stringify(events) : null;

    // 1. Save to Prisma
    await prisma.genieacsPreset.upsert({
      where: { name: _id },
      update: { weight: weight ?? 100, channel: channel ?? null, schedule: schedule ?? null, events: eventsJson, precondition: precondition ?? null, provisions: provisionsJson, description: description ?? null, syncedAt: null, syncError: null, updatedAt: new Date() },
      create: { name: _id, weight: weight ?? 100, channel: channel ?? null, schedule: schedule ?? null, events: eventsJson, precondition: precondition ?? null, provisions: provisionsJson, description: description ?? null },
    });

    // 2. Sync to GenieACS
    let syncError: string | null = null;
    try {
      const { _id: _ignored, description: _desc, syncedAt: _st, syncError: _se, ...nbiData } = body;
      void _ignored; void _desc; void _st; void _se;
      await createOrUpdatePreset(_id, nbiData);
      await prisma.genieacsPreset.update({ where: { name: _id }, data: { syncedAt: new Date(), syncError: null } });
    } catch (syncErr) {
      syncError = (syncErr as Error).message;
      await prisma.genieacsPreset.update({ where: { name: _id }, data: { syncError } });
    }
    return ok({ _id, syncError });
  } catch (e) {
    return fail((e as Error).message);
  }
}
