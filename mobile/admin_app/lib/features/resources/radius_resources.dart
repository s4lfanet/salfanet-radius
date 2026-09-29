import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/crud/crud_list_screen.dart';
import '../../core/files.dart';
import '../../core/formatters.dart';
import '../../core/forms/field_spec.dart';
import '../../core/forms/form_screen.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/result_screen.dart';
import '../../core/widgets/state_views.dart';

final _api = ApiClient.instance;
Json _map(dynamic res) => res is Map ? res.cast<String, dynamic>() : <String, dynamic>{};

/// FreeRADIUS control centre — /admin/freeradius/status plus links to the
/// other FreeRADIUS pages.
class FreeradiusScreen extends StatefulWidget {
  const FreeradiusScreen({super.key});

  @override
  State<FreeradiusScreen> createState() => _FreeradiusScreenState();
}

class _FreeradiusScreenState extends State<FreeradiusScreen> {
  Json? _s;
  String? _error;
  String? _busy;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = _map(await _api.get('/api/freeradius/status'));
      if (mounted) setState(() => _s = mapOf(res, 'status') ?? mapOf(res, 'data') ?? res);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _post(String path, String label, {String? confirm}) async {
    if (confirm != null) {
      final ok = await confirmAction(context, title: '$label?', message: confirm, confirmLabel: label, destructive: label == 'Stop');
      if (!ok || !mounted) return;
    }
    setState(() => _busy = path);
    String? msg;
    final done = await runAction(context, () async => msg = _map(await _api.postLong(path))['message']?.toString());
    if (!mounted) return;
    setState(() => _busy = null);
    if (done) {
      showToast(context, msg ?? '$label selesai.');
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = _s;
    final running = s?['running'] == true;
    Widget link(IconData icon, String title, String subtitle, VoidCallback onTap) => Padding(
      padding: const EdgeInsets.only(bottom: Gap.sm),
      child: EntityTile(icon: icon, tone: Tone.accent, title: title, subtitle: subtitle, onTap: onTap),
    );
    Widget btn(String path, String label, IconData icon, {String? confirm}) => OutlinedButton.icon(
      onPressed: _busy != null ? null : () => _post(path, label, confirm: confirm),
      icon: _busy == path ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : Icon(icon, size: 18),
      label: Text(label),
    );
    return Scaffold(
      appBar: AppBar(
        title: const Text('FreeRADIUS'),
        actions: [IconButton(icon: const Icon(Icons.refresh_rounded), onPressed: _load)],
      ),
      body: s == null
          ? (_error != null ? ErrorView(message: _error!, onRetry: _load) : const LoadingView())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, listBottomPadding(context)),
                children: [
                  DetailHeader(
                    icon: Icons.security_rounded,
                    tone: running ? Tone.success : Tone.danger,
                    title: running ? 'FreeRADIUS berjalan' : 'FreeRADIUS berhenti',
                    subtitle: s['uptime'] != null ? 'Uptime ${s['uptime']}' : null,
                    status: StatusPill(label: running ? 'Aktif' : 'Mati', tone: running ? Tone.success : Tone.danger),
                  ),
                  DetailSection(
                    title: 'Statistik',
                    rows: [
                      InfoRow('PID', str(s, 'pid')),
                      InfoRow('CPU', s['cpu'] == null ? null : '${s['cpu']}%'),
                      InfoRow('Memori', s['memoryMB'] == null ? str(s, 'memory') : '${s['memoryMB']} MB'),
                      InfoRow('Sesi aktif', str(s, 'activeConnections')),
                      InfoRow('Sesi basi', str(s, 'staleSessions')),
                      InfoRow('Request auth', str(s, 'totalAuthRequests')),
                      InfoRow('Request acct', str(s, 'totalAcctRequests')),
                      InfoRow('Mulai', str(s, 'startTime')),
                    ],
                  ),
                  const SizedBox(height: Gap.md),
                  Wrap(
                    spacing: Gap.sm,
                    runSpacing: Gap.sm,
                    children: [
                      if (!running) btn('/api/freeradius/start', 'Start', Icons.play_arrow_rounded),
                      btn('/api/freeradius/restart', 'Restart', Icons.restart_alt_rounded, confirm: 'Semua autentikasi berhenti beberapa detik.'),
                      if (running) btn('/api/freeradius/stop', 'Stop', Icons.stop_rounded, confirm: 'Pelanggan tidak bisa login sampai dijalankan lagi.'),
                      btn(
                        '/api/freeradius/cleanup-stale',
                        'Bersihkan sesi basi',
                        Icons.cleaning_services_rounded,
                        confirm: 'Sesi radacct yang tidak lagi aktif ditutup.',
                      ),
                    ],
                  ),
                  const SizedBox(height: Gap.xl),
                  link(
                    Icons.description_rounded,
                    'File konfigurasi',
                    'Lihat & ubah file FreeRADIUS',
                    () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const RadiusConfigFilesScreen())),
                  ),
                  link(Icons.key_rounded, 'Radcheck', 'Atribut per user di tabel radcheck', () => CrudListScreen.open(context, radcheckConfig())),
                  link(Icons.fact_check_rounded, 'Log autentikasi', 'Access-Accept / Reject terbaru', () => CrudListScreen.open(context, authLogConfig())),
                  link(Icons.terminal_rounded, 'Log server', 'Baris terakhir radius.log', _logs),
                  link(Icons.science_rounded, 'Radtest', 'Uji login user ke RADIUS', () => radtest(context)),
                  link(
                    Icons.backup_rounded,
                    'Backup konfigurasi',
                    'Backup & pulihkan konfigurasi FreeRADIUS',
                    () => CrudListScreen.open(context, radiusBackupsConfig()),
                  ),
                ],
              ),
            ),
    );
  }

  Future<void> _logs() async {
    dynamic res;
    final ok = await runAction(context, () async => res = await _api.get('/api/freeradius/logs', query: {'lines': 200}));
    if (!ok || !mounted) return;
    final logs = _map(res)['logs'];
    await showResultScreen(
      context,
      title: 'Log FreeRADIUS',
      data: {'logs': logs is List ? logs.join('\n') : '${logs ?? ''}'},
      labels: const {'logs': '200 baris terakhir'},
    );
  }
}

Future<void> radtest(BuildContext context) async {
  Json? out;
  final ok = await openForm(
    context,
    title: 'Radtest',
    submitLabel: 'Uji',
    fields: const [
      FieldSpec('username', 'Username', required: true),
      FieldSpec('password', 'Password', type: FieldType.password, required: true),
      FieldSpec('nasIP', 'NAS IP', initial: '127.0.0.1'),
      FieldSpec('nasPort', 'NAS port', type: FieldType.integer, initial: 0),
      FieldSpec('secret', 'Secret', type: FieldType.password, initial: 'testing123'),
    ],
    onSubmit: (v) async => out = _map(await _api.postLong('/api/freeradius/radtest', data: v)),
  );
  if (ok && out != null && context.mounted) {
    final r = mapOf(out, 'result') ?? out!;
    await showResultScreen(context, title: 'Hasil radtest', data: {...r, 'rawOutput': r['rawOutput']}, scriptKeys: const ['rawOutput']);
  }
}

CrudConfig radcheckConfig() => CrudConfig(
  title: 'Radcheck',
  noun: 'Atribut',
  icon: Icons.key_rounded,
  tone: Tone.accent,
  fetch: (q) => _api.get('/api/freeradius/radcheck', query: {'limit': 300, ...q}),
  listKey: 'data',
  searchParam: 'search',
  searchHint: 'Cari username',
  titleOf: (r) => str(r, 'username') ?? '-',
  subtitleOf: (r) => '${r['attribute'] ?? ''} ${r['op'] ?? ''} ${r['value'] ?? ''}',
  fields: (_) => const [
    FieldSpec('username', 'Username', required: true),
    FieldSpec(
      'attribute',
      'Atribut',
      type: FieldType.select,
      required: true,
      initial: 'Cleartext-Password',
      options: [
        ('Cleartext-Password', 'Cleartext-Password'),
        ('Auth-Type', 'Auth-Type'),
        ('Simultaneous-Use', 'Simultaneous-Use'),
        ('Expiration', 'Expiration'),
        ('Calling-Station-Id', 'Calling-Station-Id'),
        ('NAS-IP-Address', 'NAS-IP-Address'),
      ],
    ),
    FieldSpec('op', 'Operator', type: FieldType.select, required: true, initial: ':=', options: [(':=', ':='), ('==', '=='), ('=', '='), ('+=', '+=')]),
    FieldSpec('value', 'Nilai', required: true),
  ],
  create: CrudRoutes.postTo('/api/freeradius/radcheck'),
  delete: CrudRoutes.deleteWithQueryId('/api/freeradius/radcheck'),
);

CrudConfig authLogConfig() => CrudConfig(
  title: 'Log Autentikasi',
  noun: 'Log',
  icon: Icons.fact_check_rounded,
  fetch: (q) => _api.get('/api/freeradius/auth-log', query: {'limit': 200, ...q}),
  listKey: 'entries',
  searchParam: 'search',
  searchHint: 'Cari username',
  filters: const [('all', 'Semua'), ('accept', 'Diterima'), ('reject', 'Ditolak')],
  filterParam: 'reply',
  titleOf: (e) => str(e, 'username') ?? '-',
  subtitleOf: (e) => formatDateTimeOrNull(dateOf(e, 'authdate')),
  toneOf: (e) => '${e['reply']}'.contains('Accept') ? Tone.success : Tone.danger,
  statusOf: (e) =>
      StatusPill(label: '${e['reply']}'.contains('Accept') ? 'Diterima' : 'Ditolak', tone: '${e['reply']}'.contains('Accept') ? Tone.success : Tone.danger),
  sectionsOf: (context, e) => [
    DetailSection(
      rows: [
        InfoRow('Username', str(e, 'username'), copyable: true),
        InfoRow('Balasan', str(e, 'reply')),
        InfoRow('Waktu', formatDateTimeOrNull(dateOf(e, 'authdate'))),
      ],
    ),
  ],
);

/// FreeRADIUS config files: pick a file, edit, save — /admin/freeradius/config.
class RadiusConfigFilesScreen extends StatefulWidget {
  const RadiusConfigFilesScreen({super.key});

  @override
  State<RadiusConfigFilesScreen> createState() => _RadiusConfigFilesScreenState();
}

class _RadiusConfigFilesScreenState extends State<RadiusConfigFilesScreen> {
  List<Json>? _groups;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = _map(await _api.get('/api/freeradius/config/list'));
      if (mounted) setState(() => _groups = extractList(res, listKey: 'groups'));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _open(Json file) async {
    final path = str(file, 'path') ?? str(file, 'name')!;
    String? content;
    final ok = await runAction(
      context,
      () async => content = _map(await _api.post('/api/freeradius/config/read', data: {'filename': path}))['content']?.toString(),
    );
    if (!ok || !mounted) return;
    await openForm(
      context,
      title: str(file, 'name') ?? path,
      fields: const [
        FieldSpec.note('Kesalahan sintaks membuat FreeRADIUS gagal start. Setelah menyimpan, restart dari halaman FreeRADIUS.'),
        FieldSpec('content', 'Isi file', type: FieldType.multiline, required: true),
      ],
      initial: {'content': content ?? ''},
      success: 'File disimpan.',
      onSubmit: (v) => _api.post('/api/freeradius/config/save', data: {'filename': path, 'content': v['content']}),
    );
  }

  @override
  Widget build(BuildContext context) {
    final groups = _groups;
    return Scaffold(
      appBar: AppBar(title: const Text('Konfigurasi FreeRADIUS')),
      body: groups == null
          ? (_error != null ? ErrorView(message: _error!, onRetry: _load) : const LoadingView())
          : ListView(
              padding: EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, listBottomPadding(context)),
              children: [
                for (final g in groups) ...[
                  SectionHeader(str(g, 'name') ?? '-'),
                  for (final f in extractList(g, listKey: 'files'))
                    Padding(
                      padding: const EdgeInsets.only(bottom: Gap.sm),
                      child: EntityTile(
                        icon: f['type'] == 'link' ? Icons.link_rounded : Icons.description_outlined,
                        tone: Tone.neutral,
                        title: str(f, 'name') ?? '-',
                        subtitle: str(f, 'path'),
                        onTap: () => _open(f),
                      ),
                    ),
                  const SizedBox(height: Gap.md),
                ],
              ],
            ),
    );
  }
}

/// Backup konfigurasi FreeRADIUS — /admin/freeradius/backup.
CrudConfig radiusBackupsConfig() => CrudConfig(
  title: 'Backup FreeRADIUS',
  noun: 'Backup',
  icon: Icons.backup_rounded,
  tone: Tone.accent,
  searchable: false,
  fetch: (_) => _api.get('/api/admin/system/freeradius-backup'),
  listKey: 'backups',
  idKey: 'name',
  titleOf: (b) => str(b, 'name') ?? '-',
  subtitleOf: (b) => '${(numOf(b, 'size') / 1024).toStringAsFixed(0)} KB',
  metaOf: (b) => formatDateTimeOrNull(dateOf(b, 'createdAt')),
  createLabel: 'Buat Backup',
  fields: (_) => const [FieldSpec.note('Backup seluruh konfigurasi FreeRADIUS dibuat di server (berjalan di latar belakang).')],
  create: (_) => _api.postLong('/api/admin/system/freeradius-backup'),
  itemActions: [
    CrudAction('Unduh / bagikan', Icons.download_rounded, (ctx, b) async {
      await downloadAndShare(ctx, '/api/admin/system/freeradius-backup/download', str(b, 'name') ?? 'freeradius-backup.tar.gz', query: {'file': b['name']});
      return false;
    }),
    CrudAction('Pulihkan', Icons.settings_backup_restore_rounded, (ctx, b) async {
      final ok = await confirmAction(
        ctx,
        title: 'Pulihkan backup?',
        message: 'Konfigurasi FreeRADIUS saat ini diganti isi ${b['name']}.',
        confirmLabel: 'Pulihkan',
        destructive: true,
      );
      if (!ok || !ctx.mounted) return false;
      dynamic res;
      final done = await runAction(ctx, () async => res = await _api.postLong('/api/admin/system/freeradius-backup/restore', data: {'file': b['name']}));
      if (done && ctx.mounted) await showResultScreen(ctx, title: 'Hasil pemulihan', data: _map(res));
      return done;
    }, kind: ActionKind.danger),
  ],
  toolbar: [
    CrudAction('Unggah file backup', Icons.upload_file_rounded, (ctx, _) async {
      final res = await pickAndUpload(ctx, '/api/admin/system/freeradius-backup/upload', extensions: ['gz', 'tgz', 'tar', 'zip']);
      if (res != null && ctx.mounted) showToast(ctx, 'Diunggah sebagai ${_map(res)['savedAs'] ?? 'backup'}.');
      return res != null;
    }),
    CrudAction('Log backup', Icons.terminal_rounded, (ctx, _) async {
      final res = _map(await _api.get('/api/admin/system/freeradius-backup'));
      if (ctx.mounted) await showResultScreen(ctx, title: 'Log backup', data: {'log': res['log'] ?? ''});
      return false;
    }),
  ],
);
