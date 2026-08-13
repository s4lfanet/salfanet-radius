import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Default configurations for DEVICE_LIST (Table Columns)
const deviceListConfigs = [
  {
    configType: 'DEVICE_LIST',
    section: 'main',
    parameterName: 'serialNumber',
    label: 'Device',
    parameterPaths: [
      'serialNumber',
      'DeviceID.SerialNumber',
      'InternetGatewayDevice.DeviceInfo.SerialNumber',
      'Device.DeviceInfo.SerialNumber'
    ],
    enabled: true,
    displayOrder: 1,
    columnWidth: '200px',
    format: 'text',
    icon: 'Server'
  },
  {
    configType: 'DEVICE_LIST',
    section: 'main',
    parameterName: 'manufacturer',
    label: 'Manufacturer',
    parameterPaths: [
      'manufacturer',
      'DeviceID.Manufacturer',
      'InternetGatewayDevice.DeviceInfo.Manufacturer',
      'Device.DeviceInfo.Manufacturer'
    ],
    enabled: false,
    displayOrder: 2,
    columnWidth: '150px',
    format: 'text',
    icon: 'Factory'
  },
  {
    configType: 'DEVICE_LIST',
    section: 'main',
    parameterName: 'pppoeUsername',
    label: 'Network',
    parameterPaths: ['VirtualParameters.pppoeUsername'],
    enabled: true,
    displayOrder: 3,
    columnWidth: '200px',
    format: 'text',
    icon: 'Network'
  },
  {
    configType: 'DEVICE_LIST',
    section: 'main',
    parameterName: 'rxPower',
    label: 'Signal',
    parameterPaths: ['VirtualParameters.RXPower'],
    enabled: true,
    displayOrder: 4,
    columnWidth: '120px',
    format: 'text',
    colorCoding: {
      green: { operator: '>', value: -25 },
      yellow: { operator: 'between', value: [-28, -25] },
      red: { operator: '<', value: -28 }
    },
    icon: 'Signal'
  },
  {
    configType: 'DEVICE_LIST',
    section: 'main',
    parameterName: 'lastInform',
    label: 'Last Inform',
    parameterPaths: ['lastInform', '_lastInform'],
    enabled: true,
    displayOrder: 5,
    columnWidth: '180px',
    format: 'datetime',
    icon: 'Clock'
  },
  {
    configType: 'DEVICE_LIST',
    section: 'main',
    parameterName: 'connectionStatus',
    label: 'Status',
    parameterPaths: [
      'status',
      'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionStatus',
      'Device.PPP.Interface.1.Status',
      'InternetGatewayDevice.X_CU_PON.PONStatus'
    ],
    enabled: true,
    displayOrder: 6,
    columnWidth: '120px',
    format: 'status',
    colorCoding: {
      green: { operator: 'equals', value: 'Online' },
      red: { operator: 'equals', value: 'Offline' },
      yellow: { operator: 'default', value: true }
    },
    icon: 'Activity'
  }
];

// Default configurations for DEVICE_DETAIL (Modal Sections)
const deviceDetailConfigs = [
  // Device Information Section
  {
    configType: 'DEVICE_DETAIL',
    section: 'device_info',
    parameterName: 'serialNumber',
    label: 'Serial Number',
    parameterPaths: [
      'DeviceID.SerialNumber',
      'InternetGatewayDevice.DeviceInfo.SerialNumber',
      'Device.DeviceInfo.SerialNumber'
    ],
    enabled: true,
    displayOrder: 1,
    format: 'text',
    icon: 'Hash'
  },
  {
    configType: 'DEVICE_DETAIL',
    section: 'device_info',
    parameterName: 'manufacturer',
    label: 'Manufacturer',
    parameterPaths: [
      'DeviceID.Manufacturer',
      'InternetGatewayDevice.DeviceInfo.Manufacturer',
      'Device.DeviceInfo.Manufacturer'
    ],
    enabled: true,
    displayOrder: 2,
    format: 'text',
    icon: 'Factory'
  },
  {
    configType: 'DEVICE_DETAIL',
    section: 'device_info',
    parameterName: 'oui',
    label: 'OUI',
    parameterPaths: [
      'DeviceID.OUI',
      'InternetGatewayDevice.DeviceInfo.ManufacturerOUI',
      'Device.DeviceInfo.ManufacturerOUI'
    ],
    enabled: true,
    displayOrder: 3,
    format: 'text',
    icon: 'Fingerprint'
  },
  {
    configType: 'DEVICE_DETAIL',
    section: 'device_info',
    parameterName: 'productClass',
    label: 'Product Class',
    parameterPaths: [
      'DeviceID.ProductClass',
      'InternetGatewayDevice.DeviceInfo.ProductClass',
      'Device.DeviceInfo.ProductClass'
    ],
    enabled: true,
    displayOrder: 4,
    format: 'text',
    icon: 'Package'
  },
  {
    configType: 'DEVICE_DETAIL',
    section: 'device_info',
    parameterName: 'hardwareVersion',
    label: 'Hardware Version',
    parameterPaths: [
      'InternetGatewayDevice.DeviceInfo.HardwareVersion',
      'Device.DeviceInfo.HardwareVersion'
    ],
    enabled: true,
    displayOrder: 5,
    format: 'text',
    icon: 'Cpu'
  },
  {
    configType: 'DEVICE_DETAIL',
    section: 'device_info',
    parameterName: 'softwareVersion',
    label: 'Software Version',
    parameterPaths: [
      'InternetGatewayDevice.DeviceInfo.SoftwareVersion',
      'Device.DeviceInfo.SoftwareVersion'
    ],
    enabled: true,
    displayOrder: 6,
    format: 'text',
    icon: 'Code'
  },

  // Connection Info Section
  {
    configType: 'DEVICE_DETAIL',
    section: 'connection_info',
    parameterName: 'pppoeUsername',
    label: 'PPPoE Username',
    parameterPaths: ['VirtualParameters.pppoeUsername'],
    enabled: true,
    displayOrder: 1,
    format: 'text',
    icon: 'User'
  },
  {
    configType: 'DEVICE_DETAIL',
    section: 'connection_info',
    parameterName: 'ipAddress',
    label: 'IP Address',
    parameterPaths: [
      'VirtualParameters.pppIP',
      'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress',
      'Device.PPP.Interface.1.IPCPRemoteAddress',
      'Device.IP.Interface.1.IPv4Address.1.IPAddress'
    ],
    enabled: true,
    displayOrder: 2,
    format: 'text',
    icon: 'Globe'
  },
  {
    configType: 'DEVICE_DETAIL',
    section: 'connection_info',
    parameterName: 'connectionStatus',
    label: 'Connection Status',
    parameterPaths: [
      'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionStatus',
      'Device.PPP.Interface.1.Status',
      'InternetGatewayDevice.X_CU_PON.PONStatus'
    ],
    enabled: true,
    displayOrder: 3,
    format: 'status',
    colorCoding: {
      green: { operator: 'equals', value: 'Connected' },
      red: { operator: 'equals', value: 'Disconnected' }
    },
    icon: 'Activity'
  },
  {
    configType: 'DEVICE_DETAIL',
    section: 'connection_info',
    parameterName: 'uptime',
    label: 'Uptime',
    parameterPaths: [
      'VirtualParameters.uptimeDevice',
      'VirtualParameters.uptime',
      'InternetGatewayDevice.DeviceInfo.UpTime',
      'Device.DeviceInfo.UpTime'
    ],
    enabled: true,
    displayOrder: 4,
    format: 'uptime',
    icon: 'Clock'
  },
  {
    configType: 'DEVICE_DETAIL',
    section: 'connection_info',
    parameterName: 'lastInform',
    label: 'Last Inform',
    parameterPaths: ['_lastInform'],
    enabled: true,
    displayOrder: 5,
    format: 'datetime',
    icon: 'Calendar'
  },

  // Optical Signal Info Section
  {
    configType: 'DEVICE_DETAIL',
    section: 'optical_info',
    parameterName: 'rxPower',
    label: 'RX Power',
    parameterPaths: ['VirtualParameters.RXPower'],
    enabled: true,
    displayOrder: 1,
    format: 'dBm',
    colorCoding: {
      green: { operator: '>', value: -25 },
      yellow: { operator: 'between', value: [-28, -25] },
      red: { operator: '<', value: -28 }
    },
    icon: 'Radio'
  },
  {
    configType: 'DEVICE_DETAIL',
    section: 'optical_info',
    parameterName: 'txPower',
    label: 'TX Power',
    parameterPaths: [
      'VirtualParameters.txPower',
      'InternetGatewayDevice.X_CT-COM_PONInfo.OpticalSendPower',
      'Device.Optical.Interface.1.TXPower',
      'InternetGatewayDevice.X_CU_PON.OpticalInfo.OpticalTransmitPower'
    ],
    enabled: true,
    displayOrder: 2,
    format: 'dBm',
    icon: 'Radio'
  },
  {
    configType: 'DEVICE_DETAIL',
    section: 'optical_info',
    parameterName: 'ponMode',
    label: 'PON Mode',
    parameterPaths: [
      'VirtualParameters.PonMode',
      'InternetGatewayDevice.X_CT-COM_PONInfo.PonMode',
      'Device.Optical.Interface.1.PONMode'
    ],
    enabled: true,
    displayOrder: 3,
    format: 'text',
    icon: 'Layers'
  },
  {
    configType: 'DEVICE_DETAIL',
    section: 'optical_info',
    parameterName: 'temperature',
    label: 'Temperature',
    parameterPaths: [
      'VirtualParameters.temperature',
      'InternetGatewayDevice.X_CT-COM_PONInfo.Temperature',
      'Device.Optical.Interface.1.Temperature',
      'InternetGatewayDevice.DeviceInfo.TemperatureStatus.1.Value'
    ],
    enabled: true,
    displayOrder: 4,
    format: 'celsius',
    colorCoding: {
      green: { operator: '<', value: 60 },
      yellow: { operator: 'between', value: [60, 75] },
      red: { operator: '>', value: 75 }
    },
    icon: 'Thermometer'
  },
  {
    configType: 'DEVICE_DETAIL',
    section: 'optical_info',
    parameterName: 'voltage',
    label: 'Voltage',
    parameterPaths: [
      'VirtualParameters.voltage',
      'InternetGatewayDevice.X_CT-COM_PONInfo.Voltage',
      'Device.Optical.Interface.1.Voltage'
    ],
    enabled: true,
    displayOrder: 5,
    format: 'voltage',
    icon: 'Zap'
  },

  // LAN Configuration Section
  {
    configType: 'DEVICE_DETAIL',
    section: 'lan_config',
    parameterName: 'lanIpAddress',
    label: 'LAN IP Address',
    parameterPaths: [
      'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceIPAddress',
      'Device.IP.Interface.2.IPv4Address.1.IPAddress'
    ],
    enabled: true,
    displayOrder: 1,
    format: 'text',
    icon: 'Globe'
  },
  {
    configType: 'DEVICE_DETAIL',
    section: 'lan_config',
    parameterName: 'subnetMask',
    label: 'Subnet Mask',
    parameterPaths: [
      'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceSubnetMask',
      'Device.IP.Interface.2.IPv4Address.1.SubnetMask'
    ],
    enabled: true,
    displayOrder: 2,
    format: 'text',
    icon: 'Network'
  },
  {
    configType: 'DEVICE_DETAIL',
    section: 'lan_config',
    parameterName: 'dhcpEnabled',
    label: 'DHCP Server',
    parameterPaths: [
      'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPServerEnable',
      'Device.DHCPv4.Server.Pool.1.Enable'
    ],
    enabled: true,
    displayOrder: 3,
    format: 'boolean',
    icon: 'Server'
  },
  {
    configType: 'DEVICE_DETAIL',
    section: 'lan_config',
    parameterName: 'macAddress',
    label: 'MAC Address',
    parameterPaths: [
      'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.MACAddress',
      'Device.Ethernet.Interface.1.MACAddress'
    ],
    enabled: true,
    displayOrder: 4,
    format: 'text',
    icon: 'Fingerprint'
  }
];

export async function seedParameterDisplayConfig() {
  console.log('🌱 Seeding parameter display configurations...');

  try {
    // Clear existing configurations
    await prisma.parameterDisplayConfig.deleteMany({});
    console.log('✨ Cleared existing configurations');

    // Seed DEVICE_LIST configurations
    console.log('📋 Seeding DEVICE_LIST configurations...');
    for (const config of deviceListConfigs) {
      await prisma.parameterDisplayConfig.create({
        data: config as any
      });
    }
    console.log(`✅ Seeded ${deviceListConfigs.length} DEVICE_LIST configurations`);

    // Seed DEVICE_DETAIL configurations
    console.log('📋 Seeding DEVICE_DETAIL configurations...');
    for (const config of deviceDetailConfigs) {
      await prisma.parameterDisplayConfig.create({
        data: config as any
      });
    }
    console.log(`✅ Seeded ${deviceDetailConfigs.length} DEVICE_DETAIL configurations`);

    console.log('🎉 Seeding completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding parameter display configurations:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  seedParameterDisplayConfig()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
