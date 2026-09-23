class WlanConfig {
  const WlanConfig({
    required this.index,
    required this.ssid,
    required this.enabled,
    required this.band,
    required this.password,
    required this.totalAssociations,
  });

  final int index;
  final String ssid;
  final bool enabled;
  final String band;
  final String password;
  final int totalAssociations;

  factory WlanConfig.fromJson(Map<String, dynamic> json) => WlanConfig(
        index: (json['index'] as num?)?.toInt() ?? 0,
        ssid: json['ssid']?.toString() ?? '',
        enabled: json['enabled'] as bool? ?? false,
        band: json['band']?.toString() ?? '2.4GHz',
        password: json['password']?.toString() ?? '-',
        totalAssociations: (json['totalAssociations'] as num?)?.toInt() ?? 0,
      );
}

class ConnectedHost {
  const ConnectedHost({
    required this.macAddress,
    required this.ipAddress,
    required this.hostname,
    required this.signalStrength,
  });

  final String macAddress;
  final String ipAddress;
  final String hostname;
  final String signalStrength;

  factory ConnectedHost.fromJson(Map<String, dynamic> json) => ConnectedHost(
        macAddress: json['macAddress']?.toString() ?? '-',
        ipAddress: json['ipAddress']?.toString() ?? '-',
        hostname: json['hostname']?.toString() ?? '-',
        signalStrength: json['signalStrength']?.toString() ?? '-',
      );
}

class WifiDevice {
  const WifiDevice({
    required this.id,
    required this.model,
    required this.status,
    required this.ipAddress,
    required this.uptime,
    required this.wlanConfigs,
    required this.connectedHosts,
    required this.rxPower,
    required this.temperature,
  });

  final String id;
  final String model;
  final String status;
  final String ipAddress;
  final String uptime;
  final List<WlanConfig> wlanConfigs;
  final List<ConnectedHost> connectedHosts;
  final String rxPower;
  final String temperature;

  bool get isOnline => status == 'Online';

  factory WifiDevice.fromJson(Map<String, dynamic> json) {
    final signal = json['signalStrength'] as Map<String, dynamic>? ?? const {};
    return WifiDevice(
      id: json['_id']?.toString() ?? '',
      model: json['model']?.toString() ?? '-',
      status: json['status']?.toString() ?? 'Unknown',
      ipAddress: json['ipAddress']?.toString() ?? '-',
      uptime: json['uptime']?.toString() ?? '-',
      wlanConfigs: (json['wlanConfigs'] as List? ?? [])
          .map((e) => WlanConfig.fromJson(e as Map<String, dynamic>))
          .toList(),
      connectedHosts: (json['connectedHosts'] as List? ?? [])
          .map((e) => ConnectedHost.fromJson(e as Map<String, dynamic>))
          .toList(),
      rxPower: signal['rxPower']?.toString() ?? '-',
      temperature: signal['temperature']?.toString() ?? '-',
    );
  }
}
