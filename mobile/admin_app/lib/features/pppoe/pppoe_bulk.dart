import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/crud/lookups.dart';
import '../../core/files.dart';
import '../../core/formatters.dart';
import '../../core/forms/field_spec.dart';
import '../../core/forms/form_screen.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';

final _api = ApiClient.instance;

const _statusOptions = [('active', 'Aktif'), ('isolated', 'Isolir'), ('blocked', 'Blokir'), ('stop', 'Stop')];

Future<bool> bulkChangeStatus(BuildContext context, List<String> ids) => openForm(
  context,
  title: 'Ubah Status (${ids.length})',
  submitLabel: 'Ubah',
  fields: const [
    FieldSpec('status', 'Status baru', type: FieldType.select, required: true, options: _statusOptions),
    FieldSpec.note('Isolir/blokir/stop memutus sesi yang sedang aktif.'),
  ],
  success: 'Status ${ids.length} pelanggan diubah.',
  onSubmit: (v) => _api.put('/api/pppoe/users/bulk-status', data: {'userIds': ids, 'status': v['status']}),
);

/// Router, billing day and auto-isolation for many customers at once; only
/// fields the admin actually set are sent.
Future<bool> bulkEdit(BuildContext context, List<String> ids) => openForm(
  context,
  title: 'Ubah Massal (${ids.length})',
  fields: [
    const FieldSpec.note('Kosongkan yang tidak ingin diubah.'),
    FieldSpec('routerId', 'Router', type: FieldType.select, loadOptions: () async => [('__none__', '— Lepas dari router —'), ...await Lookups.routers()]),
    const FieldSpec('billingDay', 'Tanggal tagihan (1–28)', type: FieldType.integer, min: 1, max: 28),
    const FieldSpec('autoIsolationEnabled', 'Isolir otomatis', type: FieldType.select, options: [('true', 'Aktif'), ('false', 'Nonaktif')]),
  ],
  success: 'Data ${ids.length} pelanggan diubah.',
  onSubmit: (v) {
    final data = <String, dynamic>{'userIds': ids};
    if (!isBlank(v['routerId'])) data['routerId'] = v['routerId'] == '__none__' ? null : v['routerId'];
    if (!isBlank(v['billingDay'])) data['billingDay'] = v['billingDay'];
    if (!isBlank(v['autoIsolationEnabled'])) data['autoIsolationEnabled'] = v['autoIsolationEnabled'] == 'true';
    if (data.length == 1) throw ApiException('Isi minimal satu kolom yang ingin diubah.');
    return _api.put('/api/pppoe/users/bulk-update', data: data);
  },
);

Future<bool> bulkDelete(BuildContext context, List<String> ids) async {
  final password = await askReason(context, title: 'Hapus ${ids.length} Pelanggan?', label: 'Password akun Anda (Super Admin)', confirmLabel: 'Hapus');
  if (password == null || !context.mounted) return false;
  var failed = 0;
  String? lastError;
  final ok = await runAction(context, () async {
    for (final id in ids) {
      try {
        await _api.delete('/api/pppoe/users', query: {'id': id}, data: {'confirmPassword': password});
      } on ApiException catch (e) {
        failed++;
        lastError = e.message;
        if (e.statusCode == 401 || e.statusCode == 403) rethrow;
      }
    }
  });
  if (!context.mounted) return ok;
  showToast(context, failed == 0 ? '${ids.length} pelanggan dihapus.' : '${ids.length - failed} dihapus, $failed gagal: $lastError');
  return ok;
}

/// Toolbar tools of the web customer list (sync, migrate, audit, import,
/// export).
class PppoeTools {
  static Future<bool> syncAllToRadius(BuildContext context) => openForm(
    context,
    title: 'Sinkron Massal ke RADIUS',
    submitLabel: 'Sinkron',
    fields: [
      const FieldSpec.note('Menulis ulang akun dan paket pelanggan ke tabel RADIUS tanpa mengubah mode router.'),
      FieldSpec('routerId', 'Router', type: FieldType.select, loadOptions: Lookups.routers, helper: 'Kosongkan untuk semua router.'),
    ],
    onSubmit: (v) async {
      final res = await _api.postLong('/api/pppoe/users/bulk-sync-radius', data: {if (!isBlank(v['routerId'])) 'routerId': v['routerId']});
      if (context.mounted) showToast(context, (res is Map ? res['message']?.toString() : null) ?? 'Sinkron selesai.');
    },
  );

  static Future<bool> migrateRouterToRadius(BuildContext context) => openForm(
    context,
    title: 'Migrasi Router ke RADIUS',
    submitLabel: 'Migrasi',
    fields: [
      const FieldSpec.note(
        'Semua pelanggan router ini disinkron ke RADIUS, PPP secret lokal dinonaktifkan, lalu sesi diputus agar login ulang lewat RADIUS. Pastikan RADIUS sudah terpasang di router.',
      ),
      FieldSpec('routerId', 'Router', type: FieldType.select, required: true, loadOptions: Lookups.routers),
    ],
    onSubmit: (v) async {
      final res = await _api.postLong('/api/pppoe/users/bulk-migrate-radius', data: v);
      if (context.mounted) showToast(context, (res is Map ? res['message']?.toString() : null) ?? 'Migrasi selesai.');
    },
  );

  static Future<void> exportUsers(BuildContext context) async {
    final filter = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ListTile(
              title: Text('Ekspor Pelanggan (CSV)', style: TextStyle(fontWeight: FontWeight.w700)),
            ),
            for (final (v, l) in const [('all', 'Semua pelanggan'), ('unpaid', 'Belum bayar'), ('paid', 'Sudah bayar'), ('isolated', 'Terisolir')])
              ListTile(leading: const Icon(Icons.description_rounded), title: Text(l), onTap: () => Navigator.pop(ctx, v)),
          ],
        ),
      ),
    );
    if (filter == null || !context.mounted) return;
    final stamp = DateTime.now().toIso8601String().substring(0, 10);
    await downloadAndShare(
      context,
      '/api/pppoe/users/bulk',
      'pelanggan-$filter-$stamp.csv',
      query: {'type': 'export', if (filter != 'all') 'paymentStatus': filter},
    );
  }

  static Future<void> downloadTemplate(BuildContext context) =>
      downloadAndShare(context, '/api/pppoe/users/bulk', 'template-import-pelanggan.xlsx', query: {'type': 'template', 'format': 'xlsx'});

  static Future<bool> importFile(BuildContext context) async {
    final res = await pickAndUpload(context, '/api/pppoe/users/bulk', extensions: ['csv', 'xlsx', 'xls']);
    if (res == null || !context.mounted) return false;
    final results = res is Map ? mapOf(res.cast<String, dynamic>(), 'results') : null;
    final errors =
        (results?['errors'] as List?)?.whereType<Map>().map((e) => 'Baris ${e['line']} (${e['username']}): ${e['error']}').toList() ?? const <String>[];
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Hasil Impor'),
        content: SingleChildScrollView(
          child: Text(
            ['${results?['success'] ?? 0} baru, ${results?['updated'] ?? 0} diperbarui, ${results?['failed'] ?? 0} gagal.', ...errors.take(30)].join('\n'),
          ),
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Tutup'))],
      ),
    );
    return true;
  }

  /// Two steps like the web dialog: pick a router, preview its PPP secrets,
  /// choose which new ones to import and under which package.
  static Future<bool> importFromMikrotik(BuildContext context) async {
    Map<String, dynamic>? preview;
    String? routerId;
    final picked = await openForm(
      context,
      title: 'Impor dari MikroTik',
      submitLabel: 'Lihat secret',
      fields: [
        const FieldSpec.note('Membaca PPP secret di router, lalu Anda memilih mana yang diimpor sebagai pelanggan.'),
        FieldSpec('routerId', 'Router', type: FieldType.select, required: true, loadOptions: Lookups.routers),
      ],
      onSubmit: (v) async {
        routerId = v['routerId'] as String?;
        final res = await _api.get('/api/pppoe/users/sync-mikrotik', query: {'routerId': routerId});
        preview = res is Map ? mapOf(res.cast<String, dynamic>(), 'data') : null;
      },
    );
    if (!picked || preview == null || !context.mounted) return false;
    final secrets = ((preview!['secrets'] as List?) ?? const [])
        .whereType<Map>()
        .map((e) => e.cast<String, dynamic>())
        .where((s) => s['isNew'] == true)
        .toList();
    if (secrets.isEmpty) {
      showToast(context, 'Semua ${preview!['total'] ?? 0} secret sudah ada di sistem.');
      return false;
    }
    return openForm(
      context,
      title: 'Pilih Secret (${secrets.length} baru)',
      submitLabel: 'Impor',
      fields: [
        FieldSpec(
          'selectedUsernames',
          'Secret yang diimpor',
          type: FieldType.multiSelect,
          required: true,
          options: [
            for (final s in secrets) (s['username'].toString(), '${s['username']} · ${s['profile'] ?? '-'}${s['disabled'] == true ? ' (nonaktif)' : ''}'),
          ],
        ),
        FieldSpec('profileId', 'Paket', type: FieldType.select, required: true, loadOptions: Lookups.pppoeProfiles),
        const FieldSpec('defaultPhone', 'No. HP default', initial: '08', helper: 'Dipakai untuk semua pelanggan hasil impor; ubah per pelanggan nanti.'),
      ],
      initial: {
        'selectedUsernames': [for (final s in secrets) s['username'].toString()],
      },
      success: 'Secret diimpor sebagai pelanggan.',
      onSubmit: (v) => _api.postLong('/api/pppoe/users/sync-mikrotik', data: {...v, 'routerId': routerId}),
    );
  }

  static Future<void> syncAudit(BuildContext context) async {
    String? routerId;
    Map<String, dynamic>? result;
    final ok = await openForm(
      context,
      title: 'Audit Sinkron MikroTik',
      submitLabel: 'Bandingkan',
      fields: [
        const FieldSpec.note('Membandingkan data pelanggan dengan PPP secret di router: yang hilang, password, paket, dan status yang berbeda.'),
        FieldSpec('routerId', 'Router', type: FieldType.select, required: true, loadOptions: Lookups.routers),
      ],
      onSubmit: (v) async {
        routerId = v['routerId'] as String?;
        final res = await _api.get('/api/pppoe/users/sync-audit', query: {'routerId': routerId});
        result = res is Map ? res.cast<String, dynamic>() : null;
      },
    );
    if (!ok || result == null || !context.mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _AuditResultScreen(routerId: routerId!, result: result!),
      ),
    );
  }
}

class _AuditResultScreen extends StatefulWidget {
  const _AuditResultScreen({required this.routerId, required this.result});
  final String routerId;
  final Map<String, dynamic> result;

  @override
  State<_AuditResultScreen> createState() => _AuditResultScreenState();
}

class _AuditResultScreenState extends State<_AuditResultScreen> {
  late final List<Map<String, dynamic>> _diffs = ((widget.result['differences'] as List?) ?? const [])
      .whereType<Map>()
      .map((e) => e.cast<String, dynamic>())
      .toList();
  final Set<int> _selected = {};
  bool _fixing = false;

  static const _labels = {
    'missing_in_mikrotik': ('Tidak ada di MikroTik', 'Buat secret', 'create_secret'),
    'missing_in_db': ('Tidak ada di sistem', 'Hapus secret', 'delete_secret'),
    'password_mismatch': ('Password berbeda', 'Samakan password', 'update_password'),
    'profile_mismatch': ('Paket berbeda', 'Samakan paket', 'update_profile'),
    'status_mismatch': ('Status berbeda', 'Samakan status', 'update_status'),
  };

  Future<void> _fix() async {
    final fixes = [
      for (final i in _selected) {'username': _diffs[i]['username'], 'action': _labels[_diffs[i]['type']]?.$3 ?? 'full_sync'},
    ];
    final ok = await confirmAction(
      context,
      title: 'Perbaiki ${fixes.length} Perbedaan?',
      message: 'Perubahan diterapkan ke MikroTik mengikuti data di sistem.',
      confirmLabel: 'Perbaiki',
    );
    if (!ok || !mounted) return;
    setState(() => _fixing = true);
    String? msg;
    final done = await runAction(context, () async {
      final res = await _api.postLong('/api/pppoe/users/sync-audit', data: {'routerId': widget.routerId, 'fixes': fixes});
      msg = res is Map ? res['message']?.toString() : null;
    });
    if (!mounted) return;
    setState(() => _fixing = false);
    if (done) {
      showToast(context, msg ?? 'Perbaikan diterapkan.');
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Hasil Audit (${_diffs.length})'),
        actions: [
          if (_diffs.isNotEmpty)
            TextButton(
              onPressed: () => setState(() => _selected.length == _diffs.length ? _selected.clear() : _selected.addAll(List.generate(_diffs.length, (i) => i))),
              child: Text(_selected.length == _diffs.length ? 'Batal pilih' : 'Pilih semua'),
            ),
        ],
      ),
      bottomNavigationBar: _selected.isEmpty ? null : _FixBar(count: _selected.length, busy: _fixing, onFix: _fix),
      body: _diffs.isEmpty
          ? Center(
              child: Text('Data sistem dan MikroTik sudah sama.', style: TextStyle(color: context.colors.onSurfaceVariant)),
            )
          : ListView.separated(
              padding: EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, listBottomPadding(context)),
              itemCount: _diffs.length,
              separatorBuilder: (_, __) => const SizedBox(height: Gap.sm),
              itemBuilder: (context, i) {
                final d = _diffs[i];
                final label = _labels[d['type']];
                return EntityTile(
                  icon: Icons.compare_arrows_rounded,
                  tone: d['type'] == 'missing_in_db' ? Tone.danger : Tone.warning,
                  title: str(d, 'username') ?? '-',
                  subtitle: label?.$1 ?? str(d, 'type'),
                  meta: str(d, 'message'),
                  trailing: Checkbox(value: _selected.contains(i), onChanged: (on) => setState(() => on == true ? _selected.add(i) : _selected.remove(i))),
                  onTap: () => setState(() => _selected.contains(i) ? _selected.remove(i) : _selected.add(i)),
                );
              },
            ),
    );
  }
}

class _FixBar extends StatelessWidget {
  const _FixBar({required this.count, required this.busy, required this.onFix});
  final int count;
  final bool busy;
  final VoidCallback onFix;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.all(Gap.md),
        child: FilledButton.icon(
          onPressed: busy ? null : onFix,
          icon: busy ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.build_rounded),
          label: Text('Perbaiki $count terpilih'),
        ),
      ),
    );
  }
}
