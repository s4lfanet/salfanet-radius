import { type NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { getDevices, countDevices } from '@/lib/genieacs/api-client';

/**
 * GET /api/genieacs/devices
 *
 * Query params:
 *   query   – GenieACS filter JSON (default: {})
 *   projection – comma-separated param paths (optional)
 *   limit   – max items to return (default 100)
 *   skip    – offset (default 0)
 */
export async function GET(req: NextRequest) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;

  try {
    const url = new URL(req.url);
    const queryRaw = url.searchParams.get('query');
    const projection = url.searchParams.get('projection') ?? undefined;
    const limit = parseInt(url.searchParams.get('limit') ?? '100', 10);
    const skip = parseInt(url.searchParams.get('skip') ?? '0', 10);

    let filter: object = {};
    if (queryRaw) {
      try {
        filter = JSON.parse(queryRaw);
      } catch {
        return fail('Invalid JSON in query param', 400);
      }
    }

    const [devices, total] = await Promise.all([
      getDevices(filter, projection),
      countDevices(filter),
    ]);

    const page = devices.slice(skip, skip + limit);
    return ok(page, total);
  } catch (e) {
    return fail((e as Error).message);
  }
}
