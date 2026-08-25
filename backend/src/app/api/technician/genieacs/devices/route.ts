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

const parameterPaths = TR069_PARAMETER_PATHS;

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

  const { searchParams } = new URL(req.url);
  const routerId = searchParams.get('routerId') || undefined;
  const areaId = searchParams.get('areaId') || undefined;

  // Field technicians must scope their query to a router or area
  // (same security pattern as the customers route)
  if (!tech.isAdminUser && !routerId && !areaId) {
    return NextResponse.json(
      { error: 'routerId or areaId parameter is required' },
      { status: 400 },
    );
  }

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
    // If field technician with router/area scope, get the list of
    // customer usernames/IPs that belong to that scope for filtering.
    let allowedUsernames: Set<string> | null = null;
    if (!tech.isAdminUser && (routerId || areaId)) {
      const users = await prisma.pppoeUser.findMany({
        where: {
          ...(routerId ? { routerId } : {}),
          ...(areaId ? { areaId } : {}),
        },
        select: { username: true, ipAddress: true },
      });
      allowedUsernames = new Set(users.map(u => u.username));
      // Also include IP addresses for matching against GenieACS device IPs
      for (const u of users) {
        if (u.ipAddress) allowedUsernames.add(u.ipAddress);
      }
    }

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
    let devices = devicesRaw.map(processDevice);

    // Filter devices for field technicians — only show devices that
    // match a customer in their assigned router/area
    if (allowedUsernames) {
      devices = devices.filter((d: any) => {
        // Match by username (DeviceID or _tags) or IP address
        const deviceId = String(d._id || '');
        const tags = Array.isArray(d.tags) ? d.tags : [];
        const ip = String(d.pppoeIP || '');
        return allowedUsernames.has(deviceId) ||
               tags.some((t: string) => allowedUsernames.has(t)) ||
               (ip !== '-' && allowedUsernames.has(ip));
      });
    }

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
