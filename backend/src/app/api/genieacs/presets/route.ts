import { NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { createOrUpdatePreset, getPresets } from '@/lib/genieacs/api-client';
import { prisma } from '@/server/db/client';

export async function GET() {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;
  try {
    // GenieACS is source of truth — fetch from NBI first.
    try {
      const remote = await getPresets();
      // Sync to Prisma cache (best-effort)
      for (const p of remote) {
        const name = (p as { _id?: string })._id ?? '';
        if (!name) continue;
        const provisions = JSON.stringify((p as { provisions?: unknown }).provisions ?? []);
        const events = (p as { events?: unknown }).events ? JSON.stringify((p as { events?: unknown }).events) : null;
        await prisma.genieacsPreset.upsert({
          where: { name },
          update: { weight: (p as { weight?: number }).weight ?? 100, channel: (p as { channel?: string }).channel ?? null, schedule: (p as { schedule?: string }).schedule ?? null, events, precondition: (p as { precondition?: string }).precondition ?? null, provisions, syncedAt: new Date(), syncError: null },
          create: { name, weight: (p as { weight?: number }).weight ?? 100, channel: (p as { channel?: string }).channel ?? null, schedule: (p as { schedule?: string }).schedule ?? null, events, precondition: (p as { precondition?: string }).precondition ?? null, provisions },
        }).catch(() => { /* best-effort */ });
      }
      return ok(remote, remote.length);
    } catch (nbiErr) {
      // Fallback to Prisma cache
      console.warn('[GenieACS] NBI GET /presets failed, using Prisma cache:', (nbiErr as Error).message);
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
        syncError: p.syncError ?? (nbiErr as Error).message,
      })), items.length);
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
    const { _id, weight, channel, schedule, events, precondition, provisions, description } = body ?? {};
    if (!_id || typeof _id !== 'string') return fail('_id is required', 400);
    if (!provisions) return fail('provisions is required', 400);

    const provisionsJson = JSON.stringify(Array.isArray(provisions) ? provisions : []);
    const eventsJson = events ? JSON.stringify(events) : null;

    // 1. Push to GenieACS (source of truth)
    let syncError: string | null = null;
    try {
      const { _id: _ignored, description: _desc, syncedAt: _st, syncError: _se, ...nbiData } = body;
      void _ignored; void _desc; void _st; void _se;
      await createOrUpdatePreset(_id, nbiData);
    } catch (syncErr) {
      syncError = (syncErr as Error).message;
    }

    // 2. Save to Prisma cache
    await prisma.genieacsPreset.upsert({
      where: { name: _id },
      update: { weight: weight ?? 100, channel: channel ?? null, schedule: schedule ?? null, events: eventsJson, precondition: precondition ?? null, provisions: provisionsJson, description: description ?? null, syncedAt: syncError ? null : new Date(), syncError, updatedAt: new Date() },
      create: { name: _id, weight: weight ?? 100, channel: channel ?? null, schedule: schedule ?? null, events: eventsJson, precondition: precondition ?? null, provisions: provisionsJson, description: description ?? null, syncedAt: syncError ? null : new Date(), syncError },
    });
    return ok({ _id, syncError });
  } catch (e) {
    return fail((e as Error).message);
  }
}
