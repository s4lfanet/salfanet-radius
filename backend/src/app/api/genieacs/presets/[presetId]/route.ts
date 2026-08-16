import { NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { createOrUpdatePreset, deletePreset, getPreset } from '@/lib/genieacs/api-client';
import { prisma } from '@/server/db/client';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ presetId: string }> }) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;
  try {
    const { presetId } = await params;
    // GenieACS is source of truth
    try {
      const remote = await getPreset(presetId);
      if (!remote) return fail('Preset not found', 404);
      return ok(remote);
    } catch (nbiErr) {
      const p = await prisma.genieacsPreset.findUnique({ where: { name: presetId } });
      if (!p) return fail('Preset not found', 404);
      return ok({ _id: p.name, weight: p.weight, channel: p.channel, schedule: p.schedule, events: p.events ? JSON.parse(p.events) : undefined, precondition: p.precondition, provisions: JSON.parse(p.provisions), description: p.description, syncedAt: p.syncedAt, syncError: p.syncError ?? (nbiErr as Error).message });
    }
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ presetId: string }> }) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;
  try {
    const { presetId } = await params;
    const body = await req.json();
    const { weight, channel, schedule, events, precondition, provisions, description } = body ?? {};
    if (!provisions) return fail('provisions is required', 400);

    const provisionsJson = JSON.stringify(Array.isArray(provisions) ? provisions : []);
    const eventsJson = events ? JSON.stringify(events) : null;

    // 1. Push to GenieACS (source of truth)
    let syncError: string | null = null;
    try {
      const { _id: _ignored, description: _desc, syncedAt: _st, syncError: _se, ...nbiData } = body;
      void _ignored; void _desc; void _st; void _se;
      await createOrUpdatePreset(presetId, nbiData);
    } catch (syncErr) {
      syncError = (syncErr as Error).message;
    }

    // 2. Update Prisma cache
    await prisma.genieacsPreset.upsert({
      where: { name: presetId },
      update: { weight: weight ?? 100, channel: channel ?? null, schedule: schedule ?? null, events: eventsJson, precondition: precondition ?? null, provisions: provisionsJson, description: description ?? null, syncedAt: syncError ? null : new Date(), syncError, updatedAt: new Date() },
      create: { name: presetId, weight: weight ?? 100, channel: channel ?? null, schedule: schedule ?? null, events: eventsJson, precondition: precondition ?? null, provisions: provisionsJson, description: description ?? null, syncedAt: syncError ? null : new Date(), syncError },
    });
    return ok({ _id: presetId, syncError });
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ presetId: string }> }) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;
  try {
    const { presetId } = await params;
    // 1. Delete from GenieACS (source of truth)
    try {
      await deletePreset(presetId);
    } catch (err) {
      if (!String((err as Error).message).includes('404')) {
        return fail(`Failed to delete from GenieACS: ${(err as Error).message}`);
      }
    }
    // 2. Delete from Prisma cache
    await prisma.genieacsPreset.deleteMany({ where: { name: presetId } });
    return ok({ _id: presetId });
  } catch (e) {
    return fail((e as Error).message);
  }
}
