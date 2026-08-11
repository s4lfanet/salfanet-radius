import { type NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { nbiRequest } from '@/lib/genieacs/api-client';

export interface FlatParameter {
  path: string;
  value: string | number | boolean | null;
  type: string | null;
  writable: boolean;
  object: boolean;
  timestamp: number | null;
}

/**
 * Recursively flattens a GenieACS device document into a flat list of parameters.
 *
 * GenieACS stores parameters as nested objects with metadata fields:
 *   { _value, _type, _timestamp, _writable, _object }
 *
 * Objects (sub-trees) have `_object: true`.
 * Leaf parameters have `_value` (the cached value from CPE).
 */
function flattenParams(
  node: Record<string, unknown>,
  prefix: string,
  result: FlatParameter[],
  maxDepth = 20,
  depth = 0,
) {
  if (depth > maxDepth) return;

  const isLeaf = '_value' in node || ('_object' in node && node._object === false);
  const isObject = '_object' in node && node._object === true;

  if (isLeaf || isObject) {
    result.push({
      path: prefix,
      value: '_value' in node ? (node._value as string | number | boolean | null) : null,
      type: (node._type as string | null) ?? null,
      writable: (node._writable as boolean) ?? false,
      object: (node._object as boolean) ?? false,
      timestamp: (node._timestamp as number | null) ?? null,
    });
  }

  // Recurse into child nodes (skip metadata keys)
  for (const key of Object.keys(node)) {
    if (key.startsWith('_')) continue;
    const child = node[key];
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      const childPath = prefix ? `${prefix}.${key}` : key;
      flattenParams(child as Record<string, unknown>, childPath, result, maxDepth, depth + 1);
    }
  }
}

/**
 * GET /api/genieacs/devices/[deviceId]/all-parameters
 *
 * Returns the full cached parameter snapshot of the device from GenieACS NBI.
 * No TR-069 connection is made — this reads what GenieACS already knows.
 *
 * Query params:
 *   search  – filter path by substring (optional)
 *   writable – "true" to show only writable params (optional)
 *   objects  – "false" to hide object nodes (optional)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;

  try {
    const { deviceId } = await params;
    const url = new URL(req.url);
    const search = url.searchParams.get('search')?.toLowerCase() ?? '';
    const writableOnly = url.searchParams.get('writable') === 'true';
    const hideObjects = url.searchParams.get('objects') === 'false';

    // Fetch the full device document (no projection = all cached params)
    const devices = await nbiRequest<Record<string, unknown>[]>(
      '/devices',
      { query: { query: JSON.stringify({ _id: deviceId }) } },
    );
    if (!devices || devices.length === 0) {
      return fail('Device not found', 404);
    }
    const device = devices[0];

    // Flatten parameters
    const flat: FlatParameter[] = [];
    for (const key of Object.keys(device)) {
      if (key.startsWith('_')) continue; // skip _id, _lastInform, etc.
      const node = device[key];
      if (node && typeof node === 'object' && !Array.isArray(node)) {
        flattenParams(node as Record<string, unknown>, key, flat);
      }
    }

    // Apply filters
    let result = flat;
    if (search) result = result.filter((p) => p.path.toLowerCase().includes(search));
    if (writableOnly) result = result.filter((p) => p.writable);
    if (hideObjects) result = result.filter((p) => !p.object);

    // Sort alphabetically by path
    result.sort((a, b) => a.path.localeCompare(b.path));

    return ok(result, result.length);
  } catch (e) {
    return fail((e as Error).message);
  }
}
