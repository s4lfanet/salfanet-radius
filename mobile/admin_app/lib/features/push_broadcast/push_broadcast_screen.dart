import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';

/// Push broadcast to customers (fans out to both web push and the customer
/// app's FCM tokens on the backend), with the same targeting the web push
/// page offers and the send history below.
class PushBroadcastScreen extends StatefulWidget {
  const PushBroadcastScreen({super.key});

  @override
  State<PushBroadcastScreen> createState() => _PushBroadcastScreenState();
}

class _PushBroadcastScreenState extends State<PushBroadcastScreen> {
  final _title = TextEditingController();
  final _message = TextEditingController();
  String _target = 'all';
  final Set<String> _areaIds = {};
  bool _sending = false;

  Map<String, dynamic>? _stats;
  List<Map<String, dynamic>> _areas = [];
  List<Map<String, dynamic>> _history = [];

  static const _targets = [('all', 'Semua'), ('active', 'Pelanggan aktif'), ('expired', 'Kedaluwarsa'), ('area', 'Per area')];
  static const _targetLabels = {'all': 'Semua pelanggan', 'active': 'Pelanggan aktif', 'expired': 'Pelanggan kedaluwarsa', 'area': 'Area tertentu', 'selected': 'Pelanggan tertentu'};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _title.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        ApiClient.instance.get('/api/admin/push-notifications', query: {'action': 'stats'}),
        ApiClient.instance.get('/api/admin/push-notifications', query: {'limit': 10}),
      ]);
      _stats = mapOf(results[0] as Map<String, dynamic>?, 'stats');
      _areas = ((_stats?['areas'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
      _history = (((results[1] as Map?)?['broadcasts'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
    } on ApiException catch (_) {
      // The compose form works without stats/history.
    }
    if (mounted) setState(() {});
  }

  Future<void> _send() async {
    final title = _title.text.trim();
    final message = _message.text.trim();
    if (title.isEmpty || message.isEmpty) {
      showToast(context, 'Isi judul dan pesan dulu.');
      return;
    }
    if (_target == 'area' && _areaIds.isEmpty) {
      showToast(context, 'Pilih minimal satu area.');
      return;
    }
    final audience = _target == 'area' ? '${_areaIds.length} area terpilih' : _targetLabels[_target]!.toLowerCase();
    final ok = await confirmAction(context,
        title: 'Kirim Notifikasi?', message: '"$title" dikirim ke $audience yang memasang aplikasi atau mengaktifkan notifikasi web. Tidak bisa dibatalkan.', confirmLabel: 'Kirim');
    if (!ok || !mounted) return;
    setState(() => _sending = true);
    String? resultMessage;
    final done = await runAction(context, () async {
      final res = await ApiClient.instance.post('/api/admin/push-notifications', data: {
        'title': title,
        'message': message,
        'recipientRole': 'customer',
        'targetType': _target,
        if (_target == 'area') 'targetIds': _areaIds.toList(),
      });
      resultMessage = res is Map ? res['message']?.toString() : null;
    });
    if (!mounted) return;
    setState(() => _sending = false);
    if (done) {
      showToast(context, resultMessage ?? 'Notifikasi terkirim.');
      _title.clear();
      _message.clear();
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final reach = _stats == null ? null : numOf(_stats, 'customersReachable');
    return Scaffold(
      appBar: AppBar(title: const Text('Broadcast Notifikasi')),
      bottomNavigationBar: ActionBar(actions: [ActionSpec('Kirim Notifikasi', Icons.send_rounded, _send, busy: _sending)]),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, Gap.xl),
          children: [
            if (reach != null)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(Gap.lg),
                  child: Row(
                    children: [
                      RoleIconTile(icon: Icons.campaign_rounded, color: context.colors.primary),
                      const SizedBox(width: Gap.md),
                      Expanded(
                        child: LabeledFigure(label: 'Pelanggan yang bisa menerima notifikasi', value: '$reach dari ${numOf(_stats, 'totalUsers')} aktif', valueSize: 16),
                      ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: Gap.lg),
            const SectionHeader('Tujuan'),
            Wrap(
              spacing: Gap.sm,
              runSpacing: Gap.sm,
              children: [
                for (final (value, label) in _targets)
                  ChoiceChip(
                    label: Text(label, style: TextStyle(color: _target == value ? onColor(context.colors.primary) : context.colors.onSurface, fontWeight: FontWeight.w600)),
                    selected: _target == value,
                    onSelected: (_) => setState(() => _target = value),
                  ),
              ],
            ),
            if (_target == 'area') ...[
              const SizedBox(height: Gap.md),
              if (_areas.isEmpty)
                Text('Belum ada area.', style: TextStyle(color: context.colors.onSurfaceVariant))
              else
                Wrap(
                  spacing: Gap.sm,
                  runSpacing: Gap.sm,
                  children: [
                    for (final a in _areas)
                      FilterChip(
                        label: Text(
                          str(a, 'name') ?? '-',
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            color: _areaIds.contains(a['id']) ? onColor(context.colors.primary) : context.colors.onSurface,
                          ),
                        ),
                        selected: _areaIds.contains(a['id']),
                        showCheckmark: true,
                        checkmarkColor: onColor(context.colors.primary),
                        onSelected: (on) => setState(() => on ? _areaIds.add(a['id'].toString()) : _areaIds.remove(a['id'])),
                      ),
                  ],
                ),
            ],
            const SizedBox(height: Gap.xl),
            const SectionHeader('Pesan'),
            TextField(controller: _title, maxLength: 60, decoration: const InputDecoration(labelText: 'Judul', hintText: 'mis. Pemeliharaan jaringan malam ini')),
            const SizedBox(height: Gap.sm),
            TextField(controller: _message, maxLines: 4, maxLength: 200, decoration: const InputDecoration(labelText: 'Isi pesan', alignLabelWithHint: true)),
            if (_history.isNotEmpty) ...[
              const SizedBox(height: Gap.lg),
              const SectionHeader('Riwayat Terkirim'),
              for (final h in _history)
                Padding(
                  padding: const EdgeInsets.only(bottom: Gap.sm),
                  child: EntityTile(
                    icon: Icons.campaign_rounded,
                    tone: Tone.primary,
                    title: str(h, 'title') ?? '-',
                    subtitle: str(h, 'body'),
                    meta: [
                      _targetLabels[str(h, 'targetType')] ?? str(h, 'targetType'),
                      '${numOf(h, 'sentCount')} terkirim',
                      if (numOf(h, 'failedCount') > 0) '${numOf(h, 'failedCount')} gagal',
                      formatDateTimeOrNull(dateOf(h, 'createdAt')),
                    ].whereType<String>().join(' · '),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}
