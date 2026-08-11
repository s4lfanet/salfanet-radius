import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getGenieACSCredentials } from '@/app/api/settings/genieacs/route';

// Helper to safely convert any value to string (same as admin API)
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
      if (Array.isArray(val.value) && val.value.length > 0) {
        return safeString(val.value[0]);
      }
      return safeString(val.value);
    }
    return '-';
  }
  return String(val) || '-';
}

// Helper function to get parameter value from device (same as admin API)
function getParameterValue(device: any, paths: string[]): string {
  for (const path of paths) {
    const parts = path.split('.');
    let value = device;
    
    for (const part of parts) {
      if (value && typeof value === 'object') {
        if (part in value) {
          value = value[part];
        } else {
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

// Parameter paths for device info (SAME as admin API for consistency)
const parameterPaths = {
  pppUsername: [
    'VirtualParameters.pppUsername',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username',
    'Device.PPP.Interface.1.Username'
  ],
  rxPower: [
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
    'InternetGatewayDevice.WANDevice.1.WANEponInterfaceConfig.RXPower'
  ],
  txPower: [
    'VirtualParameters.txPower',
    'VirtualParameters.TXPower',
    'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TXPower',
    'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TXPower'
  ],
  pppoeIP: [
    'VirtualParameters.pppIP',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ExternalIPAddress',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress',
    'Device.PPP.Interface.1.IPCP.LocalIPAddress'
  ],
  ponMode: [
    'VirtualParameters.PonMode',
    'InternetGatewayDevice.DeviceInfo.AccessType',
    'InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.WANAccessType'
  ],
  uptime: [
    'VirtualParameters.uptimeDevice',
    'VirtualParameters.uptime',
    'InternetGatewayDevice.DeviceInfo.UpTime',
    'Device.DeviceInfo.UpTime'
  ],
  temp: [
    'VirtualParameters.temp',
    'VirtualParameters.temperature',
    'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TransceiverTemperature',
    'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TransceiverTemperature',
    'InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.TransceiverTemperature',
    'InternetGatewayDevice.WANDevice.1.X_CT-COM_GponInterfaceConfig.Temperature'
  ],
  serialNumber: [
    'InternetGatewayDevice.DeviceInfo.SerialNumber',
    'Device.DeviceInfo.SerialNumber'
  ],
  ssid: [
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID',
    'Device.WiFi.SSID.1.SSID'
  ],
  wifiEnabled: [
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Enable',
    'Device.WiFi.SSID.1.Enable'
  ],
  wifiChannel: [
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Channel',
    'Device.WiFi.Radio.1.Channel'
  ],
  totalAssociations: [
    'VirtualParameters.userconnected',
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations'
  ],
  wifiPassword: [
    'VirtualParameters.getWlanPass24G-1',
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey',
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase'
  ]
};

// Helper function to format uptime
function formatUptime(uptimeValue: string): string {
  if (uptimeValue === '-' || !uptimeValue || uptimeValue === '0') return '-';
  
  // If already formatted (contains 'd' followed by space, or matches HH:MM:SS pattern)
  // Examples: "0d 14:03:29", "1d 02:30:00", "14:03:29"
  if (/\d+d\s+\d+:\d+:\d+/.test(uptimeValue) || /^\d+:\d{2}:\d{2}$/.test(uptimeValue)) {
    return uptimeValue;
  }
  
  // Try to parse as seconds
  const seconds = parseInt(uptimeValue);
  if (isNaN(seconds) || seconds < 0) return uptimeValue;
  
  // Convert seconds to formatted uptime
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  return `${days}d ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Helper function to format RX Power
function formatRxPower(rxPower: string): string {
  if (rxPower === '-' || !rxPower) return '-';
  
  // If already has dBm, return as is
  if (rxPower.toLowerCase().includes('dbm')) return rxPower;
  
  // Try to parse and format
  const value = parseFloat(rxPower);
  if (!isNaN(value)) {
    // If value is very large negative number (like -21000), convert from milli-dBm
    if (value < -100) {
      return `${(value / 1000).toFixed(1)} dBm`;
    }
    return `${value.toFixed(1)} dBm`;
  }
  return rxPower;
}

// Helper function to format temperature
function formatTemperature(temp: string): string {
  if (temp === '-' || !temp) return '-';
  
  // If already has degree symbol, return as is
  if (temp.includes('°') || temp.toLowerCase().includes('c')) return temp;
  
  const value = parseFloat(temp);
  if (!isNaN(value)) {
    // If value > 1000, it's in milli-degrees
    if (value > 1000) {
      return `${(value / 1000).toFixed(0)}°C`;
    }
    return `${value.toFixed(0)}°C`;
  }
  return temp;
}

// Helper function to determine device status
function getDeviceStatus(lastInform: string | null): string {
  if (!lastInform) return 'Offline';
  try {
    const lastInformTime = new Date(lastInform).getTime();
    const now = Date.now();
    const diffMs = now - lastInformTime;
    const diffHours = diffMs / (1000 * 60 * 60);
    return diffHours < 1 ? 'Online' : 'Offline';
  } catch {
    return 'Offline';
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find session by token
    const session = await prisma.customerSession.findFirst({
      where: {
        token,
        verified: true,
        expiresAt: { gte: new Date() },
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Get user with username for PPPoE
    const user = await prisma.pppoeUser.findUnique({
      where: { id: session.userId },
      select: {
        username: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Get GenieACS credentials
    const credentials = await getGenieACSCredentials();

    if (!credentials) {
      return NextResponse.json(
        { success: false, error: 'GenieACS not configured', device: null },
        { status: 200 }
      );
    }

    const { host, username, password } = credentials;

    // Fetch ALL devices from GenieACS (same as admin API)
    const response = await fetch(`${host}/devices`, {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`GenieACS API returned ${response.status}`);
    }

    const allDevices = await response.json();

    // Find device by PPPoE username (try multiple paths)
    const device = allDevices.find((dev: any) => {
      const pppUsername = getParameterValue(dev, parameterPaths.pppUsername);
      return pppUsername === user.username || pppUsername.toLowerCase() === user.username.toLowerCase();
    });

    if (!device) {
      return NextResponse.json({
        success: true,
        device: null,
        message: 'No ONT device found for this account',
      });
    }

    // Extract device info using parameterPaths (SAME as admin API)
    const deviceIdObj = device._deviceId || {};
    
    const serialNumber = safeString(deviceIdObj._SerialNumber) !== '-' 
      ? safeString(deviceIdObj._SerialNumber) 
      : getParameterValue(device, parameterPaths.serialNumber);
    
    const manufacturer = safeString(deviceIdObj._Manufacturer) || '-';
    const model = safeString(deviceIdObj._ProductClass) || '-';
    
    // Get values using parameterPaths
    const pppUsername = getParameterValue(device, parameterPaths.pppUsername);
    const pppoeIP = getParameterValue(device, parameterPaths.pppoeIP);
    const rxPower = getParameterValue(device, parameterPaths.rxPower);
    const txPower = getParameterValue(device, parameterPaths.txPower);
    const temp = getParameterValue(device, parameterPaths.temp);
    const uptime = getParameterValue(device, parameterPaths.uptime);
    const ponMode = getParameterValue(device, parameterPaths.ponMode);
    const ssid = getParameterValue(device, parameterPaths.ssid);
    const wifiEnabled = getParameterValue(device, parameterPaths.wifiEnabled);
    const wifiChannel = getParameterValue(device, parameterPaths.wifiChannel);
    const wifiPassword = getParameterValue(device, parameterPaths.wifiPassword);
    const totalAssociations = getParameterValue(device, parameterPaths.totalAssociations);

    const deviceInfo = {
      _id: device._id, // CRITICAL: Device ID needed for WiFi updates
      serialNumber,
      manufacturer,
      model,
      
      // PPPoE Info
      pppUsername,
      ipAddress: pppoeIP,
      
      // Signal & Status
      rxPower: formatRxPower(rxPower),
      txPower: formatRxPower(txPower),
      temperature: formatTemperature(temp),
      uptime: formatUptime(uptime),
      ponMode,
      
      // Connection status
      lastInform: device._lastInform || null,
      status: getDeviceStatus(device._lastInform),
      
      // WiFi Info
      wifiSSID: ssid,
      wifiPassword: wifiPassword !== '-' ? wifiPassword : null,
      wifiEnabled: wifiEnabled === 'true' || wifiEnabled === '1',
      wifiChannel,
      connectedHosts: parseInt(totalAssociations) || 0,
    };

    return NextResponse.json({
      success: true,
      device: deviceInfo,
    });
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.warn('[Customer ONT] GenieACS tidak merespons setelah 5 detik');
      return NextResponse.json(
        { success: true, device: null, timeout: true, message: 'GenieACS tidak merespons. Perangkat mungkin offline.' },
        { status: 200 }
      );
    }
    console.error('Get ONT error:', error);
    return NextResponse.json(
      { success: false, error: error.message, device: null },
      { status: 200 }
    );
  }
}
