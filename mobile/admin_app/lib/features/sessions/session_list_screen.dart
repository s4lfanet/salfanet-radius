import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import '../pppoe/pppoe_detail_screen.dart';

/// Live RADIUS sessions (PPPoE and hotspot) with disconnect, mirroring the
/// web panel's Sesi PPPoE / Sesi Hotspot pages.
class SessionListScreen extends StatefulWidget {
  const SessionListScreen({super.key});

  @override
  State<SessionListScreen> createState() => _SessionListScreenState();
}

class _SessionListScreenState extends State<SessionListScreen> {
  List<Map<String, dynamic>> _sessions = [];
  bool _loading = true;
  String? _error;
  String _type = 'pppoe';
  String _search = '';
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _sessions.isEmpty;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/sessions', query: {
        'type': _type,
        'limit': 200,
        if (_search.isNotEmpty) 'search': _search,
      });
      if (res is Map<String, dynamic>) {
        _sessions = ((res['sessions'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
      }
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _disconnect(BuildContext ctx, Map<String, dynamic> s, {bool fromSheet = false}) async {
    final username = str(s, 'username');
    if (username == null) return;
    final ok = await confirmAction(ctx,
        title: 'Putuskan Sesi', message: '$username akan terputus dari internet dan harus login ulang.', confirmLabel: 'Putuskan', destructive: true);
    if (!ok || !ctx.mounted) return;
    final done = await runAction(ctx, () => ApiClient.instance.post('/api/sessions/disconnect', data: {'usernames': [username]}), success: 'Sesi $username diputuskan.');
    if (done) {
      if (fromSheet && ctx.mounted) Navigator.pop(ctx);
      _load();
    }
  }

  void _open(Map<String, dynamic> s) {
    final user = mapOf(s, 'user');
    final voucher = mapOf(s, 'voucher');
    final area = mapOf(user, 'area');
    showDetailSheet(
      context,
      header: DetailHeader(
        icon: _type == 'pppoe' ? Icons.person_rounded : Icons.confirmation_number_rounded,
        tone: Tone.success,
        title: str(user, 'name') ?? str(s, 'username') ?? '-',
        subtitle: str(s, 'username'),
        status: const StatusPill(label: 'Online', tone: Tone.success),
        figureLabel: 'Durasi',
        figure: str(s, 'durationFormatted') ?? '-',
      ),
      sections: [
        DetailSection(title: 'Koneksi', rows: [
          InfoRow('IP', str(s, 'framedIpAddress'), copyable: true),
          InfoRow('MAC', str(s, 'macAddress'), copyable: true),
          InfoRow('Router', str(mapOf(s, 'router'), 'name')),
          InfoRow('NAS IP', str(s, 'nasIpAddress')),
          InfoRow('Mulai', formatDateTimeOrNull(dateOf(s, 'startTime'))),
          InfoRow('Session ID', str(s, 'sessionId'), copyable: true),
        ]),
        DetailSection(title: 'Pemakaian', rows: [
          InfoRow('Download', str(s, 'downloadFormatted')),
          InfoRow('Upload', str(s, 'uploadFormatted')),
          InfoRow('Total', str(s, 'totalFormatted')),
        ]),
        if (user != null)
          DetailSection(title: 'Pelanggan', rows: [
            InfoRow('ID Pelanggan', str(user, 'customerId')),
            InfoRow('Paket', str(user, 'profile')),
            InfoRow('Area', str(area, 'name')),
            InfoRow('Telepon', str(user, 'phone'), copyable: true),
            InfoRow('Detail Pelanggan', user['id'] == null ? null : 'Buka',
                onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PppoeDetailScreen(userId: user['id'].toString())))),
          ]),
        if (voucher != null)
          DetailSection(title: 'Voucher', rows: [
            InfoRow('Paket', str(voucher, 'profile')),
            InfoRow('Batch', str(voucher, 'batchCode')),
            InfoRow('Agent', str(mapOf(voucher, 'agent'), 'name')),
            InfoRow('Kedaluwarsa', formatDateTimeOrNull(dateOf(voucher, 'expiresAt'))),
          ]),
      ],
      actions: (sheet) => [ActionSpec('Putuskan Sesi', Icons.link_off_rounded, () => _disconnect(sheet, s, fromSheet: true), kind: ActionKind.danger)],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_loading ? 'Sesi Online' : 'Sesi Online (${_sessions.length})')),
      body: Column(
        children: [
          SearchField(
            hint: 'Cari username, IP, atau MAC',
            onChanged: (v) {
              _debounce?.cancel();
              _debounce = Timer(const Duration(milliseconds: 400), () {
                _search = v.trim();
                _load();
              });
            },
          ),
          FilterChipRow(
            options: const [('pppoe', 'PPPoE'), ('hotspot', 'Hotspot')],
            selected: _type,
            onSelected: (v) {
              setState(() {
                _type = v;
                _sessions = [];
              });
              _load();
            },
          ),
          Expanded(
            child: DataStateView(
              loading: _loading,
              error: _error,
              onRetry: _load,
              isEmpty: _sessions.isEmpty,
              emptyIcon: Icons.wifi_off_rounded,
              emptyMessage: _search.isNotEmpty ? 'Tidak ada sesi yang cocok' : 'Tidak ada sesi ${_type == 'pppoe' ? 'PPPoE' : 'hotspot'} yang online',
              child: RefreshableList(
                onRefresh: _load,
                itemCount: _sessions.length,
                itemBuilder: (context, i) {
                  final s = _sessions[i];
                  final user = mapOf(s, 'user');
                  return EntityTile(
                    icon: _type == 'pppoe' ? Icons.person_rounded : Icons.confirmation_number_rounded,
                    tone: Tone.success,
                    title: str(user, 'name') ?? str(s, 'username') ?? '-',
                    subtitle: '${str(s, 'framedIpAddress') ?? '-'} · ${str(mapOf(s, 'router'), 'name') ?? '-'}',
                    meta: '${str(s, 'durationFormatted') ?? '-'} · ↓${str(s, 'downloadFormatted') ?? '-'} ↑${str(s, 'uploadFormatted') ?? '-'}',
                    onTap: () => _open(s),
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
