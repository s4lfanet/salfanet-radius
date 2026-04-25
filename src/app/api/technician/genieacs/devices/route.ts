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
  if (Array.isArray(val)) {
    if (val.length > 0) return safeString(val[0]);
    return '-';
  }
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

function normalizeRxPower(raw: string): string {
  if (raw === '-' || raw === 'N/A') return raw;
  const num = parseFloat(raw);
  if (isNaN(num)) return raw;
  // Already in valid dBm range (-100 to 0 typical for optical)
  if (num < 0 && num >= -100) return `${num.toFixed(2)} dBm`;
  // Large negative: millidBm format (e.g., -18000 means -18 dBm)
  if (num < -100) return `${(num / 1000).toFixed(2)} dBm`;
  // Small positive: 0.1 nW units — apply optical power formula used in GenieACS VPs
  if (num > 0 && num < 10000) {
    const db = 30 + Math.log10(num * Math.pow(10, -7)) * 10;
    return `${(Math.ceil(db * 100) / 100).toFixed(2)} dBm`;
  }
  return raw;
}

const parameterPaths = {
  pppUsername: [
    'VirtualParameters.pppUsername',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username',
    'Device.PPP.Interface.1.Username',
  ],
  rxPower: [
    'VirtualParameters.redaman',
    'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower',
    'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RXPower',
    'InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.RXPower',
    'InternetGatewayDevice.X_ALU_OntOpticalParam.RXPower',
    'InternetGatewayDevice.WANDevice.1.X_CT-COM_GponInterfaceConfig.RXPower',
    'InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.RXPower',
    'InternetGatewayDevice.WANDevice.1.X_CMCC_GponInterfaceConfig.RXPower',
    'InternetGatewayDevice.WANDevice.1.X_CMCC_EponInterfaceConfig.RXPower',
    'InternetGatewayDevice.WANDevice.1.X_CU_WANEPONInterfaceConfig.OpticalTransceiver.RXPower',
    'InternetGatewayDevice.WANDevice.1.WANEponInterfaceConfig.RXPower',
  ],
  serialNumber: [
    'InternetGatewayDevice.DeviceInfo.SerialNumber',
    'Device.DeviceInfo.SerialNumber',
  ],
  model: [
    'InternetGatewayDevice.DeviceInfo.ProductClass',
    'InternetGatewayDevice.DeviceInfo.ModelName',
    'Device.DeviceInfo.ModelName',
  ],
  manufacturer: [
    'InternetGatewayDevice.DeviceInfo.Manufacturer',
    'Device.DeviceInfo.Manufacturer',
  ],
  ponMode: [
    'VirtualParameters.getponmode',
    'VirtualParameters.PonMode',
    'InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.WANAccessType',
    'InternetGatewayDevice.DeviceInfo.AccessType',
    'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.PONMode',
  ],
  pppoeIP: [
    'VirtualParameters.pppIP',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ExternalIPAddress',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress',
    'Device.PPP.Interface.1.IPCP.LocalIPAddress',
  ],
  tr069IP: [
    'InternetGatewayDevice.ManagementServer.ConnectionRequestURL',
    'Device.ManagementServer.ConnectionRequestURL',
  ],
  uptime: [
    'VirtualParameters.uptimeDevice',
    'VirtualParameters.uptime',
    'InternetGatewayDevice.DeviceInfo.UpTime',
    'Device.DeviceInfo.UpTime',
  ],
  macAddress: [
    'VirtualParameters.MacAddress',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MACAddress',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.MACAddress',
    'Device.PPP.Interface.1.MACAddress',
  ],
  softwareVersion: [
    'VirtualParameters.softwareVersion',
    'InternetGatewayDevice.DeviceInfo.SoftwareVersion',
    'Device.DeviceInfo.SoftwareVersion',
  ],
  ssid: [
    'VirtualParameters.getWlanPass24G-1',
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID',
    'Device.WiFi.SSID.1.SSID',
  ],
  temp: [
    'VirtualParameters.temp',
    'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TransceiverTemperature',
    'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TransceiverTemperature',
  ],
  userConnected: [
    'VirtualParameters.userconnected',
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations',
  ],
  txPower: [
    'VirtualParameters.txPower',
    'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TXPower',
    'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TXPower',
  ],
  lanIP: [
    'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceIPAddress',
    'Device.IP.Interface.1.IPv4Address.1.IPAddress',
  ],
  hardwareVersion: [
    'InternetGatewayDevice.DeviceInfo.HardwareVersion',
    'Device.DeviceInfo.HardwareVersion',
  ],
};

function getDeviceStatus(lastInform: string | null): string {
  if (!lastInform) return 'unknown';
  try {
    const diffHours = (Date.now() - new Date(lastInform).getTime()) / (1000 * 60 * 60);
    return diffHours < 1 ? 'online' : 'offline';
  } catch {
    return 'unknown';
  }
}

function processDevice(device: any) {
  const deviceIdObj = device._deviceId || {};

  const serialNumber =
    safeString(deviceIdObj._SerialNumber) !== '-'
      ? safeString(deviceIdObj._SerialNumber)
      : getParameterValue(device, parameterPaths.serialNumber);

  const manufacturer =
    safeString(deviceIdObj._Manufacturer) !== '-'
      ? safeString(deviceIdObj._Manufacturer)
      : getParameterValue(device, parameterPaths.manufacturer);

  const model =
    safeString(deviceIdObj._ProductClass) !== '-'
      ? safeString(deviceIdObj._ProductClass)
      : getParameterValue(device, parameterPaths.model);

  let tr069IP = getParameterValue(device, parameterPaths.tr069IP);
  if (tr069IP !== '-' && tr069IP.includes('://')) {
    tr069IP = extractIPFromURL(tr069IP);
  }

  return {
    _id: String(device._id || ''),
    serialNumber,
    manufacturer,
    model,
    oui: safeString(deviceIdObj._OUI),
    pppoeUsername: getParameterValue(device, parameterPaths.pppUsername),
    pppoeIP: getParameterValue(device, parameterPaths.pppoeIP),
    tr069IP,
    rxPower: normalizeRxPower(getParameterValue(device, parameterPaths.rxPower)),
    ponMode: getParameterValue(device, parameterPaths.ponMode),
    uptime: getParameterValue(device, parameterPaths.uptime),
    ssid: getParameterValue(device, parameterPaths.ssid),
    macAddress: getParameterValue(device, parameterPaths.macAddress),
    softwareVersion: getParameterValue(device, parameterPaths.softwareVersion),
    temp: getParameterValue(device, parameterPaths.temp),
    userConnected: getParameterValue(device, parameterPaths.userConnected),
    status: getDeviceStatus(device._lastInform),
    lastInform: device._lastInform ? String(device._lastInform) : null,
    tags: Array.isArray(device._tags) ? device._tags.map((t: any) => String(t)) : [],
  };
}

export async function GET(req: NextRequest) {
  const tech = await verifyTechnician(req);
  if (!tech) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const credentials = await getGenieACSCredentials();
  if (!credentials) {
    return NextResponse.json({
      success: false,
      error: 'GenieACS not configured.',
      devices: [],
      count: 0,
    });
  }

  const { host, username, password } = credentials;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${host}/devices`, {
      method: 'GET',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json({
          success: false,
          error: 'GenieACS authentication failed.',
          devices: [],
          count: 0,
        });
      }
      throw new Error(`GenieACS API returned ${response.status}`);
    }

    const devicesRaw = await response.json();
    const devices = devicesRaw.map(processDevice);

    return NextResponse.json({
      success: true,
      devices,
      count: devices.length,
      statistics: {
        total: devices.length,
        online: devices.filter((d: any) => d.status === 'online').length,
        offline: devices.filter((d: any) => d.status === 'offline').length,
      },
    });
  } catch (fetchError: any) {
    clearTimeout(timeoutId);
    let errorMessage = 'Failed to fetch devices from GenieACS';
    if (fetchError.name === 'AbortError') errorMessage = 'Connection timeout.';
    else if (fetchError.message?.includes('fetch failed') || fetchError.cause?.code === 'ECONNREFUSED')
      errorMessage = 'Unable to connect to GenieACS server.';
    else if (fetchError.message) errorMessage = fetchError.message;

    return NextResponse.json({ success: false, error: errorMessage, devices: [], count: 0 });
  }
}
