import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/crud/crud_list_screen.dart';
import '../resources/olt_resources.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

/// Read-only OLT health. isOnline / temperature / uptime come from the
/// existing cron poller (cron/olt-poll), so refreshing here is cheap and
/// never touches the OLT itself. Provisioning stays on the web.
class OltStatusScreen extends StatefulWidget {
  const OltStatusScreen({super.key});

  @override
  State<OltStatusScreen> createState() => _OltStatusScreenState();
}

class _OltStatusScreenState extends State<OltStatusScreen> {
  List<Map<String, dynamic>> _olts = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _olts.isEmpty;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/network/olts');
      if (res is Map<String, dynamic>) {
        _olts = ((res['olts'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
      }
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String? _uptime(Map<String, dynamic> o) {
    final secs = numOf(o, 'uptime').toInt();
    if (secs <= 0) return null;
    return formatDuration(Duration(seconds: secs));
  }

  void _open(Map<String, dynamic> o) {
    final online = o['isOnline'] == true;
    final count = mapOf(o, 'count') ?? mapOf(o, '_count');
    final routers = (o['routers'] as List?)?.map((e) => str(mapOf((e as Map).cast<String, dynamic>(), 'router'), 'name')).whereType<String>().join(', ');
    final temp = o['temperature'];
    showDetailSheet(
      context,
      header: DetailHeader(
        icon: Icons.dns_rounded,
        tone: online ? Tone.success : Tone.danger,
        title: str(o, 'name') ?? '-',
        subtitle: [str(o, 'vendor')?.toUpperCase(), str(o, 'model')].whereType<String>().join(' '),
        status: StatusPill(label: online ? 'Online' : 'Offline', tone: online ? Tone.success : Tone.danger),
      ),
      sections: [
        DetailSection(
          title: 'Kondisi',
          rows: [
            InfoRow('Uptime', _uptime(o)),
            InfoRow('Suhu', temp is num ? '${temp.toStringAsFixed(1)} °C' : null, valueColor: temp is num && temp >= 60 ? context.tone(Tone.danger) : null),
            InfoRow('Dicek terakhir', formatDateTimeOrNull(dateOf(o, 'lastPollAt'))),
            InfoRow('Monitoring', o['monitoringEnabled'] == true ? 'Aktif · tiap ${numOf(o, 'pollingInterval').toInt() ~/ 60} menit' : 'Nonaktif'),
          ],
        ),
        DetailSection(
          title: 'Perangkat',
          rows: [
            InfoRow('IP', str(o, 'ipAddress'), copyable: true),
            InfoRow('Firmware', str(o, 'firmwareVersion')),
            InfoRow('ODP', count == null ? null : '${numOf(count, 'odps')}'),
            InfoRow('ONU terpantau', count == null ? null : '${numOf(count, 'onuStatuses')}'),
            InfoRow('Router Uplink', routers == null || routers.isEmpty ? null : routers),
          ],
        ),
      ],
      actions: (sheet) => [
        ActionSpec('Kelola ONU', Icons.settings_input_component_rounded, () {
          Navigator.pop(sheet);
          CrudListScreen.open(context, oltDeviceConfig(o));
        }),
        ActionSpec('Edit OLT', Icons.edit_rounded, () async {
          if (await editOltSettings(sheet, o)) {
            if (sheet.mounted) Navigator.pop(sheet);
            _load();
          }
        }, kind: ActionKind.neutral),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final online = _olts.where((o) => o['isOnline'] == true).length;
    return Scaffold(
      appBar: AppBar(title: const Text('Status OLT')),
      body: DataStateView(
        loading: _loading,
        error: _error,
        onRetry: _load,
        isEmpty: _olts.isEmpty,
        emptyIcon: Icons.dns_outlined,
        emptyMessage: 'Belum ada OLT terdaftar',
        emptyHint: 'OLT ditambahkan dari panel web (Jaringan > OLT).',
        child: RefreshableList(
          onRefresh: _load,
          header: Padding(
            padding: const EdgeInsets.only(bottom: Gap.xs, left: 2),
            child: Text('$online dari ${_olts.length} OLT online', style: TextStyle(fontSize: 13, color: context.colors.onSurfaceVariant)),
          ),
          itemCount: _olts.length,
          itemBuilder: (context, i) {
            final o = _olts[i];
            final isOnline = o['isOnline'] == true;
            final last = dateOf(o, 'lastPollAt');
            return EntityTile(
              icon: Icons.dns_rounded,
              tone: isOnline ? Tone.success : Tone.danger,
              title: str(o, 'name') ?? '-',
              subtitle: '${str(o, 'ipAddress') ?? '-'} · ${(str(o, 'vendor') ?? '-').toUpperCase()}',
              meta: last != null ? 'Dicek ${formatRelativeTime(last)}' : 'Belum pernah dicek',
              trailing: StatusPill(label: isOnline ? 'Online' : 'Offline', tone: isOnline ? Tone.success : Tone.danger),
              onTap: () => _open(o),
            );
          },
        ),
      ),
    );
  }
}
