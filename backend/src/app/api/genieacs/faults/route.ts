import { NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { getFaults, deleteFault } from '@/lib/genieacs/api-client';

export async function GET(req: NextRequest) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;
  try {
    const url = new URL(req.url);
    const device = url.searchParams.get('device');
    const query = device ? { device } : undefined;
    const faults = await getFaults(query);
    return ok(faults, faults.length);
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const id = body?.id;
    if (!id || typeof id !== 'string') return fail('id is required', 400);
    await deleteFault(id);
    return ok({ id });
  } catch (e) {
    return fail((e as Error).message);
  }
}
