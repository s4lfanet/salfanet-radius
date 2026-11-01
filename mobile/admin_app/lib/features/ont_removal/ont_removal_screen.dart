import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import '../../core/guides/guides.dart';

/// Dispatch queue for retrieving ONTs from stopped customers. Only the admin
/// orders a removal: it goes to a technician, a collector, or both, and
/// whoever finishes first closes it. Same as the web Tugas Cabut ONT page.
class OntRemovalScreen extends StatefulWidget {
  const OntRemovalScreen({super.key});

  @override
  State<OntRemovalScreen> createState() => _OntRemovalScreenState();
}

class _OntRemovalScreenState extends State<OntRemovalScreen> {
  List<Map<String, dynamic>> _tasks = [];
  bool _loading = true;
  String? _error;
  String _status = 'PENDING';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _tasks.isEmpty;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/admin/ont-removal-tasks', query: {if (_status != 'all') 'status': _status});
      if (res is Map<String, dynamic>) {
        _tasks = ((res['tasks'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
      }
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _create() async {
    final created = await showModalBottomSheet<bool>(context: context, isScrollControlled: true, useSafeArea: true, builder: (_) => const _CreateSheet());
    if (created == true) _load();
  }

  void _open(Map<String, dynamic> t) {
    final status = str(t, 'status') ?? 'PENDING';
    showDetailSheet(
      context,
      header: DetailHeader(
        icon: Icons.assignment_return_rounded,
        tone: statusTone(status),
        title: str(t, 'customerName') ?? str(t, 'username') ?? '-',
        subtitle: [str(t, 'customerId'), str(t, 'username')].whereType<String>().join(' · '),
        status: StatusPill.status(status),
      ),
      sections: [
        DetailSection(title: 'Lokasi', rows: [InfoRow('Alamat', str(t, 'address')), InfoRow('Area', str(t, 'areaName'))]),
        DetailSection(
          title: 'Tugas',
          rows: [
            InfoRow('Teknisi', str(t, 'technicianName')),
            InfoRow('Kolektor', str(t, 'collectorName')),
            InfoRow('Status pelanggan', (str(t, 'customerStatus') == null ? null : statusLabel(str(t, 'customerStatus')!))),
            InfoRow('Alasan', str(t, 'reason')),
            InfoRow('Dibuat', formatDateTimeOrNull(dateOf(t, 'createdAt'))),
            InfoRow('Selesai', formatDateTimeOrNull(dateOf(t, 'completedAt'))),
            InfoRow('Catatan Penyelesaian', str(t, 'completedNotes')),
            InfoRow('Diselesaikan oleh', switch (str(t, 'completedByRole')) { 'technician' => 'Teknisi', 'collector' => 'Kolektor', _ => null }),
            InfoRow('Dibatalkan', formatDateTimeOrNull(dateOf(t, 'cancelledAt'))),
            InfoRow('Alasan Batal', str(t, 'cancelReason')),
          ],
        ),
      ],
      actions: status == 'PENDING'
          ? (sheet) => [
              ActionSpec('Batalkan Tugas', Icons.cancel_rounded, () async {
                final reason = await askReason(sheet, title: 'Batalkan Tugas', label: 'Alasan pembatalan', confirmLabel: 'Batalkan', required: false);
                if (reason == null || !sheet.mounted) return;
                final done = await runAction(
                  sheet,
                  () => ApiClient.instance.patch(
                    '/api/admin/ont-removal-tasks/${t['id']}',
                    data: {'cancelReason': reason.isEmpty ? 'Dibatalkan oleh admin' : reason},
                  ),
                  success: 'Tugas dibatalkan.',
                );
                if (done) {
                  if (sheet.mounted) Navigator.pop(sheet);
                  _load();
                }
              }, kind: ActionKind.danger),
            ]
          : null,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tugas Cabut ONT'), actions: const [GuideAction()]),
      floatingActionButton: FloatingActionButton.extended(onPressed: _create, icon: const Icon(Icons.add_rounded), label: const Text('Tugaskan')),
      body: Column(
        children: [
          FilterChipRow(
            options: const [('PENDING', 'Menunggu'), ('COMPLETED', 'Selesai'), ('CANCELLED', 'Dibatalkan'), ('all', 'Semua')],
            selected: _status,
            onSelected: (v) {
              setState(() {
                _status = v;
                _tasks = [];
              });
              _load();
            },
          ),
          Expanded(
            child: DataStateView(
              loading: _loading,
              error: _error,
              onRetry: _load,
              isEmpty: _tasks.isEmpty,
              emptyIcon: Icons.assignment_return_outlined,
              emptyMessage: _status == 'PENDING' ? 'Tidak ada penarikan ONT yang tertunda' : 'Tidak ada tugas di status ini',
              emptyHint: 'Ketuk "Tugaskan" untuk memerintahkan teknisi atau kolektor mengambil perangkat dari pelanggan terisolir.',
              child: RefreshableList(
                hasFab: true,
                onRefresh: _load,
                itemCount: _tasks.length,
                itemBuilder: (context, i) {
                  final t = _tasks[i];
                  final status = str(t, 'status') ?? 'PENDING';
                  final created = dateOf(t, 'createdAt');
                  return EntityTile(
                    icon: Icons.assignment_return_rounded,
                    tone: statusTone(status),
                    title: str(t, 'customerName') ?? str(t, 'username') ?? '-',
                    subtitle: str(t, 'address') ?? str(t, 'areaName') ?? '-',
                    meta: [
                      if (str(t, 'technicianName') != null) 'Teknisi: ${str(t, 'technicianName')}',
                      if (str(t, 'collectorName') != null) 'Kolektor: ${str(t, 'collectorName')}',
                      if (created != null) formatRelativeTime(created),
                    ].join(' · '),
                    trailing: StatusPill.status(status),
                    onTap: () => _open(t),
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

class _CreateSheet extends StatefulWidget {
  const _CreateSheet();

  @override
  State<_CreateSheet> createState() => _CreateSheetState();
}

class _CreateSheetState extends State<_CreateSheet> {
  final _reason = TextEditingController();
  List<Map<String, dynamic>> _customers = [];
  List<Map<String, dynamic>> _technicians = [];
  List<Map<String, dynamic>> _collectors = [];
  String? _username;
  String? _technicianId;
  String? _collectorId;
  bool _loadingOptions = true;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _loadOptions();
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> _list(dynamic v) => [for (final e in v is List ? v : const []) (e as Map).cast<String, dynamic>()];

  Future<void> _loadOptions() async {
    try {
      final res = await Future.wait([
        ApiClient.instance.get('/api/admin/ont-removal-tasks/assignees'),
        ApiClient.instance.get('/api/admin/isolated-users'),
      ]);
      final assignees = res[0] as Map?;
      _technicians = _list(assignees?['technicians']);
      _collectors = _list(assignees?['collectors']);
      _customers = _list((res[1] as Map?)?['data']);
    } on ApiException catch (_) {
      // Shown below as an empty list.
    } finally {
      if (mounted) setState(() => _loadingOptions = false);
    }
  }

  Future<void> _submit() async {
    if (_username == null || (_technicianId == null && _collectorId == null)) {
      showToast(context, 'Pilih pelanggan terisolir dan minimal satu penerima tugas.');
      return;
    }
    setState(() => _submitting = true);
    final done = await runAction(
      context,
      () => ApiClient.instance.post(
        '/api/admin/ont-removal-tasks',
        data: {
          'username': _username,
          if (_technicianId != null) 'assignedTechnicianId': _technicianId,
          if (_collectorId != null) 'assignedCollectorId': _collectorId,
          if (_reason.text.trim().isNotEmpty) 'reason': _reason.text.trim(),
        },
      ),
      success: 'Tugas cabut ONT dibuat.',
    );
    if (!mounted) return;
    setState(() => _submitting = false);
    if (done) Navigator.pop(context, true);
  }

  DropdownButtonFormField<String?> _assigneeField(String label, List<Map<String, dynamic>> options, String? value, ValueChanged<String?> onChanged) {
    return DropdownButtonFormField<String?>(
      initialValue: value,
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      items: [
        const DropdownMenuItem<String?>(value: null, child: Text('Tidak ada')),
        for (final o in options)
          DropdownMenuItem<String?>(value: o['id']?.toString(), child: Text([o['name'], o['phone']].where((s) => s != null && '$s'.isNotEmpty).join(' · '), overflow: TextOverflow.ellipsis)),
      ],
      onChanged: onChanged,
    );
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(Gap.page, 0, Gap.page, MediaQuery.viewInsetsOf(context).bottom + Gap.lg),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Tugaskan Cabut ONT', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(
            'Pilih teknisi, kolektor, atau keduanya. Yang menyelesaikan lebih dulu menutup tugas.',
            style: TextStyle(fontSize: 12.5, color: context.colors.onSurfaceVariant),
          ),
          const SizedBox(height: Gap.lg),
          if (_loadingOptions)
            const Padding(padding: EdgeInsets.all(Gap.md), child: Center(child: CircularProgressIndicator()))
          else ...[
            if (_customers.isEmpty)
              Text('Tidak ada pelanggan terisolir. Cabut ONT hanya untuk pelanggan terisolir atau ditangguhkan.', style: TextStyle(color: context.tone(Tone.warning)))
            else
              Autocomplete<Map<String, dynamic>>(
                displayStringForOption: (c) => '${c['name']} (${c['username']})',
                optionsBuilder: (v) {
                  final q = v.text.trim().toLowerCase();
                  final hits = q.isEmpty ? _customers : _customers.where((c) => '${c['name']} ${c['username']}'.toLowerCase().contains(q));
                  return hits.take(20);
                },
                onSelected: (c) => setState(() => _username = c['username']?.toString()),
                fieldViewBuilder: (context, controller, focus, onSubmit) => TextField(
                  controller: controller,
                  focusNode: focus,
                  onChanged: (_) => setState(() => _username = null),
                  decoration: InputDecoration(
                    labelText: 'Pelanggan terisolir',
                    hintText: 'Cari nama atau username',
                    suffixIcon: _username == null ? null : Icon(Icons.check_circle_rounded, color: context.tone(Tone.success)),
                  ),
                ),
              ),
            const SizedBox(height: Gap.md),
            _assigneeField('Teknisi', _technicians, _technicianId, (v) => setState(() => _technicianId = v)),
            const SizedBox(height: Gap.md),
            _assigneeField('Kolektor', _collectors, _collectorId, (v) => setState(() => _collectorId = v)),
            const SizedBox(height: Gap.md),
            TextField(controller: _reason, maxLines: 2, decoration: const InputDecoration(labelText: 'Alasan (opsional)')),
            const SizedBox(height: Gap.xl),
            FilledButton(
              onPressed: _submitting || _customers.isEmpty ? null : _submit,
              child: _submitting ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Buat Tugas'),
            ),
          ],
        ],
      ),
    );
  }
}
