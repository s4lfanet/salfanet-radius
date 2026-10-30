import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

/// Permintaan pencabutan ONT — mirrors the web portal's ont page: which
/// devices the field team has been asked to pull, this month vs last.
class OntScreen extends StatefulWidget {
  const OntScreen({super.key});

  @override
  State<OntScreen> createState() => _OntScreenState();
}

class _OntScreenState extends State<OntScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _removals = [];
  int _thisMonth = 0;
  int _lastMonth = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/collector/ont-removals');
      if (res is Map) {
        setState(() {
          _removals = [for (final r in res['removals'] is List ? res['removals'] : const []) Map<String, dynamic>.from(r as Map)];
          _thisMonth = num.tryParse('${res['thisMonth']}')?.toInt() ?? 0;
          _lastMonth = num.tryParse('${res['lastMonth']}')?.toInt() ?? 0;
        });
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Cabut ONT')),
      body: DataStateView(
        loading: _loading,
        error: _error,
        isEmpty: _removals.isEmpty,
        emptyIcon: Icons.router_outlined,
        emptyMessage: 'Tidak ada permintaan',
        emptyHint: 'Belum ada ONT yang diminta dicabut.',
        onRetry: _load,
        child: RefreshableList(
          itemCount: _removals.length,
          onRefresh: _load,
          header: Row(
            children: [
              Expanded(child: _meta('Bulan ini', '$_thisMonth', Tone.primary)),
              const SizedBox(width: Gap.md),
              Expanded(child: _meta('Bulan lalu', '$_lastMonth', Tone.neutral)),
            ],
          ),
          itemBuilder: (_, i) {
            final r = _removals[i];
            final status = '${r['status'] ?? 'pending'}';
            return EntityTile(
              icon: Icons.router_outlined,
              tone: statusTone(status),
              title: (r['customerName'] ?? r['name'] ?? r['username'] ?? '-').toString(),
              subtitle: [r['address'], r['reason']].whereType<String>().where((s) => s.isNotEmpty).join(' · '),
              meta: (r['createdAt'] ?? r['requestedAt'])?.toString().split('T').first,
              trailing: StatusPill.status(status),
              onTap: () => showDetailSheet<void>(
                context,
                header: DetailHeader(
                  icon: Icons.router_outlined,
                  tone: statusTone(status),
                  title: (r['customerName'] ?? r['name'] ?? '-').toString(),
                  subtitle: r['username']?.toString(),
                  status: StatusPill.status(status),
                ),
                sections: [
                  DetailSection(title: 'Detail', rows: [
                    InfoRow('Alamat', str(r, 'address')),
                    InfoRow('Telepon', str(r, 'phone')),
                    InfoRow('Alasan', str(r, 'reason')),
                    InfoRow('ONT', str(r, 'ontSerial') ?? str(r, 'serialNumber')),
                    InfoRow('Catatan', str(r, 'notes') ?? str(r, 'note')),
                    InfoRow('Diminta', str(r, 'createdAt')?.split('T').first),
                  ]),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _meta(String label, String value, Tone tone) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(Gap.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TextStyle(fontSize: 12, color: context.colors.onSurfaceVariant)),
            const SizedBox(height: 4),
            Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: context.tone(tone))),
          ],
        ),
      ),
    );
  }
}
