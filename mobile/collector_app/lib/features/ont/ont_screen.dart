import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import '../customers/customers_screen.dart';

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
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _pickIsolatedCustomer(context),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Ajukan'),
      ),
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

  /// The backend only accepts isolated/suspended customers, so the picker
  /// lists exactly those — same flow as the web portal's isolir page.
  Future<void> _pickIsolatedCustomer(BuildContext context) async {
    List<Map<String, dynamic>> users = [];
    try {
      final res = await ApiClient.instance.get('/api/collector/isolir');
      final list = res is Map ? res['users'] : null;
      users = [for (final u in list is List ? list : const []) Map<String, dynamic>.from(u as Map)];
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
      return;
    }
    if (!mounted) return;
    if (users.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Tidak ada pelanggan isolir untuk diajukan.')));
      return;
    }
    String query = '';
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheetState) {
          final visible = query.isEmpty
              ? users
              : users.where((u) => '${u['name']}'.toLowerCase().contains(query.toLowerCase()) || '${u['username']}'.toLowerCase().contains(query.toLowerCase())).toList();
          return DraggableScrollableSheet(
            expand: false,
            initialChildSize: 0.7,
            minChildSize: 0.4,
            maxChildSize: 0.95,
            builder: (_, controller) => Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(Gap.page, Gap.md, Gap.page, Gap.sm),
                  child: Row(
                    children: [
                      const Expanded(child: Text('Pilih pelanggan isolir', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700))),
                      IconButton(onPressed: () => Navigator.pop(sheetContext), icon: const Icon(Icons.close_rounded)),
                    ],
                  ),
                ),
                SearchField(hint: 'Cari nama / username…', onChanged: (v) => setSheetState(() => query = v)),
                Expanded(
                  child: RefreshableList(
                    itemCount: visible.length,
                    onRefresh: () async {},
                    itemBuilder: (_, i) => EntityTile(
                      icon: Icons.wifi_off_rounded,
                      tone: Tone.danger,
                      title: (visible[i]['name'] ?? visible[i]['username'] ?? '-').toString(),
                      subtitle: '${visible[i]['username']}',
                      onTap: () {
                        Navigator.pop(sheetContext);
                        requestOntRemoval(context, visible[i], _load);
                      },
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
