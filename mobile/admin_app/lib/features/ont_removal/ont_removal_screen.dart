import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

/// Dispatch queue for retrieving ONTs from stopped customers. Admin reviews
/// and assigns; the technician marks the job done from their own portal.
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
        DetailSection(title: 'Lokasi', rows: [
          InfoRow('Alamat', str(t, 'address')),
          InfoRow('Area', str(t, 'areaName')),
        ]),
        DetailSection(title: 'Tugas', rows: [
          InfoRow('Teknisi', str(t, 'technicianName')),
          InfoRow('Alasan', str(t, 'reason')),
          InfoRow('Dibuat', formatDateTimeOrNull(dateOf(t, 'createdAt'))),
          InfoRow('Selesai', formatDateTimeOrNull(dateOf(t, 'completedAt'))),
          InfoRow('Catatan Teknisi', str(t, 'completedNotes')),
          InfoRow('Dibatalkan', formatDateTimeOrNull(dateOf(t, 'cancelledAt'))),
          InfoRow('Alasan Batal', str(t, 'cancelReason')),
        ]),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Penarikan ONT')),
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
              emptyHint: 'Ketuk "Tugaskan" untuk mengirim teknisi mengambil perangkat dari pelanggan yang berhenti.',
              child: RefreshableList(
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
                    meta: 'Teknisi: ${str(t, 'technicianName') ?? '-'}${created != null ? ' · ${formatRelativeTime(created)}' : ''}',
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
  final _username = TextEditingController();
  final _reason = TextEditingController();
  List<Map<String, dynamic>> _technicians = [];
  String? _technicianId;
  bool _loadingOptions = true;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _loadTechnicians();
  }

  @override
  void dispose() {
    _username.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _loadTechnicians() async {
    try {
      final res = await ApiClient.instance.get('/api/admin/technicians');
      _technicians = (((res as Map?)?['technicians'] as List?) ?? [])
          .map((e) => (e as Map).cast<String, dynamic>())
          .where((t) => t['isActive'] == true)
          .toList();
    } on ApiException catch (_) {
    } finally {
      if (mounted) setState(() => _loadingOptions = false);
    }
  }

  Future<void> _submit() async {
    final username = _username.text.trim();
    if (username.isEmpty || _technicianId == null) {
      showToast(context, 'Isi username pelanggan dan pilih teknisi.');
      return;
    }
    setState(() => _submitting = true);
    final done = await runAction(
      context,
      () => ApiClient.instance.post('/api/admin/ont-removal-tasks', data: {
        'username': username,
        'assignedTechnicianId': _technicianId,
        if (_reason.text.trim().isNotEmpty) 'reason': _reason.text.trim(),
      }),
      success: 'Tugas penarikan ONT dibuat.',
    );
    if (!mounted) return;
    setState(() => _submitting = false);
    if (done) Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(Gap.page, 0, Gap.page, MediaQuery.viewInsetsOf(context).bottom + Gap.lg),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Tugaskan Penarikan ONT', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          const SizedBox(height: Gap.lg),
          TextField(controller: _username, autocorrect: false, decoration: const InputDecoration(labelText: 'Username PPPoE pelanggan')),
          const SizedBox(height: Gap.md),
          if (_loadingOptions)
            const Padding(padding: EdgeInsets.all(Gap.md), child: Center(child: CircularProgressIndicator()))
          else if (_technicians.isEmpty)
            Text('Belum ada teknisi aktif. Tambahkan teknisi dari panel web.', style: TextStyle(color: context.tone(Tone.danger)))
          else
            DropdownButtonFormField<String>(
              value: _technicianId,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Teknisi'),
              items: _technicians.map((t) => DropdownMenuItem(value: t['id']?.toString(), child: Text('${t['name']} · ${t['phoneNumber'] ?? ''}'))).toList(),
              onChanged: (v) => setState(() => _technicianId = v),
            ),
          const SizedBox(height: Gap.md),
          TextField(controller: _reason, maxLines: 2, decoration: const InputDecoration(labelText: 'Alasan (opsional)')),
          const SizedBox(height: Gap.xl),
          FilledButton(
            onPressed: _submitting || _technicians.isEmpty ? null : _submit,
            child: _submitting ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Buat Tugas'),
          ),
        ],
      ),
    );
  }
}
