import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { getGenieACSCredentials } from '../route';

// ─── Module-level in-memory device cache ─────────────────────────────────────
// Survives across requests within the same PM2 cluster worker process.
// Strategy: serve stale data immediately, then trigger background refresh.
interface DeviceListCache {
  devices: Record<string, unknown>[];
  count: number;
  statistics: { total: number; online: number; offline: number };
  timestamp: number;
  credHash: string; // detect credential change
}
let _deviceCache: DeviceListCache | null = null;
const CACHE_TTL_MS = 300_000; // 5 min – stale-while-revalidate in background
let _bgRefreshRunning = false; // prevent concurrent background fetches

// Helper to safely convert any value to string
function safeString(val: any): string {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'string') return val || '-';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) {
    // GenieACS sometimes returns [value, "xsd:type"]
    if (val.length > 0) return safeString(val[0]);
    return '-';
  }
  if (typeof val === 'object') {
    // GenieACS stores values as {_value: x, _type: y, _timestamp: z, _object: bool, _writable: bool}
    if ('_value' in val) return safeString(val._value);
    if ('value' in val) {
      // value might be [actualValue, "xsd:type"]
      if (Array.isArray(val.value) && val.value.length > 0) {
        return safeString(val.value[0]);
      }
      return safeString(val.value);
    }
    return '-';
  }
  return String(val) || '-';
}

// Helper function to get parameter value from device - always returns string
// GenieACS stores data in nested structure with _value property
function getParameterValue(device: any, paths: string[]): string {
  for (const path of paths) {
    const parts = path.split('.');
    let value = device;
    
    for (const part of parts) {
      if (value && typeof value === 'object') {
        // Try exact match first
        if (part in value) {
          value = value[part];
        } else {
          // Not found, break
          value = undefined;
          break;
        }
      } else {
        value = undefined;
        break;
      }
    }
    
    if (value !== undefined && value !== null) {
      const result = safeString(value);
      if (result !== '-' && result !== '') {
        return result;
      }
    }
  }
  return '-';
}

// Helper to extract IP from ConnectionRequestURL
function extractIPFromURL(url: string): string {
  if (!url || url === '-') return '-';
  try {
    const match = url.match(/https?:\/\/([^:\/]+)/);
    if (match && match[1]) {
      return match[1];
    }
  } catch {}
  return '-';
}

// Parameter paths for different device info (based on actual GenieACS Virtual Parameters)
// GenieACS stores parameters with _value property inside each path
const parameterPaths = {
  pppUsername: [
    'VirtualParameters.pppUsername',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username',
    'Device.PPP.Interface.1.Username'
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
    'InternetGatewayDevice.WANDevice.1.WANEponInterfaceConfig.RXPower'
  ],
  serialNumber: [
    'InternetGatewayDevice.DeviceInfo.SerialNumber',
    'Device.DeviceInfo.SerialNumber'
  ],
  model: [
    'InternetGatewayDevice.DeviceInfo.ProductClass',
    'InternetGatewayDevice.DeviceInfo.ModelName',
    'Device.DeviceInfo.ModelName'
  ],
  manufacturer: [
    'InternetGatewayDevice.DeviceInfo.Manufacturer',
    'Device.DeviceInfo.Manufacturer'
  ],
  ssid: [
    'VirtualParameters.getWlanPass24G-1',
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID',
    'Device.WiFi.SSID.1.SSID'
  ],
  ponMode: [
    'VirtualParameters.PonMode',
    'InternetGatewayDevice.DeviceInfo.AccessType',
    'InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.WANAccessType'
  ],
  pppoeIP: [
    'VirtualParameters.pppIP',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ExternalIPAddress',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress',
    'Device.PPP.Interface.1.IPCP.LocalIPAddress'
  ],
  tr069IP: [
    'InternetGatewayDevice.ManagementServer.ConnectionRequestURL',
    'Device.ManagementServer.ConnectionRequestURL'
  ],
  uptime: [
    'VirtualParameters.uptimeDevice',
    'VirtualParameters.uptime',
    'InternetGatewayDevice.DeviceInfo.UpTime',
    'Device.DeviceInfo.UpTime'
  ],
  macAddress: [
    'VirtualParameters.MacAddress',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MACAddress',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.MACAddress',
    'Device.PPP.Interface.1.MACAddress'
  ],
  softwareVersion: [
    'VirtualParameters.softwareVersion',
    'InternetGatewayDevice.DeviceInfo.SoftwareVersion',
    'Device.DeviceInfo.SoftwareVersion'
  ],
  temp: [
    'VirtualParameters.temp',
    'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TransceiverTemperature',
    'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TransceiverTemperature'
  ],
  userConnected: [
    'VirtualParameters.userconnected',
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations'
  ]
};

// Helper function to determine device status
function getDeviceStatus(lastInform: string | null): string {
  if (!lastInform) return 'Unknown';
  try {
    const lastInformTime = new Date(lastInform).getTime();
    const now = Date.now();
    const diffMs = now - lastInformTime;
    const diffHours = diffMs / (1000 * 60 * 60);
    return diffHours < 1 ? 'Online' : 'Offline';
  } catch {
    return 'Unknown';
  }
}

// GET - Fetch devices from GenieACS
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const credentials = await getGenieACSCredentials();

    if (!credentials) {
      return NextResponse.json(
        { 
          success: false,
          error: 'GenieACS not configured. Please setup connection first.',
          devices: [],
          count: 0
        },
        { status: 200 }
      );
    }

    const { host, username, password } = credentials;
    const credHash = `${host}:${username}`;

    // ── Serve from cache if fresh ───────────────────────────────────────────
    const now = Date.now();
    if (_deviceCache && _deviceCache.credHash === credHash && (now - _deviceCache.timestamp) < CACHE_TTL_MS) {
      return NextResponse.json({
        success: true,
        devices: _deviceCache.devices,
        count: _deviceCache.count,
        statistics: _deviceCache.statistics,
        fromCache: true,
        cacheAge: Math.round((now - _deviceCache.timestamp) / 1000),
      });
    }

    // ── If stale cache exists, return stale data and refresh in background ──
    if (_deviceCache && _deviceCache.credHash === credHash && !_bgRefreshRunning) {
      _bgRefreshRunning = true;
      fetchAndCacheDevices(host, username, password, credHash).finally(() => {
        _bgRefreshRunning = false;
      });
      return NextResponse.json({
        success: true,
        devices: _deviceCache.devices,
        count: _deviceCache.count,
        statistics: _deviceCache.statistics,
        fromCache: true,
        cacheAge: Math.round((now - _deviceCache.timestamp) / 1000),
      });
    }

    // ── No cache: fetch synchronously ──────────────────────────────────────
    const result = await fetchAndCacheDevices(host, username, password, credHash);
    return NextResponse.json(result);

  } catch (error: unknown) {
    console.error('Error fetching devices from GenieACS:', error);
    const err = error as Error;
    let errorMessage = 'Failed to fetch devices from GenieACS';
    if (err.message?.includes('fetch failed') || (err as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
      errorMessage = 'Unable to connect to GenieACS server. Please check if the server is running.';
    } else if (err.message?.includes('timeout')) {
      errorMessage = 'Connection timeout. GenieACS server is not responding.';
    } else if (err.message) {
      errorMessage = err.message;
    }
    return NextResponse.json(
      { success: false, error: errorMessage, devices: [], count: 0 },
      { status: 200 }
    );
  }
}

// ─── Shared fetch + cache update ─────────────────────────────────────────────
async function fetchAndCacheDevices(host: string, username: string, password: string, credHash: string) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${host}/devices`, {
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401) {
          return { success: false, error: 'Authentication failed. Invalid username or password.', devices: [], count: 0, statistics: { total: 0, online: 0, offline: 0 }, fromCache: false, cacheAge: 0 };
        }
        throw new Error(`GenieACS API returned ${response.status}`);
      }

      const devicesRaw = await response.json();

      // Process devices with parameter extraction
      const devices = devicesRaw.map((device: any) => {
        // GenieACS _deviceId structure: {_Manufacturer, _OUI, _ProductClass, _SerialNumber}
        const deviceIdObj = device._deviceId || {};
        
        // Extract from _deviceId (primary source for device identification)
        const serialNumber = safeString(deviceIdObj._SerialNumber) !== '-' 
          ? safeString(deviceIdObj._SerialNumber) 
          : getParameterValue(device, parameterPaths.serialNumber);
        
        const manufacturer = safeString(deviceIdObj._Manufacturer) !== '-'
          ? safeString(deviceIdObj._Manufacturer)
          : getParameterValue(device, parameterPaths.manufacturer);
        
        const model = safeString(deviceIdObj._ProductClass) !== '-'
          ? safeString(deviceIdObj._ProductClass)
          : getParameterValue(device, parameterPaths.model);
        
        const oui = safeString(deviceIdObj._OUI);
        
        // Extract TR-069 IP from ConnectionRequestURL
        let tr069IP = getParameterValue(device, parameterPaths.tr069IP);
        if (tr069IP !== '-' && tr069IP.includes('://')) {
          tr069IP = extractIPFromURL(tr069IP);
        }

        // Get uptime - prefer formatted string from uptimeDevice
        let uptime = getParameterValue(device, parameterPaths.uptime);
        
        // Get RX Power and format it
        let rxPower = getParameterValue(device, parameterPaths.rxPower);

        return {
          _id: String(device._id || ''),
          serialNumber,
          manufacturer,
          model,
          oui,
          pppoeUsername: getParameterValue(device, parameterPaths.pppUsername),
          pppoeIP: getParameterValue(device, parameterPaths.pppoeIP),
          tr069IP,
          rxPower,
          ponMode: getParameterValue(device, parameterPaths.ponMode),
          uptime,
          ssid: getParameterValue(device, parameterPaths.ssid),
          macAddress: getParameterValue(device, parameterPaths.macAddress),
          softwareVersion: getParameterValue(device, parameterPaths.softwareVersion),
          temp: getParameterValue(device, parameterPaths.temp),
          userConnected: getParameterValue(device, parameterPaths.userConnected),
          status: getDeviceStatus(device._lastInform),
          lastInform: device._lastInform ? String(device._lastInform) : null,
          tags: Array.isArray(device._tags) ? device._tags.map((t: any) => String(t)) : []
        };
      });

      // Calculate statistics
      const onlineCount = devices.filter((d: any) => d.status === 'Online').length;
      const offlineCount = devices.filter((d: any) => d.status === 'Offline').length;
      const statistics = { total: devices.length, online: onlineCount, offline: offlineCount };

      // ── Store in cache ──────────────────────────────────────────────────
      _deviceCache = { devices, count: devices.length, statistics, timestamp: Date.now(), credHash };

      return {
        success: true,
        devices,
        count: devices.length,
        statistics,
        fromCache: false,
        cacheAge: 0,
      };
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      const err = fetchError as Error;
      if (err.name === 'AbortError') {
        throw new Error('Connection timeout. GenieACS server is not responding.');
      }
      throw fetchError;
    }
}
