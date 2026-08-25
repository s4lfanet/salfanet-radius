/**
 * Shared TR-069 parameter parsing utilities for GenieACS device data.
 *
 * Consolidates logic that was previously duplicated across:
 *   - api/technician/genieacs/devices/route.ts (device list)
 *   - api/technician/genieacs/devices/[deviceId]/route.ts (device detail)
 *
 * NOTE: parameter paths here are the UNION of both previous copies —
 * some fallback paths (e.g. rxPower) were more complete in one file than
 * the other; consolidating fixes those gaps instead of just deduping.
 */

/** Safely coerce a GenieACS parameter value (which may be wrapped in
 * `{ _value }` or `{ value }`) into a display string. Returns '-' for
 * missing/empty values. */
export function safeString(val: any): string {
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

/** Walk a dotted TR-069 parameter path against a device object and
 * return the first non-empty value found across the given fallback paths. */
export function getParameterValue(device: any, paths: readonly string[]): string {
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

/** Extract a hostname/IP from a ConnectionRequestURL-style value. */
export function extractIPFromURL(url: string): string {
  if (!url || url === '-') return '-';
  try {
    const match = url.match(/https?:\/\/([^:\/]+)/);
    if (match?.[1]) return match[1];
  } catch {
    // ignore malformed URL
  }
  return '-';
}

/** Normalize raw optical RX power readings (which vary by ONT vendor
 * unit convention) into a consistent "X.XX dBm" string. */
export function normalizeRxPower(raw: string): string {
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

/** Derive online/offline/unknown status from the device's last inform timestamp. */
export function getDeviceStatus(lastInform: string | null): string {
  if (!lastInform) return 'unknown';
  try {
    const diffHours = (Date.now() - new Date(lastInform).getTime()) / (1000 * 60 * 60);
    return diffHours < 1 ? 'online' : 'offline';
  } catch {
    return 'unknown';
  }
}

/**
 * Union of TR-069 fallback parameter paths across all known ONT vendors
 * (ZTE, Huawei/GPON, Fiberhome, ALU, ZTE-CU, CMCC, CT-COM variants).
 */
export const TR069_PARAMETER_PATHS = {
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
  txPower: [
    'VirtualParameters.txPower',
    'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TXPower',
    'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TXPower',
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
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANIPConnection.1.ExternalIPAddress',
    'Device.PPP.Interface.1.IPCP.LocalIPAddress',
    'Device.IP.Interface.1.IPv4Address.1.IPAddress',
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
  hardwareVersion: [
    'InternetGatewayDevice.DeviceInfo.HardwareVersion',
    'Device.DeviceInfo.HardwareVersion',
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
  lanIP: [
    'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceIPAddress',
    'Device.IP.Interface.1.IPv4Address.1.IPAddress',
  ],
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
} as const;
