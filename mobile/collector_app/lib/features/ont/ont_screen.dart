import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

/// Cabut ONT — the removal tasks an admin gave to this collector, same as
/// the web portal's Cabut ONT page. Cabut ONT is ordered by the admin: the
/// collector reports the result here and cannot start one.
class OntScreen extends StatefulWidget {
  const OntScreen({super.key});

  @override
  State<OntScreen> createState() => _OntScreenState();
}

class _OntScreenState extends State<OntScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _tasks = [];
  int _pending = 0;
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
          _tasks = [for (final r in res['tasks'] is List ? res['tasks'] : const []) Map<String, dynamic>.from(r as Map)];
          _pending = num.tryParse('${res['pending']}')?.toInt() ?? 0;
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

  Future<void> _report(Map<String, dynamic> task, String action) async {
    final done = action == 'complete';
    final notes = await askReason(
      context,
      title: done ? 'Laporkan ONT sudah dicabut' : 'Tugas tidak bisa dikerjakan',
      label: done ? 'Catatan (opsional)' : 'Alasan (wajib)',
      confirmLabel: 'Kirim laporan',
      required: !done,
      destructive: !done,
    );
    if (notes == null || !mounted) return;
    await runAction(context, () async {
      await ApiClient.instance.patch('/api/collector/ont-removals/${task['id']}', data: {'action': action, if (notes.trim().isNotEmpty) 'notes': notes.trim()});
    }, success: done ? 'Laporan cabut ONT terkirim.' : 'Tugas dikembalikan ke admin.');
    // Reload either way: a failure usually means the task changed meanwhile.
    if (mounted) _load();
  }

  (String, Tone) _status(String s) => switch (s) {
        'PENDING' => ('Perlu dikerjakan', Tone.warning),
        'COMPLETED' => ('Selesai', Tone.success),
        _ => ('Dibatalkan', Tone.neutral),
      };

  Widget _stat(BuildContext context, String label, int value) => Expanded(
        child: Column(
          children: [
            Text('$value', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
            Text(label, textAlign: TextAlign.center, style: TextStyle(fontSize: 11.5, color: context.colors.onSurfaceVariant)),
          ],
        ),
      );

  Widget _card(BuildContext context, Map<String, dynamic> t) {
    final muted = context.colors.onSurfaceVariant;
    final (label, tone) = _status('${t['status']}');
    final pending = t['status'] == 'PENDING';
    final phone = '${t['phone'] ?? ''}'.trim();
    final created = DateTime.tryParse('${t['createdAt'] ?? ''}');
    final completed = DateTime.tryParse('${t['completedAt'] ?? ''}');
    final ids = [t['customerId'] ?? t['username'], t['profileName'], t['areaName']].where((s) => s != null && '$s'.isNotEmpty).join(' · ');

    Widget line(IconData icon, String text) => Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(padding: const EdgeInsets.only(top: 1), child: Icon(icon, size: 15, color: muted)),
              const SizedBox(width: 8),
              Expanded(child: Text(text, style: TextStyle(fontSize: 12.5, color: muted))),
            ],
          ),
        );

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${t['fullname'] ?? t['username']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                      if (ids.isNotEmpty) Text(ids, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: muted)),
                    ],
                  ),
                ),
                const SizedBox(width: Gap.sm),
                StatusPill(label: label, tone: tone),
              ],
            ),
            if ('${t['address'] ?? ''}'.isNotEmpty) line(Icons.place_outlined, '${t['address']}'),
            if (phone.isNotEmpty) line(Icons.phone_outlined, phone),
            if ('${t['reason'] ?? ''}'.isNotEmpty) line(Icons.notes_rounded, 'Alasan admin: ${t['reason']}'),
            if (pending && t['withTechnician'] == true) line(Icons.groups_outlined, 'Teknisi juga ditugaskan. Yang selesai lebih dulu menutup tugas.'),
            if (t['status'] == 'COMPLETED')
              line(Icons.check_circle_outline_rounded, 'Selesai ${completed != null ? formatDateTime(completed.toLocal()) : ''}${t['completedByRole'] == 'technician' ? ' oleh teknisi' : ''}${'${t['completedNotes'] ?? ''}'.isNotEmpty ? ': ${t['completedNotes']}' : ''}'),
            if (t['status'] == 'CANCELLED' && '${t['cancelReason'] ?? ''}'.isNotEmpty) line(Icons.info_outline_rounded, 'Dibatalkan: ${t['cancelReason']}'),
            if (created != null) line(Icons.schedule_rounded, 'Ditugaskan ${formatDateTime(created.toLocal())}'),
            if (pending) ...[
              const SizedBox(height: Gap.md),
              Wrap(
                spacing: Gap.sm,
                runSpacing: Gap.sm,
                children: [
                  if (phone.isNotEmpty)
                    OutlinedButton.icon(
                      onPressed: () => launchUrl(Uri.parse('tel:$phone')),
                      icon: const Icon(Icons.call_rounded, size: 16),
                      label: const Text('Telepon'),
                    ),
                  OutlinedButton.icon(
                    onPressed: () => _report(t, 'cancel'),
                    icon: const Icon(Icons.close_rounded, size: 16),
                    label: const Text('Tidak bisa'),
                  ),
                  FilledButton.icon(
                    onPressed: () => _report(t, 'complete'),
                    icon: const Icon(Icons.check_rounded, size: 16),
                    label: const Text('Sudah dicabut'),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Cabut ONT')),
      body: DataStateView(
        loading: _loading,
        error: _error,
        isEmpty: _tasks.isEmpty,
        emptyIcon: Icons.router_outlined,
        emptyMessage: 'Belum ada tugas cabut ONT',
        emptyHint: 'Admin yang menentukan pelanggan mana yang perlu dicabut. Tugas muncul di sini dan di notifikasi.',
        onRetry: _load,
        child: RefreshableList(
          itemCount: _tasks.length + 1,
          onRefresh: _load,
          itemBuilder: (context, i) {
            if (i == 0) {
              return Card(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  child: Row(children: [_stat(context, 'Perlu dikerjakan', _pending), _stat(context, 'Selesai bulan ini', _thisMonth), _stat(context, 'Bulan lalu', _lastMonth)]),
                ),
              );
            }
            return _card(context, _tasks[i - 1]);
          },
        ),
      ),
    );
  }
}
