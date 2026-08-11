import { NextRequest, NextResponse } from 'next/server';
import { getGenieACSCredentials } from '../../../route';

// Helper to extract raw value from GenieACS format (handles {_value: x} format)
function extractRawValue(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object' && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>;
    if ('_value' in obj) return obj._value;
    if ('value' in obj) return obj.value;
  }
  return val;
}

// Helper to safely convert any value to string
function safeString(val: unknown): string {
  const raw = extractRawValue(val);
  if (raw === null || raw === undefined) return '-';
  if (typeof raw === 'string') return raw || '-';
  if (typeof raw === 'number') return String(raw);
  if (typeof raw === 'boolean') return String(raw);
  if (Array.isArray(raw)) {
    if (raw.length > 0) return safeString(raw[0]);
    return '-';
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if ('_value' in obj) return safeString(obj._value);
    if ('value' in obj) {
      if (Array.isArray(obj.value) && (obj.value as unknown[]).length > 0) {
        return safeString((obj.value as unknown[])[0]);
      }
      return safeString(obj.value);
    }
    return '-';
  }
  return String(raw) || '-';
}

// Helper function to get parameter value from device
function getParameterValue(device: Record<string, unknown>, paths: string[]): string {
  for (const path of paths) {
    const parts = path.split('.');
    let value: unknown = device;
    
    for (const part of parts) {
      if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        if (part in obj) {
          value = obj[part];
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

// Helper to get nested object value
function getNestedValue(device: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let value: unknown = device;
  
  for (const part of parts) {
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if (part in obj) {
        value = obj[part];
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  }
  return value;
}

// Interface for WAN Connection
interface WANConnection {
  wanDeviceIndex: number;
  wanConnectionDeviceIndex: number;
  connectionIndex: number;
  connectionType: 'PPPoE' | 'IP' | 'Unknown';
  path: string;
  name: string;
  enable: boolean;
  connectionStatus: string;
  externalIPAddress: string;
  username: string;
  password: string;
  macAddress: string;
  dnsServers: string;
  vlanId: string;
  serviceList: string;
}

// Extract WAN connections from device
function extractWANConnections(device: Record<string, unknown>): WANConnection[] {
  const connections: WANConnection[] = [];

  const wanDevice = getNestedValue(device, 'InternetGatewayDevice.WANDevice') as Record<string, unknown>;
  if (!wanDevice || typeof wanDevice !== 'object') return connections;

  for (const wanDevKey of Object.keys(wanDevice)) {
    if (isNaN(parseInt(wanDevKey))) continue;
    const wanDev = wanDevice[wanDevKey] as Record<string, unknown>;
    if (!wanDev || typeof wanDev !== 'object') continue;

    const wanConnDev = wanDev['WANConnectionDevice'] as Record<string, unknown>;
    if (!wanConnDev || typeof wanConnDev !== 'object') continue;

    for (const wanConnDevKey of Object.keys(wanConnDev)) {
      if (isNaN(parseInt(wanConnDevKey))) continue;
      const connDev = wanConnDev[wanConnDevKey] as Record<string, unknown>;
      if (!connDev || typeof connDev !== 'object') continue;

      // Check PPP connections
      const pppConns = connDev['WANPPPConnection'] as Record<string, unknown>;
      if (pppConns && typeof pppConns === 'object') {
        for (const connKey of Object.keys(pppConns)) {
          if (isNaN(parseInt(connKey))) continue;
          const conn = pppConns[connKey] as Record<string, unknown>;
          if (!conn || typeof conn === 'undefined') continue;

          const basePath = `InternetGatewayDevice.WANDevice.${wanDevKey}.WANConnectionDevice.${wanConnDevKey}.WANPPPConnection.${connKey}`;
          const name = safeString(conn['Name']) !== '-' ? safeString(conn['Name']) : `PPPoE-${wanDevKey}.${wanConnDevKey}.${connKey}`;
          connections.push({
            wanDeviceIndex: parseInt(wanDevKey),
            wanConnectionDeviceIndex: parseInt(wanConnDevKey),
            connectionIndex: parseInt(connKey),
            connectionType: 'PPPoE',
            path: basePath,
            name,
            enable: isTruthyValue(conn['Enable']),
            connectionStatus: safeString(conn['ConnectionStatus']),
            externalIPAddress: safeString(conn['ExternalIPAddress']),
            username: safeString(conn['Username']),
            password: safeString(conn['Password']),
            macAddress: safeString(conn['MACAddress']),
            dnsServers: safeString(conn['DNSServers']),
            vlanId: safeString(getNestedValue(conn, 'X_HW_VLAN') as unknown) !== '-' 
              ? safeString(getNestedValue(conn, 'X_HW_VLAN') as unknown)
              : safeString(getNestedValue(conn, 'X_CMCC_VLANIDMark') as unknown),
            serviceList: safeString(conn['X_HW_ServiceList']) !== '-' 
              ? safeString(conn['X_HW_ServiceList'])
              : safeString(conn['ServiceList']),
          });
        }
      }

      // Check IP connections
      const ipConns = connDev['WANIPConnection'] as Record<string, unknown>;
      if (ipConns && typeof ipConns === 'object') {
        for (const connKey of Object.keys(ipConns)) {
          if (isNaN(parseInt(connKey))) continue;
          const conn = ipConns[connKey] as Record<string, unknown>;
          if (!conn || typeof conn === 'undefined') continue;

          const basePath = `InternetGatewayDevice.WANDevice.${wanDevKey}.WANConnectionDevice.${wanConnDevKey}.WANIPConnection.${connKey}`;
          const name = safeString(conn['Name']) !== '-' ? safeString(conn['Name']) : `DHCP-${wanDevKey}.${wanConnDevKey}.${connKey}`;
          connections.push({
            wanDeviceIndex: parseInt(wanDevKey),
            wanConnectionDeviceIndex: parseInt(wanConnDevKey),
            connectionIndex: parseInt(connKey),
            connectionType: 'IP',
            path: basePath,
            name,
            enable: isTruthyValue(conn['Enable']),
            connectionStatus: safeString(conn['ConnectionStatus']),
            externalIPAddress: safeString(conn['ExternalIPAddress']),
            username: '-',
            password: '-',
            macAddress: safeString(conn['MACAddress']),
            dnsServers: safeString(conn['DNSServers']),
            vlanId: safeString(getNestedValue(conn, 'X_HW_VLAN') as unknown),
            serviceList: safeString(conn['X_HW_ServiceList']) !== '-'
              ? safeString(conn['X_HW_ServiceList'])
              : safeString(conn['ServiceList']),
          });
        }
      }
    }
  }

  return connections;
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

// Interface for WLAN config
interface WLANConfig {
  index: number;
  ssid: string;
  enabled: boolean;
  channel: string;
  standard: string;
  security: string;
  password: string;
  band: string;
  totalAssociations: number;
  bssid: string;
}

// Interface for connected host/WiFi client
interface ConnectedHost {
  hostName: string;
  ipAddress: string;
  macAddress: string;
  interfaceType: string;
  active: boolean;
  layer2Interface: string;
  ssidIndex: number;
  // WiFi client specific fields
  rssi?: number;
  mode?: string;
  ssidName?: string;
}

// Helper to check if value is truthy (handles various formats from TR-069)
function isTruthyValue(val: unknown): boolean {
  const raw = extractRawValue(val);
  if (raw === true || raw === 1) return true;
  if (raw === false || raw === 0) return false;
  const str = safeString(raw).toLowerCase();
  return str === 'true' || str === '1' || str === 'yes' || str === 'on' || str === 'enabled';
}

// Helper to detect band from standard or frequency
function detectBand(wlan: Record<string, unknown>, index: number): string {
  // Check OperatingFrequencyBand first
  const freqBand = safeString(getNestedValue(wlan, 'OperatingFrequencyBand') as unknown);
  if (freqBand.includes('5')) return '5GHz';
  if (freqBand.includes('2.4') || freqBand.includes('2G')) return '2.4GHz';
  
  // Check Standard (802.11a/ac/ax for 5GHz, 802.11b/g/n for 2.4GHz)
  const standard = safeString(getNestedValue(wlan, 'Standard') as unknown).toLowerCase();
  if (standard.includes('ac') || standard.includes('ax') || standard === 'a' || standard.includes('5g')) return '5GHz';
  if (standard.includes('b') || standard.includes('g') || standard.includes('2.4')) return '2.4GHz';
  
  // Check X_HW_OperatingFrequencyBand (Huawei specific)
  const hwFreq = safeString(getNestedValue(wlan, 'X_HW_OperatingFrequencyBand') as unknown);
  if (hwFreq.includes('5')) return '5GHz';
  if (hwFreq.includes('2')) return '2.4GHz';
  
  // Check RadioEnabled paths for 5G
  const radio5g = getNestedValue(wlan, 'X_HW_Radio5GEnable') as unknown;
  if (radio5g !== undefined) {
    // This WLAN has 5G radio option, check if current config is for 5G
    const ssid = safeString(getNestedValue(wlan, 'SSID') as unknown).toLowerCase();
    if (ssid.includes('5g') || ssid.includes('_5') || ssid.includes('-5')) return '5GHz';
  }
  
  // Check SSID name for hints
  const ssid = safeString(getNestedValue(wlan, 'SSID') as unknown).toLowerCase();
  if (ssid.includes('5g') || ssid.includes('_5g') || ssid.includes('-5g') || ssid.includes(' 5g')) return '5GHz';
  
  // Fallback: typically index 1-2 are 2.4GHz, 3-4 are 5GHz for dual band
  // But for Huawei HG8145V5 pattern: odd=2.4GHz, even=5GHz or by grouping
  // More reliable: assume 2.4GHz unless proven otherwise
  return '2.4GHz';
}

// Extract all WLAN configurations
function extractWLANConfigs(device: Record<string, unknown>): WLANConfig[] {
  const wlanConfigs: WLANConfig[] = [];
  
  // Try InternetGatewayDevice.LANDevice.1.WLANConfiguration
  const lanDevice = getNestedValue(device, 'InternetGatewayDevice.LANDevice.1') as Record<string, unknown>;
  if (lanDevice && typeof lanDevice === 'object') {
    // Get WLANConfiguration object
    const wlanConfigObj = lanDevice['WLANConfiguration'] as Record<string, unknown>;
    if (wlanConfigObj && typeof wlanConfigObj === 'object') {
      // Iterate through all WLANConfiguration entries
      for (const key of Object.keys(wlanConfigObj)) {
        if (!isNaN(parseInt(key))) {
          const wlan = wlanConfigObj[key] as Record<string, unknown>;
          if (wlan && typeof wlan === 'object') {
            const ssid = safeString(wlan['SSID']);
            if (ssid && ssid !== '-' && ssid !== '') {
              const index = parseInt(key);
              
              // Get Enable value - GenieACS stores actual value at _value
              // If _value is missing but we have _object/_writable, the value hasn't been provisioned
              const enableRaw = wlan['Enable'];
              let enabled = false;
              
              if (enableRaw && typeof enableRaw === 'object') {
                const enableObj = enableRaw as Record<string, unknown>;
                if ('_value' in enableObj) {
                  enabled = isTruthyValue(enableObj._value);
                }
                // If no _value but has _object/_writable, value not provisioned - check other indicators
              } else {
                enabled = isTruthyValue(enableRaw);
              }
              
              const band = detectBand(wlan, index);
              
              // Get TotalAssociations - also handle _value format
              const totalAssocRaw = wlan['TotalAssociations'];
              let totalAssoc = 0;
              if (totalAssocRaw && typeof totalAssocRaw === 'object') {
                const assocObj = totalAssocRaw as Record<string, unknown>;
                if ('_value' in assocObj) {
                  totalAssoc = parseInt(String(assocObj._value)) || 0;
                }
              } else {
                totalAssoc = parseInt(safeString(totalAssocRaw)) || 0;
              }
              
              // Count AssociatedDevice entries as another way to determine if WLAN is active
              const assocDevices = wlan['AssociatedDevice'] as Record<string, unknown>;
              let assocDeviceCount = 0;
              if (assocDevices && typeof assocDevices === 'object') {
                for (const adKey of Object.keys(assocDevices)) {
                  if (!isNaN(parseInt(adKey))) {
                    assocDeviceCount++;
                  }
                }
              }
              
              // If TotalAssociations or AssociatedDevice count > 0, WLAN must be enabled
              if (!enabled && (totalAssoc > 0 || assocDeviceCount > 0)) {
                enabled = true;
              }
              
              // Use the larger of TotalAssociations or actual AssociatedDevice count
              if (assocDeviceCount > totalAssoc) {
                totalAssoc = assocDeviceCount;
              }
              
              // Get security mode
              let security = safeString(wlan['BeaconType']);
              if (security === '-' || security === '') {
                security = safeString(wlan['WPAEncryptionModes']);
              }
              if (security === '-' || security === '') {
                security = safeString(wlan['IEEE11iEncryptionModes']);
              }
              
              // Get BSSID
              const bssid = safeString(wlan['BSSID']);
              
              wlanConfigs.push({
                index,
                ssid,
                enabled,
                channel: safeString(wlan['Channel']),
                standard: safeString(wlan['Standard']),
                security,
                password: safeString(getNestedValue(wlan, 'PreSharedKey.1.PreSharedKey') as unknown) || 
                          safeString(wlan['KeyPassphrase']) ||
                          safeString(wlan['X_HW_WPAKey']),
                band,
                totalAssociations: totalAssoc,
                bssid
              });
            }
          }
        }
      }
    }
  }

  // Try Device.WiFi.SSID for newer TR-181 devices
  if (wlanConfigs.length === 0) {
    const wifiSSID = getNestedValue(device, 'Device.WiFi.SSID') as Record<string, unknown>;
    if (wifiSSID && typeof wifiSSID === 'object') {
      for (const key of Object.keys(wifiSSID)) {
        if (!isNaN(parseInt(key))) {
          const ssidObj = wifiSSID[key] as Record<string, unknown>;
          if (ssidObj && typeof ssidObj === 'object') {
            const ssid = safeString(getNestedValue(ssidObj, 'SSID') as unknown);
            if (ssid && ssid !== '-' && ssid !== '') {
              const index = parseInt(key);
              wlanConfigs.push({
                index,
                ssid,
                enabled: isTruthyValue(getNestedValue(ssidObj, 'Enable') as unknown),
                channel: '-',
                standard: '-',
                security: '-',
                password: '-',
                band: ssid.toLowerCase().includes('5g') ? '5GHz' : '2.4GHz',
                totalAssociations: 0,
                bssid: safeString(getNestedValue(ssidObj, 'BSSID') as unknown)
              });
            }
          }
        }
      }
    }
  }

  // Sort by index
  wlanConfigs.sort((a, b) => a.index - b.index);
  
  return wlanConfigs;
}

// Extract connected hosts/devices
function extractConnectedHosts(device: Record<string, unknown>): ConnectedHost[] {
  const hosts: ConnectedHost[] = [];
  
  // Try InternetGatewayDevice.LANDevice.1.Hosts.Host
  const hostsParent = getNestedValue(device, 'InternetGatewayDevice.LANDevice.1.Hosts') as Record<string, unknown>;
  if (hostsParent && typeof hostsParent === 'object') {
    const hostObj = hostsParent['Host'] as Record<string, unknown>;
    if (hostObj && typeof hostObj === 'object') {
      for (const key of Object.keys(hostObj)) {
        if (!isNaN(parseInt(key))) {
          const host = hostObj[key] as Record<string, unknown>;
          if (host && typeof host === 'object') {
            const macAddress = safeString(host['MACAddress']);
            if (macAddress && macAddress !== '-' && macAddress !== '') {
              // Determine interface type and SSID index from Layer2Interface
              let interfaceType = safeString(host['InterfaceType']);
              const layer2 = safeString(host['Layer2Interface']);
              let ssidIndex = 0;
              
              // Parse Layer2Interface to get SSID index (e.g., "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1")
              if (layer2.includes('WLANConfiguration')) {
                const match = layer2.match(/WLANConfiguration\.(\d+)/);
                if (match) {
                  ssidIndex = parseInt(match[1]);
                  interfaceType = `SSID${ssidIndex}`;
                }
              } else if (layer2.includes('LANEthernet') || interfaceType.toLowerCase().includes('ethernet')) {
                interfaceType = 'Ethernet';
              }
              
              // Check active status - need to handle GenieACS _value format
              const activeRaw = host['Active'];
              let active = false;
              if (activeRaw && typeof activeRaw === 'object') {
                const activeObj = activeRaw as Record<string, unknown>;
                if ('_value' in activeObj) {
                  active = isTruthyValue(activeObj._value);
                }
              } else {
                active = isTruthyValue(activeRaw);
              }
              
              // If connected via WiFi (has ssidIndex), consider as active since they're in Host list
              // Hosts list typically only contains currently visible devices
              if (ssidIndex > 0 && !active) {
                // WiFi device in host list - likely active even if Active flag not set
                active = true;
              }
              
              hosts.push({
                hostName: safeString(host['HostName']),
                ipAddress: safeString(host['IPAddress']),
                macAddress,
                interfaceType,
                active,
                layer2Interface: layer2,
                ssidIndex
              });
            }
          }
        }
      }
    }
  }

  // Try Device.Hosts.Host for TR-181
  if (hosts.length === 0) {
    const tr181HostsParent = getNestedValue(device, 'Device.Hosts') as Record<string, unknown>;
    if (tr181HostsParent && typeof tr181HostsParent === 'object') {
      const tr181Hosts = tr181HostsParent['Host'] as Record<string, unknown>;
      if (tr181Hosts && typeof tr181Hosts === 'object') {
        for (const key of Object.keys(tr181Hosts)) {
          if (!isNaN(parseInt(key))) {
            const host = tr181Hosts[key] as Record<string, unknown>;
            if (host && typeof host === 'object') {
              const macAddress = safeString(host['PhysAddress']);
              if (macAddress && macAddress !== '-' && macAddress !== '') {
                const activeRaw = host['Active'];
                let active = false;
                if (activeRaw && typeof activeRaw === 'object') {
                  const activeObj = activeRaw as Record<string, unknown>;
                  if ('_value' in activeObj) {
                    active = isTruthyValue(activeObj._value);
                  }
                } else {
                  active = isTruthyValue(activeRaw);
                }
                
                hosts.push({
                  hostName: safeString(host['HostName']),
                  ipAddress: safeString(host['IPAddress']),
                  macAddress,
                  interfaceType: safeString(host['Layer1Interface']),
                  active,
                  layer2Interface: safeString(host['Layer3Interface']),
                  ssidIndex: 0
                });
              }
            }
          }
        }
      }
    }
  }

  return hosts;
}

// Extract associated WLAN devices (connected to WiFi) - these are actively connected
// This is the primary source for WiFi clients information
function extractAssociatedDevices(device: Record<string, unknown>, wlanConfigs: WLANConfig[]): ConnectedHost[] {
  const devices: ConnectedHost[] = [];
  
  // Try each WLANConfiguration for AssociatedDevice
  const lanDevice = getNestedValue(device, 'InternetGatewayDevice.LANDevice.1') as Record<string, unknown>;
  if (lanDevice && typeof lanDevice === 'object') {
    const wlanConfigObj = lanDevice['WLANConfiguration'] as Record<string, unknown>;
    if (wlanConfigObj && typeof wlanConfigObj === 'object') {
      for (const wlanKey of Object.keys(wlanConfigObj)) {
        if (!isNaN(parseInt(wlanKey))) {
          const wlanIdx = parseInt(wlanKey);
          const wlan = wlanConfigObj[wlanKey] as Record<string, unknown>;
          if (wlan && typeof wlan === 'object') {
            // Get SSID name for this WLAN
            const ssidName = wlanConfigs.find(w => w.index === wlanIdx)?.ssid || `SSID${wlanIdx}`;
            // Get WLAN standard for mode info
            const wlanStandard = safeString(wlan['Standard']);
            
            const assocDevices = wlan['AssociatedDevice'] as Record<string, unknown>;
            
            // Debug: log what we find
            console.log(`WLAN[${wlanIdx}] AssociatedDevice keys:`, assocDevices ? Object.keys(assocDevices) : 'null');
            
            if (assocDevices && typeof assocDevices === 'object') {
              for (const key of Object.keys(assocDevices)) {
                // Skip non-numeric and metadata keys
                if (isNaN(parseInt(key)) || key.startsWith('_')) continue;
                
                const assocDev = assocDevices[key] as Record<string, unknown>;
                if (assocDev && typeof assocDev === 'object') {
                  // Try different MAC address field names
                  let macAddress = safeString(assocDev['AssociatedDeviceMACAddress']);
                  if (macAddress === '-') macAddress = safeString(assocDev['MACAddress']);
                  
                  console.log(`  AssocDev[${key}] MAC:`, macAddress, 'raw:', assocDev['AssociatedDeviceMACAddress']);
                  
                  if (macAddress && macAddress !== '-' && macAddress !== '') {
                    // AssociatedDevice entries are ALWAYS actively connected
                    // Extract WiFi client info: RSSI, Mode, IP, etc.
                    
                    // Get RSSI (signal strength) - try multiple paths
                    let rssi = parseInt(safeString(assocDev['X_HW_RSSI'])) || 0;
                    if (!rssi) rssi = parseInt(safeString(assocDev['SignalStrength'])) || 0;
                    if (!rssi) rssi = parseInt(safeString(assocDev['X_CMCC_RSSI'])) || 0;
                    
                    // Get device name/description - try multiple paths
                    let hostName = safeString(assocDev['X_HW_Description']);
                    if (hostName === '-') hostName = safeString(assocDev['HostName']);
                    if (hostName === '-') hostName = safeString(assocDev['X_CMCC_HostName']);
                    
                    // Get IP address
                    let ipAddress = safeString(assocDev['AssociatedDeviceIPAddress']);
                    if (ipAddress === '-') ipAddress = safeString(assocDev['IPAddress']);
                    
                    // Get operating mode/standard
                    let mode = safeString(assocDev['X_HW_OperatingStandard']);
                    if (mode === '-') mode = safeString(assocDev['OperatingStandard']);
                    if (mode === '-') mode = wlanStandard;
                    
                    devices.push({
                      hostName,
                      ipAddress,
                      macAddress,
                      interfaceType: `SSID${wlanIdx}`,
                      active: true, // ALWAYS true - being in AssociatedDevice means connected
                      layer2Interface: `WLANConfiguration.${wlanIdx}`,
                      ssidIndex: wlanIdx,
                      rssi: rssi || undefined,
                      mode: mode !== '-' ? mode : undefined,
                      ssidName
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  
  console.log('Total WiFi clients found:', devices.length);

  return devices;
}

const parameterPaths = {
  pppUsername: [
    'VirtualParameters.pppUsername',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
    'Device.PPP.Interface.1.Username'
  ],
  rxPower: [
    'VirtualParameters.redaman',
    'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower',
    'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RXPower',
  ],
  txPower: [
    'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TXPower',
    'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TXPower',
  ],
  pppoeIP: [
    'VirtualParameters.pppIP',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress',
  ],
  tr069IP: [
    'InternetGatewayDevice.ManagementServer.ConnectionRequestURL',
    'Device.ManagementServer.ConnectionRequestURL'
  ],
  uptime: [
    'VirtualParameters.uptimeDevice',
    'InternetGatewayDevice.DeviceInfo.UpTime',
  ],
  macAddress: [
    'VirtualParameters.MacAddress',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MACAddress',
    'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.MACAddress',
  ],
  softwareVersion: [
    'VirtualParameters.softwareVersion',
    'InternetGatewayDevice.DeviceInfo.SoftwareVersion',
  ],
  hardwareVersion: [
    'InternetGatewayDevice.DeviceInfo.HardwareVersion',
    'Device.DeviceInfo.HardwareVersion',
  ],
  ponMode: [
    'VirtualParameters.PonMode',
    'InternetGatewayDevice.DeviceInfo.AccessType',
  ],
  temp: [
    'VirtualParameters.temp',
    'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TransceiverTemperature',
  ],
  voltage: [
    'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TransceiverVoltage',
    'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TransceiverVoltage',
  ],
  biasCurrent: [
    'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TransceiverBiasCurrent',
    'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TransceiverBiasCurrent',
  ],
  lanIP: [
    'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceIPAddress',
    'Device.IP.Interface.1.IPv4Address.1.IPAddress',
  ],
  lanSubnet: [
    'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceSubnetMask',
  ],
  dhcpEnabled: [
    'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPServerEnable',
  ],
  dhcpStart: [
    'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MinAddress',
  ],
  dhcpEnd: [
    'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MaxAddress',
  ],
  dns1: [
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.DNSServers',
  ],
  memoryFree: [
    'InternetGatewayDevice.DeviceInfo.MemoryStatus.Free',
  ],
  memoryTotal: [
    'InternetGatewayDevice.DeviceInfo.MemoryStatus.Total',
  ],
  cpuUsage: [
    'InternetGatewayDevice.DeviceInfo.ProcessStatus.CPUUsage',
  ],
};

// GET - Get detailed device information
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  try {
    const { deviceId } = await params;
    
    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: 'Device ID is required' },
        { status: 400 }
      );
    }

    const credentials = await getGenieACSCredentials();

    if (!credentials) {
      return NextResponse.json(
        { success: false, error: 'GenieACS not configured' },
        { status: 400 }
      );
    }

    const { host, username, password } = credentials;
    const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

    // GenieACS uses query filter to get specific device, not direct /devices/{id}
    // The query format is: {"_id": "deviceId"}
    const query = JSON.stringify({ _id: deviceId });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await fetch(`${host}/devices/?query=${encodeURIComponent(query)}`, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`GenieACS API returned ${response.status}`);
    }

    const devicesArray = await response.json() as Record<string, unknown>[];
    
    if (!devicesArray || devicesArray.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Device not found' },
        { status: 404 }
      );
    }

    const deviceRaw = devicesArray[0];
    
    // Extract device info
    const deviceIdObj = (deviceRaw._deviceId || {}) as Record<string, unknown>;
    
    const serialNumber = safeString(deviceIdObj._SerialNumber) !== '-' 
      ? safeString(deviceIdObj._SerialNumber) 
      : getParameterValue(deviceRaw, ['InternetGatewayDevice.DeviceInfo.SerialNumber']);
    
    const manufacturer = safeString(deviceIdObj._Manufacturer) !== '-'
      ? safeString(deviceIdObj._Manufacturer)
      : getParameterValue(deviceRaw, ['InternetGatewayDevice.DeviceInfo.Manufacturer']);
    
    const model = safeString(deviceIdObj._ProductClass) !== '-'
      ? safeString(deviceIdObj._ProductClass)
      : getParameterValue(deviceRaw, ['InternetGatewayDevice.DeviceInfo.ProductClass']);
    
    const oui = safeString(deviceIdObj._OUI);
    
    let tr069IP = getParameterValue(deviceRaw, parameterPaths.tr069IP);
    if (tr069IP !== '-' && tr069IP.includes('://')) {
      tr069IP = extractIPFromURL(tr069IP);
    }

    // Extract WLAN configs and connected devices
    const wlanConfigs = extractWLANConfigs(deviceRaw);
    const wanConnections = extractWANConnections(deviceRaw);
    
    // AssociatedDevice is the PRIMARY and ONLY source for WiFi clients (real-time connected devices)
    const wifiClients = extractAssociatedDevices(deviceRaw, wlanConfigs);
    
    // Hosts contains history of ALL devices - we only use it to get hostnames
    const allHosts = extractConnectedHosts(deviceRaw);
    
    // Build final connected devices list - ONLY from AssociatedDevice (real active connections)
    const allConnectedDevices: ConnectedHost[] = [];
    
    // Add all WiFi clients from AssociatedDevice - these are the ONLY active WiFi devices
    for (const wifiClient of wifiClients) {
      // Try to get hostname from Hosts if not available in AssociatedDevice
      if (wifiClient.hostName === '-') {
        const hostMatch = allHosts.find(h => 
          h.macAddress.toLowerCase() === wifiClient.macAddress.toLowerCase()
        );
        if (hostMatch && hostMatch.hostName !== '-') {
          wifiClient.hostName = hostMatch.hostName;
        }
      }
      allConnectedDevices.push(wifiClient);
    }
    
    // Note: We do NOT add inactive hosts anymore - they are just history
    // Only AssociatedDevice contains real-time connected WiFi clients

    // Calculate total connected from active devices
    const totalConnected = allConnectedDevices.length; // All are active since they come from AssociatedDevice
    
    // Check if device is truly dual band
    const has5GHz = wlanConfigs.some(w => w.band === '5GHz');
    const has24GHz = wlanConfigs.some(w => w.band === '2.4GHz');
    const isDualBand = has5GHz && has24GHz;

    const device = {
      _id: String(deviceRaw._id || ''),
      serialNumber,
      manufacturer,
      model,
      oui,
      pppoeUsername: getParameterValue(deviceRaw, parameterPaths.pppUsername),
      pppoeIP: getParameterValue(deviceRaw, parameterPaths.pppoeIP),
      tr069IP,
      rxPower: getParameterValue(deviceRaw, parameterPaths.rxPower),
      txPower: getParameterValue(deviceRaw, parameterPaths.txPower),
      ponMode: getParameterValue(deviceRaw, parameterPaths.ponMode),
      uptime: getParameterValue(deviceRaw, parameterPaths.uptime),
      macAddress: getParameterValue(deviceRaw, parameterPaths.macAddress),
      softwareVersion: getParameterValue(deviceRaw, parameterPaths.softwareVersion),
      hardwareVersion: getParameterValue(deviceRaw, parameterPaths.hardwareVersion),
      temp: getParameterValue(deviceRaw, parameterPaths.temp),
      voltage: getParameterValue(deviceRaw, parameterPaths.voltage),
      biasCurrent: getParameterValue(deviceRaw, parameterPaths.biasCurrent),
      // LAN info
      lanIP: getParameterValue(deviceRaw, parameterPaths.lanIP),
      lanSubnet: getParameterValue(deviceRaw, parameterPaths.lanSubnet),
      dhcpEnabled: getParameterValue(deviceRaw, parameterPaths.dhcpEnabled),
      dhcpStart: getParameterValue(deviceRaw, parameterPaths.dhcpStart),
      dhcpEnd: getParameterValue(deviceRaw, parameterPaths.dhcpEnd),
      dns1: getParameterValue(deviceRaw, parameterPaths.dns1),
      // System info
      memoryFree: getParameterValue(deviceRaw, parameterPaths.memoryFree),
      memoryTotal: getParameterValue(deviceRaw, parameterPaths.memoryTotal),
      cpuUsage: getParameterValue(deviceRaw, parameterPaths.cpuUsage),
      // WiFi & Connected devices
      wlanConfigs,
      wanConnections,
      connectedDevices: allConnectedDevices,
      totalConnected,
      isDualBand,
      status: getDeviceStatus(deviceRaw._lastInform as string | null),
      lastInform: deviceRaw._lastInform ? String(deviceRaw._lastInform) : null,
      tags: Array.isArray(deviceRaw._tags) ? (deviceRaw._tags as unknown[]).map((t) => String(t)) : []
    };

    return NextResponse.json({
      success: true,
      device
    });

  } catch (error: unknown) {
    console.error('Error fetching device detail:', error);
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { success: false, error: 'Koneksi ke GenieACS timeout. Periksa apakah server GenieACS berjalan.' },
        { status: 200 }
      );
    }
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch device';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
