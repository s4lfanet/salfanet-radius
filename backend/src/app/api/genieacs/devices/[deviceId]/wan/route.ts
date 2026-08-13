import { NextRequest, NextResponse } from 'next/server';
import { getGenieACSCredentials } from '@/app/api/settings/genieacs/route';

interface RouteParams {
  params: Promise<{ deviceId: string }>;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, ms = 20000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function sendTask(taskUrl: string, authHeader: string, task: Record<string, unknown>): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await fetchWithTimeout(taskUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${authHeader}` },
    body: JSON.stringify(task),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

/**
 * Delete all pending/fault tasks for a device before submitting a new one.
 * Prevents stale task accumulation when user retries or makes rapid changes.
 */
async function clearPendingTasks(host: string, deviceId: string, authHeader: string): Promise<void> {
  try {
    const query = encodeURIComponent(JSON.stringify({ device: deviceId }));
    const res = await fetch(`${host}/tasks?query=${query}`, {
      headers: { Authorization: `Basic ${authHeader}` },
    });
    if (!res.ok) return;
    const tasks = await res.json();
    if (!Array.isArray(tasks) || tasks.length === 0) return;
    console.log(`[GenieACS WAN] Clearing ${tasks.length} stale task(s) for device...`);
    await Promise.all(
      tasks.map((t: { _id: string }) =>
        fetch(`${host}/tasks/${t._id}`, {
          method: 'DELETE',
          headers: { Authorization: `Basic ${authHeader}` },
        }).catch(() => {})
      )
    );
  } catch {
    // Non-fatal — proceed even if cleanup fails
  }
}

// POST - Update existing WAN connection (PPPoE creds, enable, VLAN, service)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { deviceId } = await params;
    const body = await request.json();
    const { connectionPath, connectionType, username, password, enable, vlanId, vlanPriority, serviceList, natEnabled } = body;

    if (!connectionPath) {
      return NextResponse.json({ success: false, error: 'Connection path is required' }, { status: 400 });
    }

    const credentials = await getGenieACSCredentials();
    if (!credentials?.host) {
      return NextResponse.json({ success: false, error: 'GenieACS belum dikonfigurasi' }, { status: 400 });
    }

    const { host, username: genieUser, password: geniePass } = credentials;
    const authHeader = Buffer.from(`${genieUser}:${geniePass}`).toString('base64');
    const taskUrl = `${host}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=30000&connection_request`;

    // ── Main parameters (universal, safe to combine) ──
    const parameterValues: [string, string | boolean | number, string][] = [];

    if (connectionType === 'PPPoE') {
      if (username) parameterValues.push([`${connectionPath}.Username`, username, 'xsd:string']);
      if (password) parameterValues.push([`${connectionPath}.Password`, password, 'xsd:string']);
    }
    if (enable !== undefined) {
      parameterValues.push([`${connectionPath}.Enable`, Boolean(enable), 'xsd:boolean']);
    }
    if (natEnabled !== undefined) {
      parameterValues.push([`${connectionPath}.NATEnabled`, Boolean(natEnabled), 'xsd:boolean']);
    }

    if (parameterValues.length === 0 && vlanId === undefined && vlanPriority === undefined && !serviceList) {
      return NextResponse.json({ success: false, error: 'No parameters to update' }, { status: 400 });
    }

    // Clear stale tasks before submitting new ones
    await clearPendingTasks(host, deviceId, authHeader);

    // Send main task (connection credentials + enable/NAT)
    let executed = false;
    if (parameterValues.length > 0) {
      const { ok, status, text } = await sendTask(taskUrl, authHeader, { name: 'setParameterValues', parameterValues });
      if (!ok) throw new Error(`GenieACS task error: ${text}`);
      executed = status === 200;
    }

    // ── Vendor-specific params as a SEPARATE best-effort task ──
    // These vary by vendor (Huawei/ZTE/CMCC) — isolating them so a fault here
    // does not block the main connection task above.
    const vendorParams: [string, string | boolean | number, string][] = [];
    if (vlanId !== undefined && vlanId !== '') {
      const vid = parseInt(String(vlanId));
      if (!isNaN(vid)) {
        vendorParams.push([`${connectionPath}.X_HW_VLAN`, vid, 'xsd:unsignedInt']);
        vendorParams.push([`${connectionPath}.X_ZTE-COM_VLANIDMark`, vid, 'xsd:unsignedInt']);
        vendorParams.push([`${connectionPath}.X_CMCC_VLANIDMark`, vid, 'xsd:unsignedInt']);
      }
    }
    if (vlanPriority !== undefined && vlanPriority !== '') {
      const prio = parseInt(String(vlanPriority));
      if (!isNaN(prio)) {
        vendorParams.push([`${connectionPath}.X_HW_VLANPriority`, prio, 'xsd:unsignedInt']);
      }
    }
    if (serviceList) {
      vendorParams.push([`${connectionPath}.X_HW_ServiceList`, serviceList, 'xsd:string']);
      vendorParams.push([`${connectionPath}.X_ZTE-COM_ServiceList`, serviceList, 'xsd:string']);
    }

    if (vendorParams.length > 0) {
      // Use a shorter timeout for vendor params — we don't want to block on these
      const vendorTaskUrl = `${host}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=15000&connection_request`;
      const { ok: vok, text: vtext } = await sendTask(vendorTaskUrl, authHeader, {
        name: 'setParameterValues',
        parameterValues: vendorParams,
      }).catch((e) => ({ ok: false, status: 0, text: String(e) }));
      if (!vok) {
        console.warn('[WAN Update] Vendor-specific params task failed (expected on some devices):', vtext);
      }
    }

    return NextResponse.json({
      success: true,
      message: executed
        ? 'WAN settings applied to device immediately'
        : 'WAN settings queued, will apply on next device TR-069 session',
      executed,
    });

  } catch (error: unknown) {
    console.error('[WAN Update] Error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

// PUT - Add new WAN connection (addObject + setParameterValues)
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { deviceId } = await params;
    const body = await request.json();
    const {
      wanDeviceIndex = 1,
      wanConnectionDeviceIndex = 1,
      connectionType = 'PPPoE', // 'PPPoE' | 'IP'
      username,
      password,
      vlanId,
      vlanPriority,
      serviceList = 'INTERNET',
      enable = true,
      natEnabled = true,
      name,
    } = body;

    const credentials = await getGenieACSCredentials();
    if (!credentials?.host) {
      return NextResponse.json({ success: false, error: 'GenieACS belum dikonfigurasi' }, { status: 400 });
    }

    const { host, username: genieUser, password: geniePass } = credentials;
    const authHeader = Buffer.from(`${genieUser}:${geniePass}`).toString('base64');
    const taskUrl = `${host}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=30000&connection_request`;

    const connType = connectionType === 'IP' ? 'WANIPConnection' : 'WANPPPConnection';
    const objectBasePath = `InternetGatewayDevice.WANDevice.${wanDeviceIndex}.WANConnectionDevice.${wanConnectionDeviceIndex}.${connType}`;

    // Clear stale tasks before addObject + setParameterValues sequence
    await clearPendingTasks(host, deviceId, authHeader);

    // Step 1: addObject to get new index
    const addResult = await sendTask(taskUrl, authHeader, {
      name: 'addObject',
      objectName: objectBasePath,
    });

    if (!addResult.ok) {
      throw new Error(`addObject failed: ${addResult.text}`);
    }

    // Parse new instance number from response
    let newIndex = 1;
    try {
      const parsed = JSON.parse(addResult.text);
      if (parsed?.instanceNumber) newIndex = parseInt(String(parsed.instanceNumber));
      else if (parsed?.instanceNumber === 0) newIndex = 0;
    } catch {
      // Some devices don't return instanceNumber; assume 1 or scan
      newIndex = 1;
    }

    const newPath = `${objectBasePath}.${newIndex}`;

    // Step 2: setParameterValues on new object
    const parameterValues: [string, string | boolean | number, string][] = [
      [`${newPath}.Enable`, Boolean(enable), 'xsd:boolean'],
      [`${newPath}.NATEnabled`, Boolean(natEnabled), 'xsd:boolean'],
    ];

    if (name) parameterValues.push([`${newPath}.Name`, name, 'xsd:string']);

    if (connectionType === 'PPPoE') {
      parameterValues.push([`${newPath}.ConnectionType`, 'PPPoE_Bridged', 'xsd:string']);
      if (username) parameterValues.push([`${newPath}.Username`, username, 'xsd:string']);
      if (password) parameterValues.push([`${newPath}.Password`, password, 'xsd:string']);
    } else {
      parameterValues.push([`${newPath}.ConnectionType`, 'IP_Bridged', 'xsd:string']);
    }

    if (vlanId !== undefined && vlanId !== '') {
      const vid = parseInt(String(vlanId));
      if (!isNaN(vid)) {
        // Note: vendor VLAN paths are added here as best-effort — a fault on one
        // vendor path won't fail the whole addObject operation since it's a separate
        // setParameterValues task submitted after addObject completes.
        parameterValues.push([`${newPath}.X_HW_VLAN`, vid, 'xsd:unsignedInt']);
        parameterValues.push([`${newPath}.X_ZTE-COM_VLANIDMark`, vid, 'xsd:unsignedInt']);
        parameterValues.push([`${newPath}.X_CMCC_VLANIDMark`, vid, 'xsd:unsignedInt']);
      }
    }
    if (vlanPriority !== undefined && vlanPriority !== '') {
      const prio = parseInt(String(vlanPriority));
      if (!isNaN(prio)) {
        parameterValues.push([`${newPath}.X_HW_VLANPriority`, prio, 'xsd:unsignedInt']);
      }
    }
    if (serviceList) {
      parameterValues.push([`${newPath}.X_HW_ServiceList`, serviceList, 'xsd:string']);
      parameterValues.push([`${newPath}.X_ZTE-COM_ServiceList`, serviceList, 'xsd:string']);
    }

    const setResult = await sendTask(taskUrl, authHeader, { name: 'setParameterValues', parameterValues });
    if (!setResult.ok) {
      throw new Error(`setParameterValues failed: ${setResult.text}`);
    }
    const executed = setResult.status === 200;

    return NextResponse.json({
      success: true,
      message: executed
        ? `WAN connection added to device immediately`
        : `WAN connection queued, will apply on next device TR-069 session`,
      executed,
      newPath,
    });

  } catch (error: unknown) {
    console.error('[WAN Add] Error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

// DELETE - Remove a WAN connection (deleteObject)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { deviceId } = await params;
    const body = await request.json();
    const { connectionPath } = body;

    if (!connectionPath) {
      return NextResponse.json({ success: false, error: 'Connection path is required' }, { status: 400 });
    }

    const credentials = await getGenieACSCredentials();
    if (!credentials?.host) {
      return NextResponse.json({ success: false, error: 'GenieACS belum dikonfigurasi' }, { status: 400 });
    }

    const { host, username: genieUser, password: geniePass } = credentials;
    const authHeader = Buffer.from(`${genieUser}:${geniePass}`).toString('base64');
    const taskUrl = `${host}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=30000&connection_request`;

    // Clear stale tasks before deleteObject
    await clearPendingTasks(host, deviceId, authHeader);

    const { ok, status, text } = await sendTask(taskUrl, authHeader, {
      name: 'deleteObject',
      objectName: connectionPath,
    });

    if (!ok) throw new Error(`deleteObject failed: ${text}`);
    const executed = status === 200;

    return NextResponse.json({
      success: true,
      message: executed
        ? 'WAN connection deleted from device immediately'
        : 'WAN delete queued, will apply on next device TR-069 session',
      executed,
    });

  } catch (error: unknown) {
    console.error('[WAN Delete] Error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
