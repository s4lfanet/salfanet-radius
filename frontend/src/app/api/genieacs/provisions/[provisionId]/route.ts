import { NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { createOrUpdateProvision, deleteProvision } from '@/lib/genieacs/api-client';
import { prisma } from '@/server/db/client';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ provisionId: string }> }) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;
  try {
    const { provisionId } = await params;
    const p = await prisma.genieacsProvision.findUnique({ where: { name: provisionId } });
    if (!p) return fail('Provision not found', 404);
    return ok({ _id: p.name, script: p.script, description: p.description, syncedAt: p.syncedAt, syncError: p.syncError });
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

    // 1. Save to Prisma
    await prisma.genieacsProvision.upsert({
      where: { name: provisionId },
      update: { script, description: description ?? null, syncedAt: null, syncError: null, updatedAt: new Date() },
      create: { name: provisionId, script, description: description ?? null },
    });

    // 2. Sync to GenieACS
    let syncError: string | null = null;
    try {
      await createOrUpdateProvision(provisionId, script);
      await prisma.genieacsProvision.update({ where: { name: provisionId }, data: { syncedAt: new Date(), syncError: null } });
    } catch (syncErr) {
      syncError = (syncErr as Error).message;
      await prisma.genieacsProvision.update({ where: { name: provisionId }, data: { syncError } });
    }
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
    // Delete from Prisma first
    await prisma.genieacsProvision.deleteMany({ where: { name: provisionId } });
    // Delete from GenieACS (best-effort)
    try { await deleteProvision(provisionId); } catch { /* ignore if not found */ }
    return ok({ _id: provisionId });
  } catch (e) {
    return fail((e as Error).message);
  }
}
