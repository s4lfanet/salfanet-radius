/**
 * POST /api/genieacs/sync
 * Push all Prisma-stored provisions, presets, and VP scripts to GenieACS NBI.
 * Use this after GenieACS restart to restore all configs from Prisma (source of truth).
 */
import { NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import {
  createOrUpdateProvision,
  createOrUpdatePreset,
  createOrUpdateVirtualParameter,
} from '@/lib/genieacs/api-client';
import { prisma } from '@/server/db/client';

export async function POST(req: NextRequest) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;

  const body = await req.json().catch(() => ({}));
  const types: string[] = body?.types ?? ['provisions', 'presets', 'virtualParameters'];

  const results: Record<string, { success: number; failed: number; errors: string[] }> = {};

  // Sync provisions
  if (types.includes('provisions')) {
    const r = { success: 0, failed: 0, errors: [] as string[] };
    const items = await prisma.genieacsProvision.findMany();
    for (const item of items) {
      try {
        await createOrUpdateProvision(item.name, item.script);
        await prisma.genieacsProvision.update({ where: { id: item.id }, data: { syncedAt: new Date(), syncError: null } });
        r.success++;
      } catch (e) {
        const msg = `${item.name}: ${(e as Error).message}`;
        r.errors.push(msg);
        await prisma.genieacsProvision.update({ where: { id: item.id }, data: { syncError: (e as Error).message } });
        r.failed++;
      }
    }
    results.provisions = r;
  }

  // Sync presets
  if (types.includes('presets')) {
    const r = { success: 0, failed: 0, errors: [] as string[] };
    const items = await prisma.genieacsPreset.findMany();
    for (const item of items) {
      try {
        const nbiData = {
          weight: item.weight,
          channel: item.channel ?? undefined,
          schedule: item.schedule ?? undefined,
          events: item.events ? JSON.parse(item.events) : undefined,
          precondition: item.precondition ?? undefined,
          provisions: JSON.parse(item.provisions),
        };
        await createOrUpdatePreset(item.name, nbiData);
        await prisma.genieacsPreset.update({ where: { id: item.id }, data: { syncedAt: new Date(), syncError: null } });
        r.success++;
      } catch (e) {
        const msg = `${item.name}: ${(e as Error).message}`;
        r.errors.push(msg);
        await prisma.genieacsPreset.update({ where: { id: item.id }, data: { syncError: (e as Error).message } });
        r.failed++;
      }
    }
    results.presets = r;
  }

  // Sync virtual parameter scripts
  if (types.includes('virtualParameters')) {
    const r = { success: 0, failed: 0, errors: [] as string[] };
    const items = await prisma.genieacsVpScript.findMany();
    for (const item of items) {
      try {
        await createOrUpdateVirtualParameter(item.name, item.script);
        await prisma.genieacsVpScript.update({ where: { id: item.id }, data: { syncedAt: new Date(), syncError: null } });
        r.success++;
      } catch (e) {
        const msg = `${item.name}: ${(e as Error).message}`;
        r.errors.push(msg);
        await prisma.genieacsVpScript.update({ where: { id: item.id }, data: { syncError: (e as Error).message } });
        r.failed++;
      }
    }
    results.virtualParameters = r;
  }

  const totalFailed = Object.values(results).reduce((s, r) => s + r.failed, 0);
  return ok({ results, status: totalFailed === 0 ? 'ok' : 'partial' });
}
