import { NextRequest, NextResponse } from 'next/server';
import { getGenieACSCredentials } from '@/app/api/settings/genieacs/route';

interface RouteParams {
  params: Promise<{ deviceId: string }>;
}

// Helper: fetch with AbortController timeout (default 15s)
async function fetchWithTimeout(url: string, options: RequestInit = {}, ms = 15000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

/**
 * Delete all pending/fault tasks for a device before submitting a new one.
 * Prevents task accumulation when user retries or makes multiple changes quickly.
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
    console.log(`[GenieACS] Clearing ${tasks.length} stale task(s) for device...`);
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

// Security mode mapping to TR-069 values
const securityModeMap: Record<string, { beaconType: string; authMode: string; encryptionMode: string }> = {
  'None': { beaconType: 'None', authMode: 'None', encryptionMode: 'None' },
  'WPA-PSK': { beaconType: 'WPA', authMode: 'PSKAuthentication', encryptionMode: 'TKIPEncryption' },
  'WPA2-PSK': { beaconType: '11i', authMode: 'PSKAuthentication', encryptionMode: 'AESEncryption' },
  'WPA-WPA2-PSK': { beaconType: 'WPAand11i', authMode: 'PSKAuthentication', encryptionMode: 'TKIPandAESEncryption' },
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { deviceId } = await params;
    const body = await request.json();
    const { wlanIndex = 1, ssid, password, enabled = true, securityMode } = body;

    // Validation
    if (!ssid || ssid.length < 1 || ssid.length > 32) {
      return NextResponse.json(
        { success: false, error: 'SSID harus 1-32 karakter' },
        { status: 400 }
      );
    }

    // Password validation - required if security mode is not None
    const isOpen = !securityMode || securityMode === 'None';
    if (!isOpen && password && password.trim()) {
      if (password.trim().length < 8 || password.trim().length > 63) {
        return NextResponse.json(
          { success: false, error: 'Password harus 8-63 karakter' },
          { status: 400 }
        );
      }
    }

    // Get GenieACS credentials
    const credentials = await getGenieACSCredentials();

    if (!credentials) {
      return NextResponse.json(
        { success: false, error: 'GenieACS belum dikonfigurasi' },
        { status: 400 }
      );
    }

    const { host, username, password: geniePassword } = credentials;

    if (!host) {
      return NextResponse.json(
        { success: false, error: 'GenieACS host tidak dikonfigurasi' },
        { status: 400 }
      );
    }

    // Build TR-069 parameter paths
    const basePath = `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${wlanIndex}`;
    const authHeader = Buffer.from(`${username}:${geniePassword}`).toString('base64');
    
    console.log('[Admin WiFi] Update request:', { deviceId, wlanIndex, ssid, securityMode, hasPassword: !!password });

    // Build ALL parameters into ONE setParameterValues task.
    // Sending separate tasks causes accumulation: only first task benefits from connection_request,
    // the rest queue up and can fault if device goes offline between tasks.
    const parameterValues: [string, string | boolean | number, string][] = [
      [`${basePath}.SSID`, ssid, 'xsd:string'],
      [`${basePath}.Enable`, Boolean(enabled), 'xsd:boolean'],
    ];

    // Security mode — combined into same task
    if (securityMode && securityModeMap[securityMode]) {
      const { beaconType, authMode, encryptionMode } = securityModeMap[securityMode];
      parameterValues.push(
        [`${basePath}.BeaconType`, beaconType, 'xsd:string'],
        [`${basePath}.WPAAuthenticationMode`, authMode, 'xsd:string'],
        [`${basePath}.WPAEncryptionModes`, encryptionMode, 'xsd:string'],
        [`${basePath}.IEEE11iAuthenticationMode`, authMode, 'xsd:string'],
        [`${basePath}.IEEE11iEncryptionModes`, encryptionMode, 'xsd:string'],
      );
    }

    // Password — combined into same task
    if (!isOpen && password?.trim()) {
      parameterValues.push(
        [`${basePath}.KeyPassphrase`, password.trim(), 'xsd:string'],
        [`${basePath}.PreSharedKey.1.KeyPassphrase`, password.trim(), 'xsd:string'],
      );
    }

    // Clear stale pending/fault tasks before submitting — prevents accumulation
    await clearPendingTasks(host, deviceId, authHeader);

    // ONE task, ONE connection_request — device applies everything in a single TR-069 session
    const taskUrl = `${host}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=30000&connection_request`;
    const response = await fetchWithTimeout(taskUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authHeader}`,
      },
      body: JSON.stringify({ name: 'setParameterValues', parameterValues }),
    }, 35000);

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Admin WiFi] Task error:', response.status, errText);
      throw new Error(`GenieACS error: ${errText}`);
    }

    const taskResult = await response.json();
    // 200 = task executed immediately on device during this session
    // 202 = task queued, will apply on next device TR-069 inform
    const executed = response.status === 200;
    console.log(`[Admin WiFi] Task ${executed ? 'executed immediately' : 'queued (will apply on next inform)'}: ${taskResult._id}`);

    return NextResponse.json({
      success: true,
      message: executed
        ? 'Konfigurasi WiFi berhasil diterapkan ke device'
        : 'Konfigurasi WiFi diantrekan, akan diterapkan saat device TR-069 berikutnya',
      executed,
      taskId: taskResult._id,
    });

  } catch (error) {
    console.error('Error updating WiFi config:', error);
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { success: false, error: 'Koneksi ke GenieACS timeout. Periksa apakah server GenieACS berjalan.' },
        { status: 200 }
      );
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Terjadi kesalahan' },
      { status: 500 }
    );
  }
}

// GET - Get current WiFi configuration for a specific WLAN
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { deviceId } = await params;
    const { searchParams } = new URL(request.url);
    const wlanIndex = searchParams.get('wlanIndex') || '1';

    // Get GenieACS credentials
    const credentials = await getGenieACSCredentials();

    if (!credentials) {
      return NextResponse.json(
        { success: false, error: 'GenieACS belum dikonfigurasi' },
        { status: 400 }
      );
    }

    const { host, username, password } = credentials;

    if (!host) {
      return NextResponse.json(
        { success: false, error: 'GenieACS host tidak dikonfigurasi' },
        { status: 400 }
      );
    }

    const authHeader = Buffer.from(`${username}:${password}`).toString('base64');

    // Get device data with WLAN parameters
    const projection = encodeURIComponent(JSON.stringify({
      [`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${wlanIndex}.SSID`]: 1,
      [`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${wlanIndex}.Enable`]: 1,
      [`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${wlanIndex}.BeaconType`]: 1,
      [`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${wlanIndex}.Standard`]: 1,
      [`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${wlanIndex}.Channel`]: 1,
    }));

    const query = encodeURIComponent(JSON.stringify({ _id: deviceId }));
    const url = `${host}/devices?query=${query}&projection=${projection}`;

    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${authHeader}`
      }
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: 'Gagal mengambil data dari GenieACS' },
        { status: response.status }
      );
    }

    const devices = await response.json();
    
    if (!devices || devices.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Device tidak ditemukan' },
        { status: 404 }
      );
    }

    const device = devices[0];
    const basePath = `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${wlanIndex}`;

    // Extract values
    const getValue = (path: string): string => {
      const data = device[path];
      if (!data) return '';
      if (typeof data._value !== 'undefined') return String(data._value);
      if (typeof data.value !== 'undefined') return String(data.value);
      return '';
    };

    return NextResponse.json({
      success: true,
      config: {
        wlanIndex: parseInt(wlanIndex),
        ssid: getValue(`${basePath}.SSID`),
        enabled: getValue(`${basePath}.Enable`) === 'true' || getValue(`${basePath}.Enable`) === '1',
        beaconType: getValue(`${basePath}.BeaconType`),
        standard: getValue(`${basePath}.Standard`),
        channel: getValue(`${basePath}.Channel`),
      }
    });

  } catch (error) {
    console.error('Error getting WiFi config:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Terjadi kesalahan' },
      { status: 500 }
    );
  }
}

// PUT - Add new SSID via addObject + setParameterValues
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { deviceId } = await params;
    const body = await request.json();
    const {
      ssid,
      password,
      enabled = true,
      securityMode = 'WPA2-PSK',
      band = '2.4GHz', // '2.4GHz' | '5GHz'
      channel,
    } = body;

    if (!ssid || ssid.length < 1 || ssid.length > 32) {
      return NextResponse.json({ success: false, error: 'SSID harus 1-32 karakter' }, { status: 400 });
    }
    if (securityMode !== 'None' && (!password || password.trim().length < 8)) {
      return NextResponse.json({ success: false, error: 'Password harus minimal 8 karakter' }, { status: 400 });
    }

    const credentials = await getGenieACSCredentials();
    if (!credentials?.host) {
      return NextResponse.json({ success: false, error: 'GenieACS belum dikonfigurasi' }, { status: 400 });
    }
    const { host, username, password: geniePass } = credentials;
    const authHeader = Buffer.from(`${username}:${geniePass}`).toString('base64');
    const taskUrl = `${host}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=30000&connection_request`;

    const wlanBase = 'InternetGatewayDevice.LANDevice.1.WLANConfiguration';

    // Step 1: addObject to create new WLANConfiguration entry
    const addRes = await fetchWithTimeout(taskUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${authHeader}` },
      body: JSON.stringify({ name: 'addObject', objectName: wlanBase }),
    });
    if (!addRes.ok) throw new Error(`addObject failed: ${await addRes.text()}`);
    let newIndex = 1;
    try {
      const parsed = await addRes.json();
      if (parsed?.instanceNumber) newIndex = parseInt(String(parsed.instanceNumber));
    } catch { newIndex = 1; }

    const newPath = `${wlanBase}.${newIndex}`;
    const secMap = securityModeMap[securityMode] || securityModeMap['WPA2-PSK'];

    // Step 2: setParameterValues on new entry
    const parameterValues: [string, string | boolean | number, string][] = [
      [`${newPath}.Enable`, Boolean(enabled), 'xsd:boolean'],
      [`${newPath}.SSID`, ssid, 'xsd:string'],
      [`${newPath}.BeaconType`, secMap.beaconType, 'xsd:string'],
      [`${newPath}.WPAAuthenticationMode`, secMap.authMode, 'xsd:string'],
      [`${newPath}.WPAEncryptionModes`, secMap.encryptionMode, 'xsd:string'],
      [`${newPath}.IEEE11iAuthenticationMode`, secMap.authMode, 'xsd:string'],
      [`${newPath}.IEEE11iEncryptionModes`, secMap.encryptionMode, 'xsd:string'],
    ];
    if (securityMode !== 'None' && password?.trim()) {
      parameterValues.push([`${newPath}.KeyPassphrase`, password.trim(), 'xsd:string']);
      parameterValues.push([`${newPath}.PreSharedKey.1.KeyPassphrase`, password.trim(), 'xsd:string']);
    }
    if (channel) parameterValues.push([`${newPath}.Channel`, parseInt(String(channel)) || 0, 'xsd:unsignedInt']);
    // Frequency band (vendor-specific for Huawei)
    if (band === '5GHz') {
      parameterValues.push([`${newPath}.OperatingFrequencyBand`, '5GHz', 'xsd:string']);
      parameterValues.push([`${newPath}.Standard`, 'ac', 'xsd:string']);
    } else {
      parameterValues.push([`${newPath}.OperatingFrequencyBand`, '2.4GHz', 'xsd:string']);
      parameterValues.push([`${newPath}.Standard`, 'n', 'xsd:string']);
    }

    const setRes = await fetchWithTimeout(taskUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${authHeader}` },
      body: JSON.stringify({ name: 'setParameterValues', parameterValues }),
    });
    if (!setRes.ok) throw new Error(`setParameterValues failed: ${await setRes.text()}`);

    return NextResponse.json({
      success: true,
      message: `SSID baru "${ssid}" berhasil ditambahkan (WLAN index ${newIndex})`,
      newPath,
      newIndex,
    });

  } catch (error) {
    console.error('[Add SSID] Error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
