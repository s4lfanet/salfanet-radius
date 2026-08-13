import { NextRequest, NextResponse } from 'next/server';
import { getGenieACSCredentials } from '../../../route';

export interface FlatParameter {
  path: string;
  value: string;
  type: string;
  writable: boolean;
}

// Recursively flatten GenieACS nested device object into flat {path, value, type, writable}[]
function flattenParameters(
  obj: Record<string, unknown>,
  prefix: string = '',
  result: FlatParameter[] = []
): FlatParameter[] {
  for (const key of Object.keys(obj)) {
    // Skip internal GenieACS metadata keys at root level
    if (prefix === '' && (key === '_id' || key === '_deviceId' || key === '_lastInform' ||
        key === '_registered' || key === '_lastBootstrap' || key === '_tags' ||
        key === '_customCommands' || key === '_events')) {
      continue;
    }
    // Skip metadata keys within parameter objects
    if (key.startsWith('_')) continue;

    const val = obj[key];
    const fullPath = prefix ? `${prefix}.${key}` : key;

    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const valObj = val as Record<string, unknown>;
      // If it has _value, it's a leaf parameter
      if ('_value' in valObj) {
        const rawValue = valObj._value;
        let strValue: string;
        if (rawValue === null || rawValue === undefined) {
          strValue = '';
        } else if (typeof rawValue === 'boolean') {
          strValue = rawValue ? 'true' : 'false';
        } else if (typeof rawValue === 'object') {
          strValue = JSON.stringify(rawValue);
        } else {
          strValue = String(rawValue);
        }
        result.push({
          path: fullPath,
          value: strValue,
          type: typeof valObj._type === 'string' ? valObj._type : 'string',
          writable: valObj._writable === true,
        });
      } else if ('_object' in valObj) {
        // It's a container object - recurse into its children (skip _object, _writable, etc.)
        const children = Object.fromEntries(
          Object.entries(valObj).filter(([k]) => !k.startsWith('_'))
        );
        flattenParameters(children, fullPath, result);
      } else {
        // Regular nested object - recurse
        const children = Object.fromEntries(
          Object.entries(valObj).filter(([k]) => !k.startsWith('_'))
        );
        if (Object.keys(children).length > 0) {
          flattenParameters(children, fullPath, result);
        }
      }
    }
    // Skip non-object values at top level (shouldn't happen in GenieACS format)
  }
  return result;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  try {
    const { deviceId } = await params;

    if (!deviceId) {
      return NextResponse.json({ success: false, error: 'Device ID is required' }, { status: 400 });
    }

    const credentials = await getGenieACSCredentials();
    if (!credentials) {
      return NextResponse.json({ success: false, error: 'GenieACS not configured' }, { status: 400 });
    }

    const { host, username, password } = credentials;
    const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

    const query = JSON.stringify({ _id: deviceId });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    let response: Response;
    try {
      response = await fetch(`${host}/devices/?query=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`GenieACS API returned ${response.status}`);
    }

    const devicesArray = await response.json() as Record<string, unknown>[];
    if (!devicesArray || devicesArray.length === 0) {
      return NextResponse.json({ success: false, error: 'Device not found' }, { status: 404 });
    }

    const deviceRaw = devicesArray[0];
    const parameters = flattenParameters(deviceRaw);
    parameters.sort((a, b) => a.path.localeCompare(b.path));

    return NextResponse.json({ success: true, parameters, total: parameters.length });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to fetch parameters';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
