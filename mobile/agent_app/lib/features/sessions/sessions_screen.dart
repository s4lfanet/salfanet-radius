import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

/// Sesi aktif dari voucher milik agen: siapa yang sedang online, IP, MAC,
/// lama online dan pemakaian data.
class SessionsScreen extends StatefulWidget {
  const SessionsScreen({super.key});

  @override
  State<SessionsScreen> createState() => _SessionsScreenState();
}

class _SessionsScreenState extends State<SessionsScreen> {
  List<Map<String, dynamic>> _items = [];
  String _query = '';
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _items.isEmpty;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/agent/sessions');
      if (!mounted) return;
      final list = (res is Map ? res['sessions'] : null) as List?;
      setState(() => _items = list?.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() ?? []);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final q = _query.toLowerCase();
    final shown = q.isEmpty
        ? _items
        : _items.where((s) => '${str(s, 'username')} ${str(s, 'framedIpAddress')} ${str(s, 'callingStationId')}'.toLowerCase().contains(q)).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Sesi Aktif')),
      body: Column(
        children: [
          SearchField(hint: 'Cari kode, IP, atau MAC', onChanged: (v) => setState(() => _query = v.trim())),
          Expanded(
            child: DataStateView(
              loading: _loading,
              error: _error,
              isEmpty: shown.isEmpty,
              emptyIcon: Icons.wifi_off_rounded,
              emptyMessage: 'Tidak ada sesi aktif',
              emptyHint: 'Voucher Anda yang sedang dipakai akan tampil di sini.',
              onRetry: _load,
              child: RefreshableList(
                itemCount: shown.length,
                onRefresh: _load,
                header: Padding(
                  padding: const EdgeInsets.only(bottom: Gap.xs, left: 2),
                  child: Text('${shown.length} sesi online', style: TextStyle(fontSize: 12.5, color: context.colors.onSurfaceVariant)),
                ),
                itemBuilder: (context, i) {
                  final s = shown[i];
                  return EntityTile(
                    icon: Icons.wifi_rounded,
                    tone: Tone.success,
                    title: str(s, 'username') ?? '-',
                    subtitle: [str(s, 'profileName'), str(s, 'framedIpAddress'), str(s, 'callingStationId')].whereType<String>().join(' · '),
                    meta: [
                      if (str(s, 'durationFormatted') != null) 'Online ${str(s, 'durationFormatted')}',
                      if (str(s, 'downloadFormatted') != null) '↓ ${str(s, 'downloadFormatted')}',
                      if (str(s, 'uploadFormatted') != null) '↑ ${str(s, 'uploadFormatted')}',
                    ].join('  '),
                    trailing: const StatusPill(label: 'Online', tone: Tone.success),
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
