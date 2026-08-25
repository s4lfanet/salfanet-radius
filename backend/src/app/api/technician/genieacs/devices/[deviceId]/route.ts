import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import { getGenieACSCredentials } from '@/app/api/settings/genieacs/route';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';
import {
  safeString,
  getParameterValue,
  extractIPFromURL,
  normalizeRxPower,
  getDeviceStatus,
  TR069_PARAMETER_PATHS,
} from '@/lib/genieacs/tr069-parser';

async function verifyTechnician(req: NextRequest) {
  const token = req.cookies.get('technician-token')?.value;
  if (!token) return null;
  try {
    const secret = TECH_JWT_SECRET;
    const { payload } = await jwtVerify(token, secret);
    if (payload.type === 'admin_user') {
      const adminUser = await prisma.adminUser.findUnique({
        where: { id: payload.id as string },
        select: { id: true, isActive: true, role: true },
      });
      if (!adminUser?.isActive || adminUser.role !== 'TECHNICIAN') return null;
      return { id: adminUser.id, isAdminUser: true as const };
    }
    const tech = await prisma.technician.findUnique({
      where: { id: payload.id as string },
      select: { id: true, isActive: true },
    });
    return tech?.isActive ? { ...tech, isAdminUser: false as const } : null;
  } catch {
    return null;
  }
}

const pp = TR069_PARAMETER_PATHS;

function extractWlanConfigs(device: any) {
  const configs: any[] = [];
  const wlanBase = device?.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration;
  if (!wlanBase || typeof wlanBase !== 'object') return configs;

  for (const idx of Object.keys(wlanBase)) {
    if (idx === '_writable' || idx === '_timestamp' || idx === '_object') continue;
    const wlan = wlanBase[idx];
    if (!wlan || typeof wlan !== 'object') continue;
    configs.push({
      index: Number(idx),
      ssid: safeString(wlan.SSID),
      enabled: safeString(wlan.Enable) === 'true' || safeString(wlan.Enable) === '1',
      band: safeString(wlan.Standard),
      totalAssociations: parseInt(safeString(wlan.TotalAssociations)) || 0,
    });
  }
  return configs;
}

function extractConnectedDevices(device: any) {
  const devices: any[] = [];

  // Build MAC -> host info map from LAN Hosts DHCP table
  const hostMap = new Map<string, { hostName: string; ipAddress: string }>();
  const hostsBase = device?.InternetGatewayDevice?.LANDevice?.['1']?.Hosts?.Host;
  if (hostsBase && typeof hostsBase === 'object') {
    for (const idx of Object.keys(hostsBase)) {
      if (idx === '_writable' || idx === '_timestamp' || idx === '_object') continue;
      const host = hostsBase[idx];
      if (!host || typeof host !== 'object') continue;
      const mac = safeString(host.MACAddress).toLowerCase();
      if (mac && mac !== '-') {
        hostMap.set(mac, {
          hostName: safeString(host.HostName),
          ipAddress: safeString(host.IPAddress),
        });
      }
    }
  }

  // Primary: iterate WLANConfiguration.X.AssociatedDevice.X for actual WiFi clients
  const wlanBase = device?.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration;
  if (wlanBase && typeof wlanBase === 'object') {
    for (const wlanIdx of Object.keys(wlanBase)) {
      if (wlanIdx === '_writable' || wlanIdx === '_timestamp' || wlanIdx === '_object') continue;
      const wlan = wlanBase[wlanIdx];
      if (!wlan || typeof wlan !== 'object') continue;

      const assocBase = wlan.AssociatedDevice;
      if (!assocBase || typeof assocBase !== 'object') continue;

      const ssid = safeString(wlan.SSID);

      for (const idx of Object.keys(assocBase)) {
        if (idx === '_writable' || idx === '_timestamp' || idx === '_object') continue;
        const assoc = assocBase[idx];
        if (!assoc || typeof assoc !== 'object') continue;

        const rawMac =
          safeString(assoc.AssociatedDeviceMACAddress) !== '-'
            ? safeString(assoc.AssociatedDeviceMACAddress)
            : safeString(assoc.MACAddress);
        if (!rawMac || rawMac === '-') continue;

        const macLower = rawMac.toLowerCase();
        const hostInfo = hostMap.get(macLower) ?? { hostName: '-', ipAddress: '-' };

        const rssi =
          safeString(assoc.SignalStrength) !== '-'
            ? safeString(assoc.SignalStrength)
            : safeString(assoc.RSSI) !== '-'
              ? safeString(assoc.RSSI)
              : '-';

        devices.push({
          hostName: hostInfo.hostName !== '-' ? hostInfo.hostName : rawMac,
          ipAddress: hostInfo.ipAddress,
          macAddress: rawMac.toUpperCase(),
          interfaceType: `WiFi (${ssid || 'SSID ' + wlanIdx})`,
          active: true,
          rssi,
        });
      }
    }
  }

  // Fallback: if no AssociatedDevice data, show LAN Hosts table
  if (devices.length === 0 && hostMap.size > 0) {
    const hostsBaseArr = device?.InternetGatewayDevice?.LANDevice?.['1']?.Hosts?.Host;
    if (hostsBaseArr && typeof hostsBaseArr === 'object') {
      for (const idx of Object.keys(hostsBaseArr)) {
        if (idx === '_writable' || idx === '_timestamp' || idx === '_object') continue;
        const host = hostsBaseArr[idx];
        if (!host || typeof host !== 'object') continue;
        devices.push({
          hostName: safeString(host.HostName),
          ipAddress: safeString(host.IPAddress),
          macAddress: safeString(host.MACAddress),
          interfaceType: safeString(host.InterfaceType),
          active: safeString(host.Active) === 'true' || safeString(host.Active) === '1',
          rssi: '-',
        });
      }
    }
  }

  return devices;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const tech = await verifyTechnician(req);
  if (!tech) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { deviceId } = await params;
  if (!deviceId) return NextResponse.json({ error: 'Device ID required' }, { status: 400 });

  // Field technicians must verify the device belongs to a customer
  // in their assigned router/area (passed as query params).
  if (!tech.isAdminUser) {
    const { searchParams } = new URL(req.url);
    const routerId = searchParams.get('routerId') || undefined;
    const areaId = searchParams.get('areaId') || undefined;
    if (!routerId && !areaId) {
      return NextResponse.json(
        { error: 'routerId or areaId parameter is required' },
        { status: 400 },
      );
    }
    const matchingUser = await prisma.pppoeUser.findFirst({
      where: {
        username: deviceId,
        ...(routerId ? { routerId } : {}),
        ...(areaId ? { areaId } : {}),
      },
      select: { id: true },
    });
    if (!matchingUser) {
      return NextResponse.json(
        { error: 'Device not found in your assigned area' },
        { status: 403 },
      );
    }
  }

  const credentials = await getGenieACSCredentials();
  if (!credentials) {
    return NextResponse.json({ success: false, error: 'GenieACS not configured' }, { status: 400 });
  }

  const { host, username, password } = credentials;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const query = JSON.stringify({ _id: deviceId });
    const response = await fetch(`${host}/devices?query=${encodeURIComponent(query)}`, {
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`GenieACS returned ${response.status}`);

    const devicesRaw = await response.json();
    if (!devicesRaw || devicesRaw.length === 0) {
      return NextResponse.json({ success: false, error: 'Device not found' }, { status: 404 });
    }

    const device = devicesRaw[0];
    const deviceIdObj = device._deviceId || {};

    let tr069IP = getParameterValue(device, pp.tr069IP);
    if (tr069IP !== '-' && tr069IP.includes('://')) tr069IP = extractIPFromURL(tr069IP);

    const connectedDevices = extractConnectedDevices(device);
    const wlanConfigs = extractWlanConfigs(device);

    const detail = {
      _id: String(device._id || ''),
      serialNumber: safeString(deviceIdObj._SerialNumber) !== '-' ? safeString(deviceIdObj._SerialNumber) : getParameterValue(device, pp.serialNumber),
      manufacturer: safeString(deviceIdObj._Manufacturer) !== '-' ? safeString(deviceIdObj._Manufacturer) : getParameterValue(device, pp.manufacturer),
      model: safeString(deviceIdObj._ProductClass) !== '-' ? safeString(deviceIdObj._ProductClass) : getParameterValue(device, pp.model),
      pppoeUsername: getParameterValue(device, pp.pppUsername),
      pppoeIP: getParameterValue(device, pp.pppoeIP),
      tr069IP,
      rxPower: normalizeRxPower(getParameterValue(device, pp.rxPower)),
      txPower: normalizeRxPower(getParameterValue(device, pp.txPower)),
      ponMode: getParameterValue(device, pp.ponMode),
      uptime: getParameterValue(device, pp.uptime),
      macAddress: getParameterValue(device, pp.macAddress),
      softwareVersion: getParameterValue(device, pp.softwareVersion),
      hardwareVersion: getParameterValue(device, pp.hardwareVersion),
      lanIP: getParameterValue(device, pp.lanIP),
      pppoeStatus: getParameterValue(device, pp.pppoeStatus),
      pppoeGateway: getParameterValue(device, pp.pppoeGateway),
      pppoeDNS: getParameterValue(device, pp.pppoeDNS),
      status: getDeviceStatus(device._lastInform),
      lastInform: device._lastInform ? String(device._lastInform) : null,
      totalConnected: connectedDevices.length,
      connectedDevices,
      wlanConfigs,
    };

    return NextResponse.json({ success: true, device: detail });
  } catch (error: any) {
    clearTimeout(timeoutId);
    const msg = error.name === 'AbortError' ? 'Connection timeout.' : error.message || 'Failed to fetch device';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// POST - Reboot device or set WiFi parameters
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const tech = await verifyTechnician(req);
  if (!tech) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { deviceId } = await params;
  if (!deviceId) return NextResponse.json({ error: 'Device ID required' }, { status: 400 });

  // Field technicians must verify the device belongs to a customer
  // in their assigned router/area (passed as query params).
  if (!tech.isAdminUser) {
    const { searchParams } = new URL(req.url);
    const routerId = searchParams.get('routerId') || undefined;
    const areaId = searchParams.get('areaId') || undefined;
    if (!routerId && !areaId) {
      return NextResponse.json(
        { error: 'routerId or areaId parameter is required' },
        { status: 400 },
      );
    }
    const matchingUser = await prisma.pppoeUser.findFirst({
      where: {
        username: deviceId,
        ...(routerId ? { routerId } : {}),
        ...(areaId ? { areaId } : {}),
      },
      select: { id: true },
    });
    if (!matchingUser) {
      return NextResponse.json(
        { error: 'Device not found in your assigned area' },
        { status: 403 },
      );
    }
  }

  const credentials = await getGenieACSCredentials();
  if (!credentials) {
    return NextResponse.json({ success: false, error: 'GenieACS not configured' }, { status: 400 });
  }

  const { host, username, password } = credentials;
  const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { action } = body;

  if (action === 'reboot') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(
        `${host}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=10000&connection_request`,
        {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'reboot' }),
          signal: controller.signal,
        },
      );
      clearTimeout(timeoutId);
      if (response.ok || response.status === 202) {
        return NextResponse.json({ success: true, message: 'Reboot task sent successfully' });
      }
      if (response.status === 504) {
        return NextResponse.json({ success: false, error: 'Device offline atau tidak merespons' }, { status: 200 });
      }
      return NextResponse.json({ success: false, error: `GenieACS returned ${response.status}` }, { status: 200 });
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return NextResponse.json({ success: false, error: 'Connection timeout' }, { status: 200 });
      }
      return NextResponse.json({ success: false, error: error.message || 'Reboot failed' }, { status: 500 });
    }
  }

  if (action === 'setWifi') {
    const { wifiIndex, ssid, wifiPassword } = body;
    const paramValues: [string, string, string][] = [];
    const idx = wifiIndex || 1;
    const base = `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${idx}`;
    if (ssid) paramValues.push([`${base}.SSID`, ssid, 'xsd:string']);
    if (wifiPassword) paramValues.push([`${base}.KeyPassphrase`, wifiPassword, 'xsd:string']);
    if (paramValues.length === 0) {
      return NextResponse.json({ error: 'No parameters to set' }, { status: 400 });
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(
        `${host}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=10000&connection_request`,
        {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'setParameterValues', parameterValues: paramValues }),
          signal: controller.signal,
        },
      );
      clearTimeout(timeoutId);
      if (response.ok || response.status === 202) {
        return NextResponse.json({ success: true, message: 'WiFi settings updated successfully' });
      }
      if (response.status === 504) {
        return NextResponse.json({ success: false, error: 'Device offline atau tidak merespons' }, { status: 200 });
      }
      return NextResponse.json({ success: false, error: `GenieACS returned ${response.status}` }, { status: 200 });
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return NextResponse.json({ success: false, error: 'Connection timeout' }, { status: 200 });
      }
      return NextResponse.json({ success: false, error: error.message || 'WiFi update failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
