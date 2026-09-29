import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/crud/crud_list_screen.dart';
import '../../core/crud/lookups.dart';
import '../../core/formatters.dart';
import '../../core/forms/field_spec.dart';
import '../../core/forms/form_screen.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';

final _api = ApiClient.instance;

Widget _activePill(Json i) =>
    i['isActive'] == false ? const StatusPill(label: 'Nonaktif', tone: Tone.neutral) : const StatusPill(label: 'Aktif', tone: Tone.success);

const _templateTitles = {
  'registration-confirmation': 'Konfirmasi pendaftaran',
  'registration-approval': 'Persetujuan pendaftaran',
  'admin-create-user': 'Akun dibuat admin',
  'installation-invoice': 'Invoice pemasangan',
  'invoice-reminder': 'Pengingat tagihan',
  'payment-success': 'Pembayaran berhasil',
  'maintenance-outage': 'Gangguan jaringan',
  'maintenance-resolved': 'Gangguan selesai',
  'voucher-purchase': 'Pembelian voucher',
  'voucher-payment-link': 'Link bayar voucher',
  'manual-extension': 'Perpanjangan manual',
  'manual-payment-approval': 'Pembayaran manual disetujui',
  'manual-payment-rejection': 'Pembayaran manual ditolak',
};

const _variablesHelp =
    'Variabel umum: {{customerName}}, {{username}}, {{phone}}, {{profileName}}, {{invoiceNumber}}, {{amount}}, '
    '{{dueDate}}, {{paymentLink}}, {{expiredDate}}, {{companyName}}, {{companyPhone}}. Daftar lengkap per jenis ada di halaman web.';

/// Provider WhatsApp — mirrors /admin/whatsapp/providers.
CrudConfig whatsappProvidersConfig() => CrudConfig(
  title: 'Provider WhatsApp',
  noun: 'Provider',
  icon: Icons.hub_rounded,
  tone: Tone.success,
  fetch: (_) => _api.get('/api/whatsapp/providers'),
  titleOf: (p) => str(p, 'name') ?? '-',
  subtitleOf: (p) => '${(str(p, 'type') ?? '').toUpperCase()} · ${p['senderNumber'] ?? '-'}',
  metaOf: (p) => 'Prioritas ${p['priority'] ?? 0}${p['description'] != null ? ' · ${p['description']}' : ''}',
  statusOf: _activePill,
  sectionsOf: (context, p) => [
    DetailSection(
      rows: [
        InfoRow('Jenis', (str(p, 'type') ?? '').toUpperCase()),
        InfoRow('API URL', str(p, 'apiUrl'), copyable: true),
        InfoRow('Nomor pengirim', str(p, 'senderNumber'), copyable: true),
        InfoRow('Prioritas', str(p, 'priority')),
        InfoRow('Deskripsi', str(p, 'description')),
        InfoRow('Status', p['isActive'] == false ? 'Nonaktif' : 'Aktif'),
      ],
    ),
  ],
  fields: (p) => [
    const FieldSpec('name', 'Nama', required: true),
    const FieldSpec(
      'type',
      'Jenis gateway',
      type: FieldType.select,
      required: true,
      initial: 'mpwa',
      options: [
        ('mpwa', 'MPWA'),
        ('baileys', 'Baileys (native)'),
        ('waha', 'WAHA'),
        ('gowa', 'GOWA'),
        ('fonnte', 'Fonnte'),
        ('wablas', 'Wablas'),
        ('kirimi', 'Kirimi.id'),
      ],
    ),
    const FieldSpec('apiUrl', 'API URL', type: FieldType.url),
    FieldSpec('apiKey', 'API key / token', type: FieldType.password, omitWhenEmpty: p != null, helper: p != null ? 'Kosongkan jika tidak diganti.' : null),
    const FieldSpec('senderNumber', 'Nomor pengirim', type: FieldType.phone),
    const FieldSpec('priority', 'Prioritas', type: FieldType.integer, initial: 0, helper: 'Angka kecil dipakai lebih dulu; yang lain jadi cadangan.'),
    const FieldSpec('description', 'Deskripsi'),
    const FieldSpec('isActive', 'Aktif', type: FieldType.toggle, initial: true),
  ],
  initialOf: (p) => {...p, 'apiKey': null},
  create: CrudRoutes.postTo('/api/whatsapp/providers'),
  update: CrudRoutes.putById('/api/whatsapp/providers'),
  delete: CrudRoutes.deleteById('/api/whatsapp/providers'),
  itemActions: [
    CrudAction('Cek koneksi', Icons.wifi_find_rounded, (ctx, p) async {
      final res = await _api.get('/api/whatsapp/providers/${p['id']}/status');
      final m = res is Map ? res.cast<String, dynamic>() : <String, dynamic>{};
      if (ctx.mounted) showToast(ctx, m['connected'] == true ? 'Terhubung${m['phone'] != null ? ' sebagai ${m['phone']}' : ''}.' : 'Tidak terhubung.');
      return false;
    }),
    CrudAction('Scan QR', Icons.qr_code_2_rounded, (ctx, p) async {
      await Navigator.of(ctx).push(MaterialPageRoute(builder: (_) => _QrScreen(provider: p)));
      return false;
    }, visible: (p) => const {'mpwa', 'waha', 'gowa', 'baileys'}.contains(p['type'])),
    CommonActions.form(
      'Kirim tes',
      Icons.send_rounded,
      fields: (_) => const [FieldSpec('phone', 'Nomor tujuan', type: FieldType.phone, required: true)],
      submitLabel: 'Kirim',
      submit: (p, v) => _api.post('/api/whatsapp/providers/${p['id']}/test', data: v),
      success: 'Pesan tes dikirim.',
    ),
    CommonActions.confirmPost(
      'Restart sesi',
      Icons.restart_alt_rounded,
      (p) => '/api/whatsapp/providers/${p['id']}/restart',
      confirm: 'Sesi WhatsApp provider ini dimulai ulang.',
    ),
  ],
);

class _QrScreen extends StatefulWidget {
  const _QrScreen({required this.provider});
  final Json provider;

  @override
  State<_QrScreen> createState() => _QrScreenState();
}

class _QrScreenState extends State<_QrScreen> {
  Uint8List? _png;
  String? _message;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// The route answers with a PNG (WAHA/GOWA), or JSON: a base64 QR (MPWA)
  /// or a note that the session is already connected.
  Future<void> _load() async {
    setState(() {
      _loading = true;
      _message = null;
      _png = null;
    });
    try {
      final bytes = Uint8List.fromList(await _api.getBytes('/api/whatsapp/providers/${widget.provider['id']}/qr'));
      final isPng = bytes.length > 4 && bytes[0] == 0x89 && bytes[1] == 0x50;
      if (isPng) {
        _png = bytes;
      } else {
        final json = jsonDecode(utf8.decode(bytes));
        final m = json is Map ? json.cast<String, dynamic>() : <String, dynamic>{};
        final qr = (m['qr'] ?? m['qrcode'] ?? mapOf(m, 'mpwaResponse')?['qrcode'] ?? mapOf(m, 'mpwaResponse')?['qr'])?.toString();
        if (qr != null && qr.contains('base64,')) {
          _png = base64Decode(qr.split('base64,').last);
        } else {
          _message = m['alreadyConnected'] == true
              ? 'Sesi sudah terhubung. Tidak perlu scan.'
              : (str(m, 'message') ?? 'QR belum tersedia. Coba lagi beberapa detik.');
        }
      }
    } on ApiException catch (e) {
      _message = e.message;
    } catch (_) {
      _message = 'Respons QR tidak dikenali.';
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('QR ${widget.provider['name'] ?? ''}'),
        actions: [IconButton(tooltip: 'Muat ulang', icon: const Icon(Icons.refresh_rounded), onPressed: _load)],
      ),
      body: ListView(
        padding: const EdgeInsets.all(Gap.page),
        children: [
          const Text('Buka WhatsApp di ponsel pengirim → Perangkat tertaut → Tautkan perangkat, lalu pindai kode ini.'),
          const SizedBox(height: Gap.lg),
          if (_loading)
            const Padding(
              padding: EdgeInsets.all(Gap.xl),
              child: Center(child: CircularProgressIndicator()),
            ),
          if (_png != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(Gap.lg),
                child: Image.memory(_png!, fit: BoxFit.contain),
              ),
            ),
          if (_message != null) Text(_message!, style: TextStyle(color: context.colors.onSurfaceVariant)),
        ],
      ),
    );
  }
}

/// Template WhatsApp — mirrors /admin/whatsapp/templates (edit only, one
/// template per notification type, like the web).
CrudConfig whatsappTemplatesConfig() => CrudConfig(
  title: 'Template WhatsApp',
  noun: 'Template',
  icon: Icons.text_snippet_rounded,
  tone: Tone.success,
  fetch: (_) => _api.get('/api/whatsapp/templates'),
  listKey: 'data',
  titleOf: (t) => _templateTitles[t['type']] ?? str(t, 'name') ?? '-',
  subtitleOf: (t) => str(t, 'type'),
  metaOf: (t) => (str(t, 'message') ?? '').replaceAll('\n', ' '),
  statusOf: _activePill,
  sectionsOf: (context, t) => [
    DetailSection(rows: [InfoRow('Pesan', str(t, 'message'))]),
  ],
  fields: (_) => const [
    FieldSpec('name', 'Nama', required: true),
    FieldSpec('message', 'Isi pesan', type: FieldType.multiline, required: true, helper: _variablesHelp),
    FieldSpec('isActive', 'Aktif (dikirim otomatis)', type: FieldType.toggle, initial: true),
  ],
  update: (t, v) => _api.put('/api/whatsapp/templates/${t['id']}', data: {...v, 'type': t['type']}),
);

/// Pengingat & OTP — mirrors /admin/whatsapp/notifications.
SettingsFormScreen whatsappReminderSettings() => SettingsFormScreen(
  title: 'Pengingat WhatsApp',
  load: () async {
    final res = await _api.get('/api/whatsapp/reminder-settings');
    final s = res is Map ? (mapOf(res.cast<String, dynamic>(), 'settings') ?? {}) : <String, dynamic>{};
    final days = s['reminderDays'];
    return {...s, 'reminderDays': days is List ? days.join(', ') : (days ?? '-7, -5, -3, 0').toString()};
  },
  fields: (_) => const [
    FieldSpec('enabled', 'Kirim pengingat tagihan otomatis', type: FieldType.toggle),
    FieldSpec(
      'reminderDays',
      'Hari pengingat',
      required: true,
      hint: '-7, -3, 0, 1',
      helper: 'Relatif terhadap jatuh tempo: -3 = tiga hari sebelum, 0 = hari H, 1 = sehari sesudah. Pisahkan dengan koma.',
    ),
    FieldSpec('reminderTime', 'Jam kirim', type: FieldType.time, required: true),
    FieldSpec.section('Pengiriman massal'),
    FieldSpec('batchSize', 'Pesan per gelombang', type: FieldType.integer, min: 1),
    FieldSpec('batchDelay', 'Jeda antar gelombang (detik)', type: FieldType.integer, min: 0),
    FieldSpec('randomize', 'Acak jeda (hindari blokir)', type: FieldType.toggle),
    FieldSpec.section('OTP login pelanggan'),
    FieldSpec('otpEnabled', 'OTP WhatsApp aktif', type: FieldType.toggle),
    FieldSpec('otpExpiry', 'Masa berlaku OTP (menit)', type: FieldType.integer, min: 1),
  ],
  save: (v, _) {
    final days = (v['reminderDays'] as String).split(RegExp(r'[,\s]+')).where((s) => s.isNotEmpty).map((s) => int.tryParse(s)).toList();
    if (days.any((d) => d == null)) throw ApiException('Hari pengingat harus angka dipisah koma.');
    return _api.put('/api/whatsapp/reminder-settings', data: {...v, 'reminderDays': days});
  },
);

/// Kirim WhatsApp — single message and broadcast, mirrors /admin/whatsapp/send.
Future<bool> sendWhatsappSingle(BuildContext context) => openForm(
  context,
  title: 'Kirim Pesan WhatsApp',
  submitLabel: 'Kirim',
  fields: const [
    FieldSpec('phone', 'Nomor tujuan', type: FieldType.phone, required: true, hint: '08xxxxxxxxxx'),
    FieldSpec('message', 'Pesan', type: FieldType.multiline, required: true),
  ],
  success: 'Pesan terkirim.',
  onSubmit: (v) => _api.post('/api/whatsapp/send', data: v),
);

/// Two steps like the web: filter customers, then pick recipients and write
/// the message (optionally from a template).
Future<bool> sendWhatsappBroadcast(BuildContext context) async {
  Json? filters;
  final step1 = await openForm(
    context,
    title: 'Broadcast · Pilih Pelanggan',
    submitLabel: 'Lanjut',
    fields: [
      const FieldSpec(
        'status',
        'Status',
        type: FieldType.select,
        options: [('active', 'Aktif'), ('isolated', 'Terisolir'), ('blocked', 'Diblokir'), ('stop', 'Stop')],
      ),
      FieldSpec('profileId', 'Paket', type: FieldType.select, loadOptions: Lookups.pppoeProfiles),
      FieldSpec('routerId', 'Router', type: FieldType.select, loadOptions: Lookups.routers),
      const FieldSpec('address', 'Alamat mengandung'),
    ],
    onSubmit: (v) async => filters = v,
  );
  if (!step1 || filters == null || !context.mounted) return false;

  final res = await _api.get(
    '/api/users/list',
    query: {
      for (final e in filters!.entries)
        if (!isBlank(e.value)) e.key: e.value,
    },
  );
  final users = extractList(res, listKey: 'users');
  if (!context.mounted) return false;
  if (users.isEmpty) {
    showToast(context, 'Tidak ada pelanggan yang cocok.');
    return false;
  }
  final templates = <String, String>{};
  return openForm(
    context,
    title: 'Broadcast · ${users.length} pelanggan',
    submitLabel: 'Kirim',
    fields: [
      FieldSpec(
        'userIds',
        'Penerima',
        type: FieldType.multiSelect,
        required: true,
        options: [for (final u in users) ('${u['id']}', '${u['name'] ?? u['username']} · ${u['phone'] ?? '-'}')],
      ),
      FieldSpec(
        'templateId',
        'Pakai template',
        type: FieldType.select,
        loadOptions: () async {
          final r = await _api.get('/api/whatsapp/templates');
          final list = extractList(r, listKey: 'data');
          for (final t in list) {
            templates['${t['id']}'] = '${t['message'] ?? ''}';
          }
          return [for (final t in list) ('${t['id']}', _templateTitles[t['type']] ?? '${t['name']}')];
        },
        helper: 'Isi pesan dari template dipakai bila kolom pesan kosong.',
      ),
      const FieldSpec('message', 'Pesan', type: FieldType.multiline, helper: 'Boleh memakai {{customerName}}, {{username}}, {{profileName}}, dll.'),
    ],
    initial: {
      'userIds': [for (final u in users) '${u['id']}'],
    },
    onSubmit: (v) async {
      final message = isBlank(v['message']) ? templates['${v['templateId']}'] : v['message'];
      if (isBlank(message)) throw ApiException('Tulis pesan atau pilih template.');
      final r = await _api.postLong(
        '/api/whatsapp/broadcast',
        data: {'userIds': v['userIds'], 'message': message, 'delay': 2000},
        timeout: const Duration(minutes: 10),
      );
      final m = r is Map ? r.cast<String, dynamic>() : <String, dynamic>{};
      if (context.mounted) showToast(context, 'Terkirim ${m['successCount'] ?? 0}, gagal ${m['failCount'] ?? 0}.');
    },
  );
}

/// Riwayat pengiriman WhatsApp (read-only).
CrudConfig whatsappHistoryConfig() => CrudConfig(
  title: 'Riwayat WhatsApp',
  noun: 'Pesan',
  icon: Icons.history_rounded,
  tone: Tone.success,
  fetch: (q) => _api.get('/api/whatsapp/history', query: {'limit': 200, ...q}),
  listKey: 'data',
  searchParam: 'search',
  searchHint: 'Cari nomor atau isi pesan',
  filters: const [('all', 'Semua'), ('sent', 'Terkirim'), ('failed', 'Gagal')],
  titleOf: (h) => str(h, 'phone') ?? '-',
  subtitleOf: (h) => (str(h, 'message') ?? '').replaceAll('\n', ' '),
  metaOf: (h) => [str(h, 'provider'), formatDateTimeOrNull(dateOf(h, 'sentAt') ?? dateOf(h, 'createdAt'))].whereType<String>().join(' · '),
  toneOf: (h) => h['status'] == 'failed' ? Tone.danger : Tone.success,
  statusOf: (h) => StatusPill(label: h['status'] == 'failed' ? 'Gagal' : 'Terkirim', tone: h['status'] == 'failed' ? Tone.danger : Tone.success),
  sectionsOf: (context, h) => [
    DetailSection(
      rows: [
        InfoRow('Nomor', str(h, 'phone'), copyable: true),
        InfoRow('Provider', str(h, 'provider')),
        InfoRow('Waktu', formatDateTimeOrNull(dateOf(h, 'createdAt') ?? dateOf(h, 'sentAt'))),
        InfoRow('Error', str(h, 'error') ?? str(h, 'errorMessage')),
        InfoRow('Pesan', str(h, 'message')),
      ],
    ),
  ],
);

/// SMTP & email notifications — mirrors /admin/settings/email (settings tab).
SettingsFormScreen emailSettings() => SettingsFormScreen(
  title: 'Pengaturan Email',
  load: () async => ((await _api.get('/api/settings/email')) as Map).cast<String, dynamic>(),
  fields: (_) => const [
    FieldSpec('enabled', 'Kirim email aktif', type: FieldType.toggle),
    FieldSpec.section('Server SMTP'),
    FieldSpec('smtpHost', 'Host SMTP', required: true),
    FieldSpec('smtpPort', 'Port', type: FieldType.integer, required: true),
    FieldSpec('smtpSecure', 'SSL/TLS (port 465)', type: FieldType.toggle),
    FieldSpec('smtpUser', 'Username', required: true),
    FieldSpec('smtpPassword', 'Password / app password', type: FieldType.password, helper: 'Biarkan ******** jika tidak diganti.'),
    FieldSpec('fromEmail', 'Email pengirim', type: FieldType.email, required: true),
    FieldSpec('fromName', 'Nama pengirim'),
    FieldSpec.section('Notifikasi'),
    FieldSpec('notifyNewUser', 'Pelanggan baru', type: FieldType.toggle),
    FieldSpec('notifyInvoice', 'Tagihan baru', type: FieldType.toggle),
    FieldSpec('notifyPayment', 'Pembayaran diterima', type: FieldType.toggle),
    FieldSpec('notifyExpired', 'Masa aktif habis', type: FieldType.toggle),
    FieldSpec('reminderEnabled', 'Pengingat tagihan', type: FieldType.toggle),
    FieldSpec('reminderTime', 'Jam pengingat', type: FieldType.time),
    FieldSpec('reminderDays', 'Hari sebelum jatuh tempo', hint: '7,3,1'),
  ],
  save: (v, _) => _api.post('/api/settings/email', data: v),
  secondary: [
    FormAction('Kirim tes', Icons.forward_to_inbox_rounded, (v) async {
      final res = await _api.post('/api/settings/email/test', data: {'email': v['fromEmail']});
      return res is Map ? res['message']?.toString() ?? 'Email tes dikirim ke ${v['fromEmail']}.' : null;
    }),
  ],
);

CrudConfig emailTemplatesConfig() => CrudConfig(
  title: 'Template Email',
  noun: 'Template',
  icon: Icons.mail_rounded,
  fetch: (_) => _api.get('/api/settings/email/templates'),
  listKey: 'data',
  titleOf: (t) => _templateTitles[t['type']] ?? str(t, 'name') ?? '-',
  subtitleOf: (t) => str(t, 'subject'),
  metaOf: (t) => str(t, 'type'),
  statusOf: _activePill,
  sectionsOf: (context, t) => [
    DetailSection(
      rows: [
        InfoRow('Subjek', str(t, 'subject')),
        InfoRow('Jenis', str(t, 'type')),
        InfoRow('Panjang HTML', '${(t['htmlBody'] as String?)?.length ?? 0} karakter'),
      ],
    ),
  ],
  fields: (t) => [
    const FieldSpec('name', 'Nama', required: true),
    FieldSpec(
      'type',
      'Jenis',
      type: FieldType.select,
      required: true,
      readOnly: t != null,
      options: [for (final e in _templateTitles.entries) (e.key, e.value)],
    ),
    const FieldSpec('subject', 'Subjek', required: true),
    const FieldSpec('htmlBody', 'Isi (HTML)', type: FieldType.multiline, required: true, helper: _variablesHelp),
    const FieldSpec('isActive', 'Aktif', type: FieldType.toggle, initial: true),
  ],
  create: CrudRoutes.postTo('/api/settings/email/templates'),
  update: CrudRoutes.putById('/api/settings/email/templates'),
  delete: CrudRoutes.deleteById('/api/settings/email/templates'),
);

CrudConfig emailHistoryConfig() => CrudConfig(
  title: 'Riwayat Email',
  noun: 'Email',
  icon: Icons.outbox_rounded,
  fetch: (q) => _api.get('/api/email/history', query: {'limit': 200, ...q}),
  listKey: 'history',
  filters: const [('all', 'Semua'), ('sent', 'Terkirim'), ('failed', 'Gagal')],
  titleOf: (h) => str(h, 'subject') ?? '-',
  subtitleOf: (h) => str(h, 'toEmail') ?? str(h, 'to'),
  metaOf: (h) => formatDateTimeOrNull(dateOf(h, 'sentAt') ?? dateOf(h, 'createdAt')),
  toneOf: (h) => h['status'] == 'failed' ? Tone.danger : Tone.primary,
  statusOf: (h) => StatusPill(label: h['status'] == 'failed' ? 'Gagal' : 'Terkirim', tone: h['status'] == 'failed' ? Tone.danger : Tone.success),
  sectionsOf: (context, h) => [
    DetailSection(
      rows: [
        InfoRow('Kepada', str(h, 'toEmail') ?? str(h, 'to'), copyable: true),
        InfoRow('Subjek', str(h, 'subject')),
        InfoRow('Waktu', formatDateTimeOrNull(dateOf(h, 'sentAt') ?? dateOf(h, 'createdAt'))),
        InfoRow('Error', str(h, 'error')),
      ],
    ),
  ],
);

/// Telegram backup & health reports — mirrors /admin/settings/telegram.
SettingsFormScreen telegramSettings() => SettingsFormScreen(
  title: 'Telegram Backup',
  load: () async => ((await _api.get('/api/telegram/settings')) as Map).cast<String, dynamic>(),
  fields: (_) => const [
    FieldSpec('enabled', 'Kirim backup otomatis', type: FieldType.toggle),
    FieldSpec('botToken', 'Bot token', type: FieldType.password),
    FieldSpec('chatId', 'Chat ID grup', hint: '-100xxxxxxxxxx'),
    FieldSpec('backupTopicId', 'Topic ID backup'),
    FieldSpec('healthTopicId', 'Topic ID laporan kesehatan'),
    FieldSpec(
      'schedule',
      'Jadwal',
      type: FieldType.select,
      options: [('daily', 'Harian'), ('12h', 'Tiap 12 jam'), ('6h', 'Tiap 6 jam'), ('weekly', 'Mingguan')],
    ),
    FieldSpec('scheduleTime', 'Jam backup', type: FieldType.time),
    FieldSpec('keepLastN', 'Simpan N backup terakhir', type: FieldType.integer, min: 1),
  ],
  save: (v, _) => _api.post('/api/telegram/settings', data: v),
  secondary: [
    FormAction('Tes', Icons.send_rounded, (v) async {
      final res = await _api.post('/api/telegram/test', data: v);
      return res is Map ? res['message']?.toString() : null;
    }),
    FormAction('Tes backup', Icons.backup_rounded, (_) async {
      final res = await _api.postLong('/api/telegram/test-backup');
      return res is Map ? res['message']?.toString() : null;
    }),
  ],
);

/// Telegram bot commands (/cek, /redaman) — mirrors /admin/settings/telegram-bot.
SettingsFormScreen telegramBotSettings() => SettingsFormScreen(
  title: 'Bot Telegram',
  load: () async => ((await _api.get('/api/telegram/bot-settings')) as Map).cast<String, dynamic>(),
  header: (context, s) => Card(
    child: Padding(
      padding: const EdgeInsets.all(Gap.lg),
      child: LabeledFigure(
        label: 'Webhook',
        value: str(mapOf(s, 'webhook'), 'url') ?? (s['webhook'] is String ? s['webhook'] as String : 'Belum dipasang'),
        valueSize: 13,
      ),
    ),
  ),
  fields: (_) => const [
    FieldSpec('enabled', 'Bot aktif', type: FieldType.toggle),
    FieldSpec('botToken', 'Bot token', type: FieldType.password),
    FieldSpec('allowedChatIds', 'Chat ID yang diizinkan', hint: '12345, -1009876', helper: 'Pisahkan dengan koma. Kosong = semua chat.'),
    FieldSpec('enableStart', 'Perintah /start', type: FieldType.toggle),
    FieldSpec('enableCekPelanggan', 'Perintah cek pelanggan', type: FieldType.toggle),
    FieldSpec('enableRedaman', 'Perintah cek redaman', type: FieldType.toggle),
  ],
  save: (v, _) => _api.post('/api/telegram/bot-settings', data: v),
  secondary: [
    FormAction('Pasang webhook', Icons.link_rounded, (_) async {
      final res = await _api.put('/api/telegram/bot-settings', data: {'action': 'set'});
      return res is Map ? res['message']?.toString() : null;
    }),
    FormAction('Lepas webhook', Icons.link_off_rounded, (_) async {
      final res = await _api.put('/api/telegram/bot-settings', data: {'action': 'unset'});
      return res is Map ? res['message']?.toString() : null;
    }),
  ],
);
