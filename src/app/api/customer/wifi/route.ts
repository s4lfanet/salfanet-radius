import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getGenieACSCredentials } from '@/app/api/settings/genieacs/route';

// Helper to verify customer token using CustomerSession
async function verifyCustomerToken(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return null;
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
      return null;
    }

    const user = await prisma.pppoeUser.findUnique({
      where: { id: session.userId },
      include: { profile: true }
    });

    return user;
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

// GET - Get customer WiFi/ONT device information
export async function GET(request: NextRequest) {
  try {
    const user = await verifyCustomerToken(request);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get GenieACS credentials
    const credentials = await getGenieACSCredentials();

    if (!credentials) {
      // Return 200 (not 400) so the browser doesn't log a red error — GenieACS simply not set up
      return NextResponse.json(
        { success: false, reason: 'not_configured', error: 'GenieACS not configured' }
      );
    }

    const { host, username, password } = credentials;

    const authHeader = Buffer.from(`${username}:${password}`).toString('base64');

    // Fetch ALL devices and find by PPPoE username (same approach as admin API)
    // NOTE: timeout covers both connection AND body reading (clearTimeout is after response.json())
    const ctrl1 = new AbortController();
    const t1 = setTimeout(() => ctrl1.abort(), 10000);
    let allDevices: any[];
    try {
      const response = await fetch(`${host}/devices`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Accept': 'application/json',
        },
        signal: ctrl1.signal,
      });

      if (!response.ok) {
        clearTimeout(t1);
        return NextResponse.json(
          { success: false, error: 'GenieACS API error' },
          { status: response.status }
        );
      }

      allDevices = await response.json();
    } finally {
      clearTimeout(t1);
    }

    // Find device by PPPoE username using multiple paths (same as admin API)
    const pppUsernamePaths = [
      'VirtualParameters.pppUsername',
      'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
      'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username',
      'Device.PPP.Interface.1.Username'
    ];

    const getParamValue = (dev: any, paths: string[]): string => {
      for (const path of paths) {
        const parts = path.split('.');
        let value = dev;
        for (const part of parts) {
          if (value && typeof value === 'object' && part in value) {
            value = value[part];
          } else {
            value = undefined;
            break;
          }
        }
        if (value !== undefined && value !== null) {
          // Handle GenieACS _value structure
          if (typeof value === 'object' && '_value' in value) {
            value = value._value;
          }
          if (value && String(value) !== '-' && String(value) !== '') {
            return String(value);
          }
        }
      }
      return '';
    };

    const device = allDevices.find((dev: any) => {
      const pppUsername = getParamValue(dev, pppUsernamePaths);
      return pppUsername === user.username || pppUsername.toLowerCase() === user.username.toLowerCase();
    });

    if (!device) {
      // Return 200 so browser doesn't log a red error; caller handles !data.success
      return NextResponse.json(
        { success: false, reason: 'device_not_found', error: 'Device not found', device: null }
      );
    }

    // Extract WLAN configurations and connected devices
    const processedDevice = extractDeviceInfo(device);

    return NextResponse.json({
      success: true,
      device: processedDevice
    });

  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.warn('[Customer WiFi GET] GenieACS tidak merespons setelah 5 detik');
      return NextResponse.json({
        success: false,
        reason: 'timeout',
        error: 'GenieACS tidak merespons dalam 5 detik. Perangkat mungkin offline.',
        device: null
      });
    }
    console.error('Get WiFi info error:', error);
    return NextResponse.json(
      { success: false, error: error.message, device: null },
      { status: 500 }
    );
  }
}

// Helper function to extract device information
function extractDeviceInfo(device: any) {
  const safeString = (val: any): string => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'object' && '_value' in val) return String(val._value || '-');
    return String(val || '-');
  };

  const getNestedValue = (obj: any, path: string): any => {
    const parts = path.split('.');
    let value = obj;
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return null;
      }
    }
    return value;
  };

  const isTruthyValue = (val: any): boolean => {
    if (val === null || val === undefined) return false;
    if (typeof val === 'object' && '_value' in val) val = val._value;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') return val.toLowerCase() === 'true' || val === '1';
    if (typeof val === 'number') return val === 1;
    return false;
  };

  // Extract WLAN configurations
  const wlanConfigs: any[] = [];
  const lanDevice = getNestedValue(device, 'InternetGatewayDevice.LANDevice.1');
  
  if (lanDevice && lanDevice.WLANConfiguration) {
    for (const [key, wlan] of Object.entries(lanDevice.WLANConfiguration)) {
      if (!isNaN(parseInt(key)) && wlan && typeof wlan === 'object') {
        const wlanObj = wlan as any;
        const ssid = safeString(wlanObj.SSID);
        const index = parseInt(key);

        // Count actual AssociatedDevice entries (more reliable than TotalAssociations field)
        const assocDeviceObj = wlanObj.AssociatedDevice;
        let assocCount = parseInt(safeString(wlanObj.TotalAssociations)) || 0;
        if (assocDeviceObj && typeof assocDeviceObj === 'object') {
          let actualCount = 0;
          for (const adKey of Object.keys(assocDeviceObj)) {
            if (!isNaN(parseInt(adKey)) && !adKey.startsWith('_')) actualCount++;
          }
          assocCount = Math.max(assocCount, actualCount);
        }
        
        // Include WLAN if it has an SSID name OR has connected devices
        const hasValidSsid = ssid && ssid !== '-' && ssid !== '';
        if (hasValidSsid || assocCount > 0) {
          const enabled = isTruthyValue(wlanObj.Enable) || assocCount > 0;
          
          // Determine band: prefer Standard field, then SSID hint, then BSSID prefix
          let band = '2.4GHz';
          const standard = safeString(wlanObj.Standard).toLowerCase();
          if (standard.includes('ac') || standard.includes('ax') || standard.includes('n5') || standard.includes('5ghz')) {
            band = '5GHz';
          }
          if (ssid.toLowerCase().includes('5g') || ssid.toLowerCase().includes('_5g')) band = '5GHz';
          // BSSID can hint at 5GHz (many ONTs use different OUI for 5GHz radio)
          const channel = parseInt(safeString(wlanObj.Channel)) || 0;
          if (channel > 14) band = '5GHz'; // channels > 14 are definitely 5GHz

          wlanConfigs.push({
            index,
            ssid: hasValidSsid ? ssid : '',
            enabled,
            channel: safeString(wlanObj.Channel),
            standard: safeString(wlanObj.Standard),
            security: safeString(wlanObj.BeaconType) || safeString(wlanObj.IEEE11iEncryptionModes) || '-',
            password: safeString(getNestedValue(wlanObj, 'PreSharedKey.1.PreSharedKey')) || 
                     safeString(wlanObj.KeyPassphrase) || '-',
            band,
            totalAssociations: assocCount,
            bssid: safeString(wlanObj.BSSID)
          });
        }
      }
    }
  }

  // Extract connected WiFi devices from AssociatedDevice (truly connected devices)
  const connectedHosts: any[] = [];
  
  // First, get WLAN AssociatedDevice data (these are actually connected to WiFi)
  console.log('[Customer WiFi] Extracting connected devices from AssociatedDevice...');
  for (const wlan of wlanConfigs) {
    const assocDevices = getNestedValue(
      lanDevice,
      `WLANConfiguration.${wlan.index}.AssociatedDevice`
    );
    
    console.log(`[Customer WiFi] WLAN[${wlan.index}] AssociatedDevice:`, assocDevices ? Object.keys(assocDevices) : 'null');
    
    if (assocDevices && typeof assocDevices === 'object') {
      for (const [key, assocDev] of Object.entries(assocDevices)) {
        // Skip non-numeric and metadata keys
        if (isNaN(parseInt(key)) || key.startsWith('_')) continue;
        
        if (assocDev && typeof assocDev === 'object') {
          const dev = assocDev as any;
          
          // Try multiple MAC address field names (same as admin API)
          let macAddress = safeString(dev.AssociatedDeviceMACAddress);
          if (macAddress === '-') macAddress = safeString(dev.MACAddress);
          
          console.log(`[Customer WiFi] AssocDev[${key}] MAC: ${macAddress}, raw:`, dev.AssociatedDeviceMACAddress);
          
          if (macAddress && macAddress !== '-' && macAddress !== '') {
            // Get signal strength - try multiple paths
            let rssi = parseInt(safeString(dev.X_HW_RSSI)) || 0;
            if (!rssi) rssi = parseInt(safeString(dev.SignalStrength)) || 0;
            if (!rssi) rssi = parseInt(safeString(dev.X_HW_SignalStrength)) || 0;
            
            // Get device hostname - try multiple paths
            let hostName = safeString(dev.X_HW_Description);
            if (hostName === '-') hostName = safeString(dev.HostName);
            if (hostName === '-') hostName = safeString(dev.X_CMCC_HostName);
            
            // Get IP address - try multiple paths
            let ipAddress = safeString(dev.AssociatedDeviceIPAddress);
            if (ipAddress === '-') ipAddress = safeString(dev.IPAddress);
            
            // Check if already added
            const existing = connectedHosts.find(h => h.macAddress.toLowerCase() === macAddress.toLowerCase());
            if (!existing) {
              connectedHosts.push({
                macAddress,
                ipAddress,
                hostname: hostName,
                associatedDevice: String(wlan.index), // WLAN index for per-SSID grouping
                active: true, // AssociatedDevice entries are ALWAYS active/connected
                signalStrength: rssi ? `${rssi} dBm` : '-'
              });
            }
          }
        }
      }
    }
  }
  
  // Now try to enrich with hostname from Hosts table
  const hosts = getNestedValue(device, 'InternetGatewayDevice.LANDevice.1.Hosts');
  if (hosts && hosts.Host) {
    for (const [key, host] of Object.entries(hosts.Host)) {
      if (!isNaN(parseInt(key)) && host && typeof host === 'object') {
        const hostObj = host as any;
        const hostMac = safeString(hostObj.MACAddress);
        const hostname = safeString(hostObj.HostName);
        const ipAddress = safeString(hostObj.IPAddress);
        
        if (hostMac && hostMac !== '-') {
          // Find matching device in connectedHosts and update hostname/IP
          const existing = connectedHosts.find(h => h.macAddress.toLowerCase() === hostMac.toLowerCase());
          if (existing) {
            if (hostname && hostname !== '-') existing.hostname = hostname;
            if (ipAddress && ipAddress !== '-') existing.ipAddress = ipAddress;
          }
        }
      }
    }
  }
  
  console.log('[Customer WiFi] Total connected devices found:', connectedHosts.length, connectedHosts);

  // Dynamic extraction of ALL Virtual Parameters
  const vp = device.VirtualParameters || {};
  const virtualParams: Record<string, any> = {};
  if (vp && typeof vp === 'object') {
    Object.keys(vp).forEach(key => {
      const value = vp[key];
      virtualParams[key] = value?._value !== undefined ? value._value : value;
    });
  }

  // Parameter paths for getting values (same as admin API)
  const getParamFromPaths = (paths: string[]): string => {
    for (const path of paths) {
      const value = getNestedValue(device, path);
      const result = safeString(value);
      if (result !== '-' && result !== '') {
        return result;
      }
    }
    return '-';
  };

  const pppUsername = virtualParams.pppUsername || getParamFromPaths([
    'VirtualParameters.pppUsername',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username'
  ]);

  const pppoeIP = virtualParams.pppIP || virtualParams.pppoeIP || getParamFromPaths([
    'VirtualParameters.pppIP',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ExternalIPAddress'
  ]);

  // RX Power - try multiple manufacturer paths
  let rxPowerRaw = virtualParams.redaman || virtualParams.RXPower || virtualParams.rxPower;
  if (!rxPowerRaw || rxPowerRaw === '-' || rxPowerRaw === '') {
    rxPowerRaw = getParamFromPaths([
      'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RXPower',
      'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower',
      'InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.RXPower',
      'InternetGatewayDevice.WANDevice.1.X_CT-COM_GponInterfaceConfig.RXPower',
      'InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.RXPower',
      'InternetGatewayDevice.WANDevice.1.X_CMCC_GponInterfaceConfig.RXPower',
      'InternetGatewayDevice.WANDevice.1.X_CMCC_EponInterfaceConfig.RXPower',
      'InternetGatewayDevice.WANDevice.1.WANEponInterfaceConfig.RXPower',
      'InternetGatewayDevice.X_ALU_OntOpticalParam.RXPower'
    ]);
  }
  const rxPower = String(rxPowerRaw || '-');

  // Uptime - try VP first as it may already be formatted
  let uptimeRaw = virtualParams.uptimeDevice || virtualParams.uptime;
  if (!uptimeRaw || uptimeRaw === '-' || uptimeRaw === '') {
    uptimeRaw = getParamFromPaths([
      'InternetGatewayDevice.DeviceInfo.UpTime',
      'Device.DeviceInfo.UpTime'
    ]);
  }
  const uptime = String(uptimeRaw || '-');

  // Temperature - try multiple manufacturer paths
  let tempRaw = virtualParams.temp || virtualParams.temperature;
  if (!tempRaw || tempRaw === '-' || tempRaw === '') {
    tempRaw = getParamFromPaths([
      'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TransceiverTemperature',
      'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TransceiverTemperature',
      'InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.TransceiverTemperature',
      'InternetGatewayDevice.WANDevice.1.X_CT-COM_GponInterfaceConfig.Temperature'
    ]);
  }
  const temp = String(tempRaw || '-');

  // Format functions
  const formatUptime = (uptimeValue: string): string => {
    if (uptimeValue === '-' || !uptimeValue || uptimeValue === '0') return '-';
    
    // If already formatted (contains 'd' followed by space, or matches HH:MM:SS pattern)
    // Examples: "0d 14:03:29", "1d 02:30:00", "14:03:29"
    if (/\d+d\s+\d+:\d+:\d+/.test(uptimeValue) || /^\d+:\d{2}:\d{2}$/.test(uptimeValue)) {
      return uptimeValue;
    }
    
    // Try to parse as seconds
    const seconds = parseInt(uptimeValue);
    if (isNaN(seconds) || seconds < 0) return uptimeValue;
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${days}d ${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatRxPower = (rx: string): string => {
    if (rx === '-') return '-';
    if (rx.toLowerCase().includes('dbm')) return rx;
    const val = parseFloat(rx);
    if (!isNaN(val)) {
      if (val < -100) return `${(val / 1000).toFixed(1)} dBm`;
      return `${val.toFixed(1)} dBm`;
    }
    return rx;
  };

  const formatTemp = (t: string): string => {
    if (t === '-') return '-';
    if (t.includes('°')) return t;
    const val = parseFloat(t);
    if (!isNaN(val)) {
      if (val > 1000) return `${(val / 1000).toFixed(0)}°C`;
      return `${val.toFixed(0)}°C`;
    }
    return t;
  };

  return {
    _id: device._id,
    pppUsername,
    serialNumber: safeString(device._deviceId?._SerialNumber) !== '-' 
      ? safeString(device._deviceId?._SerialNumber)
      : safeString(getNestedValue(device, 'InternetGatewayDevice.DeviceInfo.SerialNumber')),
    model: safeString(device._deviceId?._ProductClass) !== '-'
      ? safeString(device._deviceId?._ProductClass)
      : safeString(getNestedValue(device, 'InternetGatewayDevice.DeviceInfo.ModelName')),
    manufacturer: safeString(device._deviceId?._Manufacturer) !== '-'
      ? safeString(device._deviceId?._Manufacturer)
      : safeString(getNestedValue(device, 'InternetGatewayDevice.DeviceInfo.Manufacturer')),
    softwareVersion: safeString(getNestedValue(device, 'InternetGatewayDevice.DeviceInfo.SoftwareVersion')),
    ipAddress: pppoeIP,
    uptime: formatUptime(uptime),
    status: device._lastInform ? 
      (Date.now() - new Date(device._lastInform).getTime() < 3600000 ? 'Online' : 'Offline') : 
      'Unknown',
    wlanConfigs: wlanConfigs.sort((a, b) => a.index - b.index),
    connectedHosts,
    signalStrength: {
      rxPower: formatRxPower(rxPower),
      txPower: virtualParams.TXPower || virtualParams.txPower || '-',
      temperature: formatTemp(temp)
    }
  };
}

// POST - Update WiFi configuration
export async function POST(request: NextRequest) {
  try {
    const user = await verifyCustomerToken(request);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { deviceId, wlanIndex, ssid, password, securityMode = 'WPA2-PSK', enabled = true } = body;

    console.log('[Customer WiFi] Update request:', {
      userId: user.id,
      username: user.username,
      deviceId,
      wlanIndex,
      ssid: ssid?.substring(0, 10) + '...',
      hasPassword: !!password
    });

    // Validation
    if (!deviceId || !wlanIndex || !ssid) {
      console.error('[Customer WiFi] Missing parameters:', { deviceId, wlanIndex, ssid: !!ssid });
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    if (ssid.length < 1 || ssid.length > 32) {
      return NextResponse.json(
        { success: false, error: 'SSID harus 1-32 karakter' },
        { status: 400 }
      );
    }

    // Password validation - only if password is provided
    if (password && password.trim()) {
      if (password.length < 8 || password.length > 63) {
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
        { success: false, reason: 'not_configured', error: 'GenieACS not configured' }
      );
    }

    const { host, username: gusername, password: gpassword } = credentials;
    const authHeader = Buffer.from(`${gusername}:${gpassword}`).toString('base64');

    // STEP 1: Verify device exists and belongs to this customer
    console.log('[Customer WiFi] Verifying device ownership for deviceId:', deviceId);
    
    // Fetch device by _id to get full device object
    const deviceQuery = encodeURIComponent(JSON.stringify({ _id: deviceId }));
    const deviceUrl = `${host}/devices?query=${deviceQuery}`;
    
    console.log('[Customer WiFi] Fetching device from:', deviceUrl);
    
    const ctrl2 = new AbortController();
    const t2 = setTimeout(() => ctrl2.abort(), 5000);
    let deviceResponse: Response;
    try {
      deviceResponse = await fetch(deviceUrl, {
        method: 'GET',
        headers: { 'Authorization': `Basic ${authHeader}` },
        signal: ctrl2.signal,
      });
    } finally {
      clearTimeout(t2);
    }
    
    if (!deviceResponse.ok) {
      console.error('[Customer WiFi] Failed to fetch device:', deviceResponse.status, await deviceResponse.text());
      return NextResponse.json(
        { success: false, error: 'Failed to verify device' },
        { status: deviceResponse.status }
      );
    }
    
    const devices = await deviceResponse.json();
    console.log('[Customer WiFi] Devices found:', devices.length);
    
    if (!devices || devices.length === 0) {
      console.error('[Customer WiFi] Device not found in GenieACS:', deviceId);
      return NextResponse.json(
        { success: false, error: 'Device not found' },
        { status: 404 }
      );
    }

    const device = devices[0];
    
    console.log('[Customer WiFi] Device found, using deviceId for task:', deviceId);
    
    // Verify device belongs to this customer by checking PPPoE username
    const getParamValue = (dev: any, paths: string[]): string => {
      for (const path of paths) {
        const parts = path.split('.');
        let value = dev;
        for (const part of parts) {
          if (value && typeof value === 'object' && part in value) {
            value = value[part];
          } else {
            value = undefined;
            break;
          }
        }
        if (value !== undefined && value !== null) {
          if (typeof value === 'object' && '_value' in value) {
            value = value._value;
          }
          if (value && String(value) !== '-' && String(value) !== '') {
            return String(value);
          }
        }
      }
      return '';
    };

    const pppUsernamePaths = [
      'VirtualParameters.pppUsername',
      'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
      'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username',
      'Device.PPP.Interface.1.Username'
    ];

    const devicePppUsername = getParamValue(device, pppUsernamePaths);
    
    console.log('[Customer WiFi] Device PPPoE username:', devicePppUsername, 'Customer username:', user.username);
    
    if (devicePppUsername !== user.username && devicePppUsername.toLowerCase() !== user.username.toLowerCase()) {
      console.error('[Customer WiFi] Device does not belong to customer:', { devicePppUsername, customerUsername: user.username });
      return NextResponse.json(
        { success: false, error: 'Device not found' },
        { status: 404 }
      );
    }

    console.log('[Customer WiFi] Device ownership verified ✅');

    // Build parameter path
    const basePath = `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${wlanIndex}`;
    
    console.log('[Customer WiFi] Update request:', { ssid, hasPassword: !!password });

    // Like gembok-bill: Send SEPARATE tasks for SSID and password
    const tasks = [];

    // Task 1: Update SSID (always)
    const ssidTask = {
      name: 'setParameterValues',
      parameterValues: [
        [`${basePath}.SSID`, ssid, 'xsd:string']
      ]
    };

    const ssidUrl = `${host}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=3000&connection_request`;
    
    console.log('[Customer WiFi] Sending SSID task...');
    const ctrl3 = new AbortController();
    const t3 = setTimeout(() => ctrl3.abort(), 8000);
    let ssidResponse: Response;
    try {
      ssidResponse = await fetch(ssidUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ssidTask),
        signal: ctrl3.signal,
      });
    } finally {
      clearTimeout(t3);
    }

    if (!ssidResponse.ok) {
      const errorText = await ssidResponse.text();
      console.error('[Customer WiFi] SSID task error:', ssidResponse.status, errorText);
      throw new Error('Failed to update SSID');
    }

    console.log('[Customer WiFi] SSID task created ✅');

    // Task 2: Update password if provided (dual path like gembok-bill)
    if (password && password.trim()) {
      const passwordTask = {
        name: 'setParameterValues',
        parameterValues: [
          [`${basePath}.KeyPassphrase`, password, 'xsd:string'],
          [`${basePath}.PreSharedKey.1.KeyPassphrase`, password, 'xsd:string']
        ]
      };

      const passwordUrl = `${host}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=3000&connection_request`;
      
      console.log('[Customer WiFi] Sending password task...');
      const ctrl4 = new AbortController();
      const t4 = setTimeout(() => ctrl4.abort(), 8000);
      let passwordResponse: Response;
      try {
        passwordResponse = await fetch(passwordUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(passwordTask),
          signal: ctrl4.signal,
        });
      } finally {
        clearTimeout(t4);
      }

      if (!passwordResponse.ok) {
        const errorText = await passwordResponse.text();
        console.error('[Customer WiFi] Password task error:', passwordResponse.status, errorText);
        // Don't throw - SSID already updated
        console.warn('[Customer WiFi] Password update failed but SSID was updated');
      } else {
        console.log('[Customer WiFi] Password task created ✅');
      }
    }

    // Send refresh task
    try {
      const refreshTask = {
        name: 'refreshObject',
        objectName: basePath
      };

      const refreshUrl = `${host}/devices/${encodeURIComponent(deviceId)}/tasks?connection_request`;
      
      const ctrl5 = new AbortController();
      const t5 = setTimeout(() => ctrl5.abort(), 5000);
      try {
        await fetch(refreshUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(refreshTask),
          signal: ctrl5.signal,
        });
      } finally {
        clearTimeout(t5);
      }

      console.log('[Customer WiFi] Refresh task sent ✅');
    } catch (refreshError) {
      console.warn('[Customer WiFi] Failed to send refresh task:', refreshError);
    }

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        username: user.username,
        module: 'customer_wifi',
        action: 'update_wifi',
        description: `Customer updated WiFi configuration: SSID = ${ssid}`,
        metadata: JSON.stringify({ deviceId, wlanIndex, ssid }),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
      }
    });

    return NextResponse.json({
      success: true,
      message: 'WiFi configuration updated successfully'
    });

  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.warn('[Customer WiFi POST] GenieACS tidak merespons setelah timeout');
      return NextResponse.json(
        { success: false, error: 'GenieACS tidak merespons. Perangkat mungkin sedang offline, coba lagi nanti.' },
        { status: 503 }
      );
    }
    console.error('[Customer WiFi] Update WiFi error:', error);
    console.error('[Customer WiFi] Error stack:', error.stack);
    console.error('[Customer WiFi] Error message:', error.message);
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal update WiFi configuration' },
      { status: 500 }
    );
  }
}
