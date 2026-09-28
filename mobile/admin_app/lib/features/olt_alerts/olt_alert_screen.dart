import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

// Backend enums are lowercase (OltAlertSeverity / OltAlertType in schema.prisma).
Tone _severityTone(String s) => switch (s.toLowerCase()) { 'critical' => Tone.danger, 'warning' => Tone.warning, _ => Tone.primary };
String _severityLabel(String s) => switch (s.toLowerCase()) { 'critical' => 'Kritis', 'warning' => 'Peringatan', _ => 'Info' };

const _typeLabels = {
  'olt_offline': 'OLT offline',
  'olt_high_temp': 'Suhu OLT tinggi',
  'onu_offline': 'ONU offline',
  'low_signal': 'Sinyal ONU lemah',
  'high_errors': 'Error port tinggi',
  'dying_gasp': 'Dying gasp (listrik ONU padam)',
  'unauthorized_onu': 'ONU tidak terdaftar',
};

class OltAlertScreen extends StatefulWidget {
  const OltAlertScreen({super.key});

  @override
  State<OltAlertScreen> createState() => _OltAlertScreenState();
}

class _OltAlertScreenState extends State<OltAlertScreen> {
  List<Map<String, dynamic>> _alerts = [];
  bool _loading = true;
  String? _error;
  bool _resolved = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _alerts.isEmpty;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/olt/alerts', query: {'resolved': '$_resolved', 'limit': 100});
      if (res is Map<String, dynamic>) {
        _alerts = ((res['alerts'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
      }
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _resolve(BuildContext ctx, Map<String, dynamic> a, {bool fromSheet = false}) async {
    final done = await runAction(ctx, () => ApiClient.instance.put('/api/olt/alerts/${a['id']}'), success: 'Alert ditandai selesai.');
    if (done) {
      if (fromSheet && ctx.mounted) Navigator.pop(ctx);
      _load();
    }
  }

  void _open(Map<String, dynamic> a) {
    final olt = mapOf(a, 'olt');
    final onu = mapOf(a, 'onu');
    final customer = mapOf(onu, 'customer');
    final severity = str(a, 'severity') ?? 'info';
    final resolved = a['isResolved'] == true;
    final port = onu == null ? null : [str(onu, 'frame'), str(onu, 'slot'), str(onu, 'port')].whereType<String>().join('/');
    showDetailSheet(
      context,
      header: DetailHeader(
        icon: Icons.warning_amber_rounded,
        tone: resolved ? Tone.success : _severityTone(severity),
        title: _typeLabels[str(a, 'alertType')] ?? str(a, 'alertType') ?? 'Alert',
        subtitle: str(olt, 'name'),
        status: StatusPill(label: resolved ? 'Selesai' : _severityLabel(severity), tone: resolved ? Tone.success : _severityTone(severity)),
      ),
      sections: [
        DetailSection(title: 'Kejadian', rows: [
          InfoRow('Pesan', str(a, 'message')),
          InfoRow('Waktu', formatDateTimeOrNull(dateOf(a, 'createdAt'))),
          InfoRow('OLT', olt == null ? null : '${str(olt, 'name')} · ${str(olt, 'ipAddress')}'),
          InfoRow('Diselesaikan', formatDateTimeOrNull(dateOf(a, 'resolvedAt'))),
          InfoRow('Oleh', str(a, 'resolvedBy')),
        ]),
        if (onu != null)
          DetailSection(title: 'ONU', rows: [
            InfoRow('Serial', str(onu, 'serialNumber'), copyable: true),
            InfoRow('MAC', str(onu, 'macAddress'), copyable: true),
            InfoRow('Port', port == null || port.isEmpty ? null : '$port · ONU ${str(onu, 'onuId') ?? '-'}'),
            InfoRow('Pelanggan', customer == null ? null : '${str(customer, 'name')} (${str(customer, 'username')})'),
            InfoRow('Telepon', str(customer, 'phone'), copyable: true),
          ]),
      ],
      actions: resolved ? null : (sheet) => [ActionSpec('Tandai Selesai', Icons.check_circle_rounded, () => _resolve(sheet, a, fromSheet: true), kind: ActionKind.success)],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Alert OLT')),
      body: Column(
        children: [
          FilterChipRow(
            options: const [('false', 'Aktif'), ('true', 'Selesai')],
            selected: '$_resolved',
            onSelected: (v) {
              setState(() {
                _resolved = v == 'true';
                _alerts = [];
              });
              _load();
            },
          ),
          Expanded(
            child: DataStateView(
              loading: _loading,
              error: _error,
              onRetry: _load,
              isEmpty: _alerts.isEmpty,
              emptyIcon: Icons.verified_outlined,
              emptyMessage: _resolved ? 'Belum ada alert yang diselesaikan' : 'Tidak ada alert aktif',
              emptyHint: _resolved ? null : 'OLT dan ONU yang dipantau dalam kondisi normal.',
              child: RefreshableList(
                onRefresh: _load,
                itemCount: _alerts.length,
                itemBuilder: (context, i) {
                  final a = _alerts[i];
                  final severity = str(a, 'severity') ?? 'info';
                  final created = dateOf(a, 'createdAt');
                  final customer = mapOf(mapOf(a, 'onu'), 'customer');
                  return EntityTile(
                    icon: Icons.warning_amber_rounded,
                    tone: _resolved ? Tone.success : _severityTone(severity),
                    title: _typeLabels[str(a, 'alertType')] ?? str(a, 'message') ?? '-',
                    subtitle: [str(mapOf(a, 'olt'), 'name'), str(customer, 'name')].whereType<String>().join(' · '),
                    meta: created != null ? formatRelativeTime(created) : null,
                    trailing: StatusPill(label: _resolved ? 'Selesai' : _severityLabel(severity), tone: _resolved ? Tone.success : _severityTone(severity)),
                    onTap: () => _open(a),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
