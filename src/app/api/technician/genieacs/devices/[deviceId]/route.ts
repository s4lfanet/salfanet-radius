import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import { getGenieACSCredentials } from '@/app/api/settings/genieacs/route';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';

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
      return { id: adminUser.id };
    }
    const tech = await prisma.technician.findUnique({
      where: { id: payload.id as string },
      select: { id: true, isActive: true },
    });
    return tech?.isActive ? tech : null;
  } catch {
    return null;
  }
}

function safeString(val: any): string {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'string') return val || '-';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) return val.length > 0 ? safeString(val[0]) : '-';
  if (typeof val === 'object') {
    if ('_value' in val) return safeString(val._value);
    if ('value' in val) {
      if (Array.isArray(val.value) && val.value.length > 0) return safeString(val.value[0]);
      return safeString(val.value);
    }
    return '-';
  }
  return String(val) || '-';
}

function getParameterValue(device: any, paths: string[]): string {
  for (const path of paths) {
    const parts = path.split('.');
    let value = device;
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        value = undefined;
        break;
      }
    }
    if (value !== undefined && value !== null) {
      const result = safeString(value);
      if (result !== '-' && result !== '') return result;
    }
  }
  return '-';
}

function extractIPFromURL(url: string): string {
  if (!url || url === '-') return '-';
  try {
    const match = url.match(/https?:\/\/([^:\/]+)/);
    if (match?.[1]) return match[1];
  } catch {}
  return '-';
}

const pp = {
  pppUsername: ['VirtualParameters.pppUsername', 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username', 'Device.PPP.Interface.1.Username'],
  rxPower: ['VirtualParameters.redaman', 'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower', 'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RXPower', 'InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.RXPower'],
  txPower: ['VirtualParameters.txPower', 'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TXPower', 'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TXPower'],
  serialNumber: ['InternetGatewayDevice.DeviceInfo.SerialNumber', 'Device.DeviceInfo.SerialNumber'],
  model: ['InternetGatewayDevice.DeviceInfo.ProductClass', 'InternetGatewayDevice.DeviceInfo.ModelName', 'Device.DeviceInfo.ModelName'],
  manufacturer: ['InternetGatewayDevice.DeviceInfo.Manufacturer', 'Device.DeviceInfo.Manufacturer'],
  pppoeIP: ['VirtualParameters.pppIP', 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress', 'Device.PPP.Interface.1.IPCP.LocalIPAddress'],
  tr069IP: ['InternetGatewayDevice.ManagementServer.ConnectionRequestURL', 'Device.ManagementServer.ConnectionRequestURL'],
  uptime: ['VirtualParameters.uptimeDevice', 'VirtualParameters.uptime', 'InternetGatewayDevice.DeviceInfo.UpTime', 'Device.DeviceInfo.UpTime'],
  macAddress: ['VirtualParameters.MacAddress', 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MACAddress', 'Device.PPP.Interface.1.MACAddress'],
  softwareVersion: ['VirtualParameters.softwareVersion', 'InternetGatewayDevice.DeviceInfo.SoftwareVersion', 'Device.DeviceInfo.SoftwareVersion'],
  hardwareVersion: ['InternetGatewayDevice.DeviceInfo.HardwareVersion', 'Device.DeviceInfo.HardwareVersion'],
  lanIP: ['InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceIPAddress', 'Device.IP.Interface.1.IPv4Address.1.IPAddress'],
  ponMode: ['VirtualParameters.PonMode', 'InternetGatewayDevice.DeviceInfo.AccessType'],
  pppoeStatus: [
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionStatus',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ConnectionStatus',
    'Device.PPP.Interface.1.ConnectionStatus',
  ],
  pppoeGateway: [
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.DefaultGateway',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.DefaultGateway',
  ],
  pppoeDNS: [
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.DNSServers',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.DNSServers',
    'Device.PPP.Interface.1.IPCP.DNSServers',
  ],
};

function getDeviceStatus(lastInform: string | null): string {
  if (!lastInform) return 'unknown';
  try {
    return (Date.now() - new Date(lastInform).getTime()) / 3600000 < 1 ? 'online' : 'offline';
  } catch {
    return 'unknown';
  }
}

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
  const hostsBase = device?.InternetGatewayDevice?.LANDevice?.['1']?.Hosts?.Host;
  if (!hostsBase || typeof hostsBase !== 'object') return devices;

  for (const idx of Object.keys(hostsBase)) {
    if (idx === '_writable' || idx === '_timestamp' || idx === '_object') continue;
    const host = hostsBase[idx];
    if (!host || typeof host !== 'object') continue;
    devices.push({
      hostName: safeString(host.HostName),
      ipAddress: safeString(host.IPAddress),
      macAddress: safeString(host.MACAddress),
      interfaceType: safeString(host.InterfaceType),
      active: safeString(host.Active) === 'true' || safeString(host.Active) === '1',
    });
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
      rxPower: getParameterValue(device, pp.rxPower),
      txPower: getParameterValue(device, pp.txPower),
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
