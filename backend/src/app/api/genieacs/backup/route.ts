import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { createOrUpdateVirtualParameter } from '@/lib/genieacs/api-client';
import { createOrUpdateProvision } from '@/lib/genieacs/api-client';
import { createOrUpdatePreset } from '@/lib/genieacs/api-client';

// ─── GET /api/genieacs/backup?type=all|vp|provisions|presets ─────────────────
// Downloads a JSON backup of GenieACS configs stored in Prisma.
export async function GET(req: NextRequest) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;

  const type = req.nextUrl.searchParams.get('type') || 'all';

  try {
    const payload: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      version: 1,
    };

    if (type === 'all' || type === 'vp') {
      const vp = await prisma.genieacsVpScript.findMany({ orderBy: { name: 'asc' } });
      payload.vpScripts = vp.map(v => ({ _id: v.name, script: v.script, description: v.description }));
    }

    if (type === 'all' || type === 'provisions') {
      const provisions = await prisma.genieacsProvision.findMany({ orderBy: { name: 'asc' } });
      payload.provisions = provisions.map(p => ({ _id: p.name, script: p.script, description: p.description }));
    }

    if (type === 'all' || type === 'presets') {
      const presets = await prisma.genieacsPreset.findMany({ orderBy: { weight: 'asc' } });
      payload.presets = presets.map(p => ({
        _id: p.name,
        weight: p.weight,
        channel: p.channel,
        schedule: p.schedule,
        events: p.events ? JSON.parse(p.events) : undefined,
        precondition: p.precondition,
        provisions: JSON.parse(p.provisions),
        description: p.description,
      }));
    }

    const filename = `genieacs-backup-${type}-${new Date().toISOString().slice(0, 10)}.json`;
    const json = JSON.stringify(payload, null, 2);

    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}

// ─── POST /api/genieacs/backup ────────────────────────────────────────────────
// Restores from a backup JSON. Only sections present in the body are restored.
// Body: { vpScripts?: [...], provisions?: [...], presets?: [...] }
export async function POST(req: NextRequest) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    const results: Record<string, { ok: number; errors: string[] }> = {};

    // ── Restore VP Scripts ───────────────────────────────────────────────────
    if (Array.isArray(body.vpScripts)) {
      const r = { ok: 0, errors: [] as string[] };
      for (const item of body.vpScripts) {
        if (!item._id || typeof item.script !== 'string') continue;
        try {
          await prisma.genieacsVpScript.upsert({
            where: { name: item._id },
            update: { script: item.script, description: item.description ?? null, syncedAt: null, syncError: null, updatedAt: new Date() },
            create: { name: item._id, script: item.script, description: item.description ?? null },
          });
          // Best-effort sync to GenieACS
          try {
            await createOrUpdateVirtualParameter(item._id, item.script);
            await prisma.genieacsVpScript.update({ where: { name: item._id }, data: { syncedAt: new Date(), syncError: null } });
          } catch { /* sync fail is non-fatal */ }
          r.ok++;
        } catch (e) {
          r.errors.push(`${item._id}: ${(e as Error).message}`);
        }
      }
      results.vpScripts = r;
    }

    // ── Restore Provisions ───────────────────────────────────────────────────
    if (Array.isArray(body.provisions)) {
      const r = { ok: 0, errors: [] as string[] };
      for (const item of body.provisions) {
        if (!item._id || typeof item.script !== 'string') continue;
        try {
          await prisma.genieacsProvision.upsert({
            where: { name: item._id },
            update: { script: item.script, description: item.description ?? null, syncedAt: null, syncError: null, updatedAt: new Date() },
            create: { name: item._id, script: item.script, description: item.description ?? null },
          });
          try {
            await createOrUpdateProvision(item._id, item.script);
            await prisma.genieacsProvision.update({ where: { name: item._id }, data: { syncedAt: new Date(), syncError: null } });
          } catch { /* sync fail is non-fatal */ }
          r.ok++;
        } catch (e) {
          r.errors.push(`${item._id}: ${(e as Error).message}`);
        }
      }
      results.provisions = r;
    }

    // ── Restore Presets ──────────────────────────────────────────────────────
    if (Array.isArray(body.presets)) {
      const r = { ok: 0, errors: [] as string[] };
      for (const item of body.presets) {
        if (!item._id) continue;
        try {
          const provisionsJson = JSON.stringify(Array.isArray(item.provisions) ? item.provisions : []);
          const eventsJson = item.events ? JSON.stringify(item.events) : null;
          await prisma.genieacsPreset.upsert({
            where: { name: item._id },
            update: { weight: item.weight ?? 100, channel: item.channel ?? null, schedule: item.schedule ?? null, events: eventsJson, precondition: item.precondition ?? null, provisions: provisionsJson, description: item.description ?? null, syncedAt: null, syncError: null, updatedAt: new Date() },
            create: { name: item._id, weight: item.weight ?? 100, channel: item.channel ?? null, schedule: item.schedule ?? null, events: eventsJson, precondition: item.precondition ?? null, provisions: provisionsJson, description: item.description ?? null },
          });
          try {
            const { _id, description: _d, ...nbiData } = item;
            void _d;
            await createOrUpdatePreset(_id, nbiData);
            await prisma.genieacsPreset.update({ where: { name: item._id }, data: { syncedAt: new Date(), syncError: null } });
          } catch { /* sync fail is non-fatal */ }
          r.ok++;
        } catch (e) {
          r.errors.push(`${item._id}: ${(e as Error).message}`);
        }
      }
      results.presets = r;
    }

    return NextResponse.json({ success: true, results });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
