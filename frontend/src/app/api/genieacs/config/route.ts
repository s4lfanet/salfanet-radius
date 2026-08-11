import { NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { getConfigs, setConfig, deleteConfig } from '@/lib/genieacs/api-client';

export async function GET() {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;
  try {
    const items = await getConfigs();
    return ok(items, items.length);
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;
  try {
    const body = await req.json();
    const { id, value } = body ?? {};
    if (!id || typeof id !== 'string') return fail('id is required', 400);
    if (value === undefined || value === null) return fail('value is required', 400);
    await setConfig(id, value);
    return ok({ id, value });
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
    await deleteConfig(id);
    return ok({ id });
  } catch (e) {
    return fail((e as Error).message);
  }
}
