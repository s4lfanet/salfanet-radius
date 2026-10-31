/**
 * Shared TR-069 parameter paths + extraction helpers for GenieACS devices.
 * Same path lists as the admin/customer ONT routes — extracted so lookup
 * endpoints share one source of truth.
 */

export function safeString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') return val || null;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) return val.length > 0 ? safeString(val[0]) : null;
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('_value' in obj) return safeString(obj._value);
    if ('value' in obj) return safeString(obj.value);
    return null;
  }
  return String(val);
}

export function getParam(device: unknown, paths: string[]): string | null {
  for (const path of paths) {
    const parts = path.split('.');
    let value: unknown = device;
    for (const part of parts) {
      if (value && typeof value === 'object' && part in (value as object)) {
        value = (value as Record<string, unknown>)[part];
      } else {
        value = undefined;
        break;
      }
    }
    const result = safeString(value);
    if (result !== null) return result;
  }
  return null;
}

export const PPP_USERNAME_PATHS = [
  'VirtualParameters.pppUsername',
  'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
  'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username',
  'Device.PPP.Interface.1.Username',
];

export const RX_POWER_PATHS = [
  'VirtualParameters.redaman',
  'VirtualParameters.RXPower',
  'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.RXPower',
  'InternetGatewayDevice.X_ALU_OntOpticalParam.RXPower',
  'InternetGatewayDevice.WANDevice.1.X_CT-COM_GponInterfaceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.1.X_CMCC_GponInterfaceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.1.X_CMCC_EponInterfaceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.1.WANEponInterfaceConfig.RXPower',
];

export const TX_POWER_PATHS = [
  'VirtualParameters.txPower',
  'VirtualParameters.TXPower',
  'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TXPower',
  'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TXPower',
];

export const PPPOE_IP_PATHS = [
  'VirtualParameters.pppIP',
  'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress',
  'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ExternalIPAddress',
  'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress',
  'Device.PPP.Interface.1.IPCP.LocalIPAddress',
];

export const PON_MODE_PATHS = [
  'VirtualParameters.PonMode',
  'InternetGatewayDevice.DeviceInfo.AccessType',
  'InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.WANAccessType',
];

export const UPTIME_PATHS = [
  'VirtualParameters.uptimeDevice',
  'VirtualParameters.uptime',
  'InternetGatewayDevice.DeviceInfo.UpTime',
  'Device.DeviceInfo.UpTime',
];

export const TEMP_PATHS = [
  'VirtualParameters.temp',
  'VirtualParameters.temperature',
  'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TransceiverTemperature',
  'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TransceiverTemperature',
  'InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.TransceiverTemperature',
  'InternetGatewayDevice.WANDevice.1.X_CT-COM_GponInterfaceConfig.Temperature',
];

export const SERIAL_PATHS = [
  'InternetGatewayDevice.DeviceInfo.SerialNumber',
  'Device.DeviceInfo.SerialNumber',
];

export const SSID_PATHS = [
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID',
  'Device.WiFi.SSID.1.SSID',
];

export const WIFI_ENABLED_PATHS = [
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Enable',
  'Device.WiFi.SSID.1.Enable',
];

export const WIFI_CHANNEL_PATHS = [
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Channel',
  'Device.WiFi.Radio.1.Channel',
];

export const TOTAL_ASSOC_PATHS = [
  'VirtualParameters.userconnected',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations',
];

export function formatUptime(uptimeValue: string | null): string {
  if (!uptimeValue || uptimeValue === '-' || uptimeValue === '0') return '-';
  if (/\d+d\s+\d+:\d+:\d+/.test(uptimeValue) || /^\d+:\d{2}:\d{2}$/.test(uptimeValue)) {
    return uptimeValue;
  }
  const seconds = parseInt(uptimeValue);
  if (isNaN(seconds) || seconds < 0) return uptimeValue;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${days}d ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function formatRxPower(rxPower: string | null): string {
  if (!rxPower || rxPower === '-') return '-';
  if (rxPower.toLowerCase().includes('dbm')) return rxPower;
  const value = parseFloat(rxPower);
  if (!isNaN(value)) {
    if (value < -100) return `${(value / 1000).toFixed(1)} dBm`;
    return `${value.toFixed(1)} dBm`;
  }
  return rxPower;
}
