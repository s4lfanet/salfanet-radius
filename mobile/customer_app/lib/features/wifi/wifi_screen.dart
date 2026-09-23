import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/wifi_device.dart';
import 'wifi_edit_sheet.dart';
import 'wifi_provider.dart';

class WifiScreen extends StatefulWidget {
  const WifiScreen({super.key});

  @override
  State<WifiScreen> createState() => _WifiScreenState();
}

class _WifiScreenState extends State<WifiScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<WifiProvider>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<WifiProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text('WiFi Saya')),
      body: RefreshIndicator(
        onRefresh: provider.load,
        child: _buildBody(provider),
      ),
    );
  }

  Widget _buildBody(WifiProvider provider) {
    if (provider.loading && provider.device == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (provider.error != null) {
      return ListView(children: [
        const SizedBox(height: 100),
        const Icon(Icons.error_outline, size: 48, color: Colors.grey),
        const SizedBox(height: 12),
        Center(child: Text(provider.error!, textAlign: TextAlign.center)),
        const SizedBox(height: 16),
        Center(child: OutlinedButton(onPressed: provider.load, child: const Text('Coba Lagi'))),
      ]);
    }
    if (provider.device == null) {
      return ListView(children: [
        const SizedBox(height: 100),
        const Icon(Icons.wifi_off_outlined, size: 48, color: Colors.grey),
        const SizedBox(height: 12),
        Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(provider.infoMessage ?? 'Informasi WiFi tidak tersedia', textAlign: TextAlign.center),
          ),
        ),
      ]);
    }

    final device = provider.device!;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _DeviceStatusCard(device: device),
        const SizedBox(height: 16),
        Text('Jaringan WiFi', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        ...device.wlanConfigs.map((wlan) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _WlanCard(wlan: wlan),
            )),
        if (device.connectedHosts.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text('Perangkat Terhubung (${device.connectedHosts.length})', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          ...device.connectedHosts.map((host) => Card(
                child: ListTile(
                  leading: const Icon(Icons.devices_other),
                  title: Text(host.hostname == '-' ? host.macAddress : host.hostname),
                  subtitle: Text('${host.ipAddress} · ${host.signalStrength}'),
                ),
              )),
        ],
      ],
    );
  }
}

class _DeviceStatusCard extends StatelessWidget {
  const _DeviceStatusCard({required this.device});
  final WifiDevice device;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final onlineColor = device.isOnline ? const Color(0xFF12B76A) : scheme.error;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.router_outlined, color: scheme.primary),
                const SizedBox(width: 10),
                Expanded(child: Text(device.model, style: const TextStyle(fontWeight: FontWeight.bold))),
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(color: onlineColor, shape: BoxShape.circle),
                ),
                const SizedBox(width: 6),
                Text(device.isOnline ? 'Online' : 'Offline', style: TextStyle(color: onlineColor, fontWeight: FontWeight.w600)),
              ],
            ),
            const Divider(height: 28),
            Row(
              children: [
                Expanded(child: _Stat(label: 'IP Address', value: device.ipAddress)),
                Expanded(child: _Stat(label: 'Uptime', value: device.uptime)),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: _Stat(label: 'RX Power', value: device.rxPower)),
                Expanded(child: _Stat(label: 'Suhu', value: device.temperature)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12)),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
      ],
    );
  }
}

class _WlanCard extends StatelessWidget {
  const _WlanCard({required this.wlan});
  final WlanConfig wlan;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: scheme.primaryContainer,
          child: Text(wlan.band == '5GHz' ? '5G' : '2.4', style: TextStyle(fontSize: 11, color: scheme.onPrimaryContainer, fontWeight: FontWeight.bold)),
        ),
        title: Text(wlan.ssid.isEmpty ? '(Tanpa nama)' : wlan.ssid),
        subtitle: Text('${wlan.band} · ${wlan.totalAssociations} perangkat terhubung'),
        trailing: IconButton(
          icon: const Icon(Icons.edit_outlined),
          onPressed: () => showWifiEditSheet(context, wlan),
        ),
      ),
    );
  }
}
