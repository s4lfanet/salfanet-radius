import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/feature_colors.dart';
import '../../core/widgets/state_views.dart';
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
      return const ScrollableCenter(child: AppLoadingState(label: 'Menghubungi perangkat Anda...'));
    }
    if (provider.error != null) {
      return ScrollableCenter(child: AppErrorState(message: provider.error!, onRetry: provider.load));
    }
    if (provider.device == null) {
      // Not an error: GenieACS may be unconfigured, or the ONT simply offline.
      // The provider already phrases why, so the customer gets the cause.
      return ScrollableCenter(
        child: AppEmptyState(
          icon: Icons.wifi_off_rounded,
          accent: FeatureColors.wifi,
          title: 'Perangkat belum terbaca',
          message: provider.infoMessage ?? 'Informasi WiFi tidak tersedia saat ini.',
          action: OutlinedButton.icon(
            onPressed: provider.load,
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('Muat Ulang'),
          ),
        ),
      );
    }

    final device = provider.device!;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
      children: [
        _DeviceCard(device: device),
        const SizedBox(height: 24),
        Text('Jaringan WiFi', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 4),
        Text(
          'Ketuk Ubah untuk mengganti nama atau password.',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
        ),
        const SizedBox(height: 12),
        ...device.wlanConfigs.map(
          (wlan) => Padding(padding: const EdgeInsets.only(bottom: 10), child: _WlanCard(wlan: wlan)),
        ),
        if (device.connectedHosts.isNotEmpty) ...[
          const SizedBox(height: 14),
          Text(
            'Perangkat Terhubung (${device.connectedHosts.length})',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 12),
          Card(
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                for (var i = 0; i < device.connectedHosts.length; i++) ...[
                  _HostRow(host: device.connectedHosts[i]),
                  if (i != device.connectedHosts.length - 1)
                    Padding(
                      padding: const EdgeInsets.only(left: 62),
                      child: Divider(
                        height: 1,
                        color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.5),
                      ),
                    ),
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _DeviceCard extends StatelessWidget {
  const _DeviceCard({required this.device});
  final WifiDevice device;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final brightness = Theme.of(context).brightness;
    final online = device.isOnline;
    final statusColor = online ? StatusColors.success(brightness) : StatusColors.danger(brightness);

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(AppRadius.hero),
        border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              FeatureIconTile(icon: Icons.router_rounded, accent: FeatureColors.wifi, size: 44, radius: 14),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(device.model, style: Theme.of(context).textTheme.titleSmall),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        Icon(
                          online ? Icons.check_circle_rounded : Icons.error_rounded,
                          size: 13,
                          color: statusColor,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          online ? 'Perangkat menyala' : 'Perangkat tidak merespons',
                          style: TextStyle(color: statusColor, fontWeight: FontWeight.w600, fontSize: 12),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const Divider(height: 26),
          Row(
            children: [
              Expanded(child: StatBlock(label: 'Alamat IP', value: device.ipAddress)),
              Expanded(child: StatBlock(label: 'Menyala selama', value: device.uptime)),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(child: StatBlock(label: 'Daya sinyal optik', value: device.rxPower)),
              Expanded(child: StatBlock(label: 'Suhu', value: device.temperature)),
            ],
          ),
        ],
      ),
    );
  }
}

class _WlanCard extends StatelessWidget {
  const _WlanCard({required this.wlan});
  final WlanConfig wlan;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final brightness = Theme.of(context).brightness;
    final is5G = wlan.band == '5GHz';
    // The two bands get the two neighbouring hues of the network family, so
    // they stay distinguishable at a glance without leaving the palette.
    final accent = is5G ? FeatureColors.renewal : FeatureColors.wifi;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            FeatureIconTile(
              icon: is5G ? Icons.network_wifi_rounded : Icons.wifi_rounded,
              accent: accent,
              size: 42,
              radius: 13,
            ),
            const SizedBox(width: 13),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    wlan.ssid.isEmpty ? '(Tanpa nama)' : wlan.ssid,
                    style: Theme.of(context).textTheme.titleSmall,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 3),
                  Text(
                    '${wlan.band} · ${wlan.totalAssociations} perangkat',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            OutlinedButton(
              onPressed: () => showWifiEditSheet(context, wlan),
              style: OutlinedButton.styleFrom(
                // 44dp is the floor for something a thumb has to hit.
                minimumSize: const Size(68, 44),
                padding: const EdgeInsets.symmetric(horizontal: 14),
                foregroundColor: accent.of(brightness),
                side: BorderSide(color: accent.of(brightness).withValues(alpha: 0.5)),
              ),
              child: const Text('Ubah'),
            ),
          ],
        ),
      ),
    );
  }
}

class _HostRow extends StatelessWidget {
  const _HostRow({required this.host});
  final ConnectedHost host;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final named = host.hostname != '-' && host.hostname.isNotEmpty;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Icon(Icons.devices_rounded, size: 20, color: scheme.onSurfaceVariant),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  named ? host.hostname : host.macAddress,
                  style: Theme.of(context).textTheme.titleSmall,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  '${host.ipAddress} · sinyal ${host.signalStrength}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
