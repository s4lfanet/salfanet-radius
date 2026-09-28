import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import 'network_provider.dart';

class NetworkScreen extends StatelessWidget {
  const NetworkScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(create: (_) => NetworkProvider()..load(), child: const _View());
  }
}

class _View extends StatelessWidget {
  const _View();

  void _openRouter(BuildContext context, Map<String, dynamic> r, Map<String, dynamic>? status) {
    final checked = status != null;
    final online = status?['online'] == true;
    final vpn = mapOf(r, 'vpnClient');
    showDetailSheet(
      context,
      header: DetailHeader(
        icon: Icons.router_rounded,
        tone: !checked ? Tone.neutral : (online ? Tone.success : Tone.danger),
        title: str(r, 'name') ?? '-',
        subtitle: str(r, 'description') ?? str(r, 'shortname'),
        status: StatusPill(label: !checked ? 'Belum dicek' : (online ? 'Online' : 'Offline'), tone: !checked ? Tone.neutral : (online ? Tone.success : Tone.danger)),
      ),
      sections: [
        DetailSection(title: 'Status Langsung', rows: [
          InfoRow('Identity', online ? str(status, 'identity') : null),
          InfoRow('Uptime', online ? str(status, 'uptime') : null),
        ]),
        DetailSection(title: 'Koneksi', rows: [
          InfoRow('IP API', str(r, 'ipAddress'), copyable: true),
          InfoRow('NAS IP (RADIUS)', str(r, 'nasname'), copyable: true),
          InfoRow('Port API', str(r, 'port') ?? '8728'),
          InfoRow('Mode Auth', (str(r, 'authMode') ?? 'local').toUpperCase()),
          InfoRow('Username API', str(r, 'username'), copyable: true),
          InfoRow('VPN Client', vpn == null ? null : '${str(vpn, 'name')} · ${str(vpn, 'vpnIp')}'),
          InfoRow('Aktif', r['isActive'] == false ? 'Tidak' : 'Ya'),
          InfoRow('Ditambahkan', formatDateOrNull(dateOf(r, 'createdAt'))),
        ]),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<NetworkProvider>();
    final online = p.statusMap.values.where((s) => s['online'] == true).length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Router / NAS'),
        actions: [
          if (p.checkingStatus)
            const Padding(padding: EdgeInsets.only(right: Gap.lg), child: Center(child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))))
          else
            IconButton(tooltip: 'Cek ulang status', onPressed: p.load, icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      body: DataStateView(
        loading: p.loading,
        error: p.error,
        onRetry: p.load,
        isEmpty: p.routers.isEmpty,
        emptyIcon: Icons.router_outlined,
        emptyMessage: 'Belum ada router terdaftar',
        emptyHint: 'Tambahkan router MikroTik dari panel web (Jaringan > Router/NAS).',
        child: RefreshableList(
          onRefresh: p.load,
          header: p.statusMap.isEmpty
              ? null
              : Padding(
                  padding: const EdgeInsets.only(bottom: Gap.xs, left: 2),
                  child: Text('$online dari ${p.routers.length} router online', style: TextStyle(fontSize: 13, color: context.colors.onSurfaceVariant)),
                ),
          itemCount: p.routers.length,
          itemBuilder: (context, i) {
            final r = p.routers[i];
            final status = p.statusMap[r['id']?.toString()];
            final checked = status != null;
            final isOnline = status?['online'] == true;
            final tone = !checked ? Tone.neutral : (isOnline ? Tone.success : Tone.danger);
            return EntityTile(
              icon: Icons.router_rounded,
              tone: tone,
              title: str(r, 'name') ?? '-',
              subtitle: '${str(r, 'ipAddress') ?? '-'} · ${(str(r, 'authMode') ?? 'local').toUpperCase()}',
              meta: isOnline && str(status, 'uptime') != null ? 'Uptime ${str(status, 'uptime')}' : null,
              trailing: StatusPill(label: !checked ? (p.checkingStatus ? 'Memeriksa' : 'Belum dicek') : (isOnline ? 'Online' : 'Offline'), tone: tone),
              onTap: () => _openRouter(context, r, status),
            );
          },
        ),
      ),
    );
  }
}
