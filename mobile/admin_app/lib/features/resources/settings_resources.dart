import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

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
import '../../core/widgets/state_views.dart';

final _api = ApiClient.instance;

Json _map(dynamic res) => res is Map ? res.cast<String, dynamic>() : <String, dynamic>{};
String? _msg(dynamic res) => res is Map ? (res['message'] ?? res['msg'])?.toString() : null;

Future<String> Function(XFile) _uploadTo(String path) => (file) async {
  final res = await _api.upload(path, file.path, filename: file.name);
  final url = res is Map ? res['url']?.toString() : null;
  if (url == null) throw ApiException(_map(res)['error']?.toString() ?? 'Upload gagal');
  return url;
};

const timezones = [
  ('Asia/Jakarta', 'WIB · Jakarta (UTC+7)'),
  ('Asia/Makassar', 'WITA · Makassar (UTC+8)'),
  ('Asia/Jayapura', 'WIT · Jayapura (UTC+9)'),
  ('Asia/Singapore', 'Singapore (UTC+8)'),
  ('Asia/Kuala_Lumpur', 'Malaysia (UTC+8)'),
  ('Asia/Bangkok', 'Thailand (UTC+7)'),
  ('Asia/Manila', 'Philippines (UTC+8)'),
  ('Asia/Ho_Chi_Minh', 'Vietnam (UTC+7)'),
  ('Asia/Dubai', 'UAE (UTC+4)'),
  ('Asia/Riyadh', 'Saudi Arabia (UTC+3)'),
  ('Asia/Tokyo', 'Japan (UTC+9)'),
  ('Asia/Seoul', 'South Korea (UTC+9)'),
  ('Asia/Hong_Kong', 'Hong Kong (UTC+8)'),
  ('Australia/Sydney', 'Australia Sydney'),
];

Future<Json> _company() async => _map(await _api.get('/api/company'));

/// Profil perusahaan — /admin/settings/company.
SettingsFormScreen companySettings() => SettingsFormScreen(
  title: 'Profil Perusahaan',
  load: _company,
  fields: (_) => [
    FieldSpec('logo', 'Logo', type: FieldType.image, uploader: _uploadTo('/api/upload/logo')),
    const FieldSpec('name', 'Nama perusahaan', required: true),
    const FieldSpec('email', 'Email', type: FieldType.email),
    const FieldSpec('phone', 'Telepon / WhatsApp CS', type: FieldType.phone),
    const FieldSpec('adminPhone', 'Telepon admin (notifikasi)', type: FieldType.phone),
    const FieldSpec('address', 'Alamat', type: FieldType.multiline),
    const FieldSpec('baseUrl', 'URL aplikasi', type: FieldType.url, helper: 'Dipakai di link bayar & notifikasi. Contoh: https://billing.domain.id'),
    const FieldSpec('timezone', 'Zona waktu', type: FieldType.select, options: timezones, helper: 'Mengubah zona waktu perlu restart layanan.'),
    const FieldSpec('poweredBy', 'Teks "powered by"'),
    const FieldSpec('customerIdPrefix', 'Awalan ID pelanggan', hint: 'SLF', helper: 'Huruf besar/angka, maks. 8 karakter.'),
    const FieldSpec(
      'invoiceGenerateDays',
      'Buat tagihan H- (hari)',
      type: FieldType.integer,
      min: 1,
      max: 28,
      helper: 'Tagihan dibuat sekian hari sebelum jatuh tempo.',
    ),
  ],
  save: (v, current) {
    final prefix = (v['customerIdPrefix'] as String? ?? '').toUpperCase().replaceAll(RegExp(r'[^A-Z0-9\-]'), '');
    return _api.post('/api/company', data: {...current, ...v, 'customerIdPrefix': prefix.length > 8 ? prefix.substring(0, 8) : prefix});
  },
  secondary: [
    FormAction('Restart layanan', Icons.restart_alt_rounded, (_) async {
      final res = _map(await _api.postLong('/api/settings/restart-services', data: {'services': 'all', 'delay': 2000}));
      return res['success'] == true
          ? (res['autoRestarted'] == true ? 'Layanan sedang dimulai ulang. Buka ulang aplikasi sebentar lagi.' : (str(res, 'message') ?? 'Diterapkan.'))
          : 'Restart otomatis tidak tersedia: ${res['message'] ?? ''} Jalankan pm2 restart all di server.';
    }),
  ],
);

/// Footer tiap portal — /admin/settings/footer.
SettingsFormScreen footerSettings() => SettingsFormScreen(
  title: 'Footer Portal',
  load: _company,
  fields: (_) => const [
    FieldSpec('footerAdmin', 'Footer panel admin'),
    FieldSpec('footerCustomer', 'Footer portal pelanggan'),
    FieldSpec('footerTechnician', 'Footer aplikasi teknisi'),
    FieldSpec('footerAgent', 'Footer portal agent'),
    FieldSpec('footerCollector', 'Footer aplikasi kolektor'),
  ],
  save: (v, current) => _api.post('/api/company', data: {...current, ...v}),
);

/// Rekening bank untuk transfer manual — /admin/payment/bank-accounts. The
/// accounts live as a JSON array on the company row.
CrudConfig bankAccountsConfig() {
  Future<void> write(List<Json> accounts) async {
    final c = await _company();
    await _api.post('/api/company', data: {...c, 'bankAccounts': accounts});
  }

  Future<List<Json>> current() async => extractList(await _company(), listKey: 'bankAccounts');

  return CrudConfig(
    title: 'Rekening Bank',
    noun: 'Rekening',
    icon: Icons.account_balance_rounded,
    tone: Tone.success,
    searchable: false,
    fetch: (_) => _company(),
    parse: (res) {
      final list = extractList(res, listKey: 'bankAccounts');
      return [
        for (var i = 0; i < list.length; i++) {...list[i], '_i': i},
      ];
    },
    idKey: '_i',
    titleOf: (b) => str(b, 'bankName') ?? '-',
    subtitleOf: (b) => str(b, 'accountNumber'),
    metaOf: (b) => 'a.n. ${b['accountName'] ?? '-'}',
    fields: (_) => const [
      FieldSpec('bankName', 'Nama bank', required: true, hint: 'BCA'),
      FieldSpec('accountNumber', 'Nomor rekening', type: FieldType.phone, required: true),
      FieldSpec('accountName', 'Atas nama', required: true),
    ],
    create: (v) async => write([...await current(), v]),
    update: (b, v) async {
      final list = await current();
      list[b['_i'] as int] = v;
      await write(list);
    },
    delete: (b) async {
      final list = await current()
        ..removeAt(b['_i'] as int);
      await write(list);
    },
  );
}

/// Payment gateway hub — /admin/payment-gateway.
class PaymentGatewayScreen extends StatelessWidget {
  const PaymentGatewayScreen({super.key});

  static const _gateways = [
    ('midtrans', 'Midtrans', [('midtransClientKey', 'Client key', true), ('midtransServerKey', 'Server key', true)]),
    ('xendit', 'Xendit', [('xenditApiKey', 'API key', true), ('xenditWebhookToken', 'Webhook token', false)]),
    ('duitku', 'Duitku', [('duitkuMerchantCode', 'Merchant code', true), ('duitkuApiKey', 'API key', true)]),
    ('tripay', 'Tripay', [('tripayMerchantCode', 'Merchant code', true), ('tripayApiKey', 'API key', true), ('tripayPrivateKey', 'Private key', true)]),
  ];

  SettingsFormScreen _gateway(String provider, String label, List<(String, String, bool)> keys) => SettingsFormScreen(
    title: label,
    load: () async {
      final list = extractList(await _api.get('/api/payment-gateway/config'));
      final row = list.firstWhere((g) => g['provider'] == provider, orElse: () => {});
      return {...row, 'environment': row['${provider}Environment'] ?? 'sandbox', 'isActive': row['isActive'] == true};
    },
    fields: (_) => [
      const FieldSpec('isActive', 'Aktifkan gateway ini', type: FieldType.toggle),
      const FieldSpec(
        'environment',
        'Mode',
        type: FieldType.select,
        required: true,
        options: [('sandbox', 'Sandbox (uji coba)'), ('production', 'Production')],
      ),
      for (final (key, label, required) in keys) FieldSpec(key, label, type: key.endsWith('Code') ? FieldType.text : FieldType.password, required: required),
    ],
    save: (v, _) => _api.post(
      '/api/payment-gateway/config',
      data: {'provider': provider, for (final (key, _, _) in keys) key: v[key], '${provider}Environment': v['environment'], 'isActive': v['isActive']},
    ),
  );

  @override
  Widget build(BuildContext context) {
    Widget tile(IconData icon, String title, String subtitle, VoidCallback onTap) => Padding(
      padding: const EdgeInsets.only(bottom: Gap.sm),
      child: EntityTile(icon: icon, tone: Tone.success, title: title, subtitle: subtitle, onTap: onTap),
    );
    return Scaffold(
      appBar: AppBar(title: const Text('Payment Gateway')),
      body: ListView(
        padding: EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, listBottomPadding(context)),
        children: [
          for (final (provider, label, keys) in _gateways)
            tile(Icons.credit_card_rounded, label, 'Kunci API dan mode', () => SettingsFormScreen.open(context, _gateway(provider, label, keys))),
          tile(
            Icons.qr_code_rounded,
            'QRIS Mandiri (statis)',
            'QRIS milik sendiri + aplikasi pendengar notifikasi',
            () => SettingsFormScreen.open(context, qrisSettings()),
          ),
          tile(Icons.receipt_long_rounded, 'Log webhook', 'Callback pembayaran yang masuk', () => CrudListScreen.open(context, webhookLogsConfig())),
          tile(Icons.account_balance_rounded, 'Rekening bank', 'Tujuan transfer manual', () => CrudListScreen.open(context, bankAccountsConfig())),
        ],
      ),
    );
  }
}

SettingsFormScreen qrisSettings() => SettingsFormScreen(
  title: 'QRIS Mandiri',
  load: () async => _map(await _api.get('/api/payment-gateway/qris-mandiri')),
  fields: (_) => const [
    FieldSpec('qrisEnabled', 'QRIS aktif', type: FieldType.toggle),
    FieldSpec('qrisMerchantName', 'Nama merchant'),
    FieldSpec('qrisStaticCode', 'Kode QRIS statis', type: FieldType.multiline, helper: 'String QRIS hasil scan dari QR merchant Anda.'),
    FieldSpec('qrisUniqueMin', 'Kode unik minimum', type: FieldType.integer, min: 0),
    FieldSpec('qrisUniqueMax', 'Kode unik maksimum', type: FieldType.integer, min: 1),
    FieldSpec.section('Aplikasi pendengar'),
    FieldSpec('qrisDeviceKey', 'Device key'),
    FieldSpec('qrisDeviceSecret', 'Device secret', type: FieldType.password),
    FieldSpec('generateSecret', 'Buat secret baru saat simpan', type: FieldType.toggle),
  ],
  save: (v, _) => _api.post('/api/payment-gateway/qris-mandiri', data: v),
  secondary: [
    FormAction('Tes', Icons.science_rounded, (_) async => _msg(await _api.post('/api/payment/qris-test', data: {'sourceApp': 'admin_app'}))),
  ],
);

CrudConfig webhookLogsConfig() => CrudConfig(
  title: 'Log Webhook',
  noun: 'Log',
  icon: Icons.receipt_long_rounded,
  fetch: (q) => _api.get('/api/payment-gateway/webhook-logs', query: {'limit': 100, ...q}),
  listKey: 'logs',
  searchParam: 'orderId',
  searchHint: 'Cari order ID',
  filters: const [('all', 'Semua'), ('true', 'Berhasil'), ('false', 'Gagal')],
  filterParam: 'success',
  titleOf: (l) => str(l, 'orderId') ?? '-',
  subtitleOf: (l) => [str(l, 'gateway'), str(l, 'status')].whereType<String>().join(' · '),
  metaOf: (l) => formatDateTimeOrNull(dateOf(l, 'createdAt')),
  toneOf: (l) => l['success'] == true ? Tone.success : Tone.danger,
  statusOf: (l) => StatusPill(label: l['success'] == true ? 'OK' : 'Gagal', tone: l['success'] == true ? Tone.success : Tone.danger),
  sectionsOf: (context, l) => [
    DetailSection(
      rows: [
        InfoRow('Gateway', str(l, 'gateway')),
        InfoRow('Order ID', str(l, 'orderId'), copyable: true),
        InfoRow('Status', str(l, 'status')),
        InfoRow('Jumlah', l['amount'] == null ? null : formatCurrency(numOf(l, 'amount'))),
        InfoRow('Error', str(l, 'errorMessage') ?? str(l, 'error')),
        InfoRow('Payload', str(l, 'payload'), copyable: true),
      ],
    ),
  ],
);

/// Isolir — /admin/settings/isolation.
SettingsFormScreen isolationSettings() => SettingsFormScreen(
  title: 'Pengaturan Isolir',
  load: () async => mapOf(_map(await _api.get('/api/settings/isolation')), 'data') ?? {},
  fields: (_) => const [
    FieldSpec('isolationEnabled', 'Isolir otomatis aktif', type: FieldType.toggle),
    FieldSpec('gracePeriodDays', 'Masa tenggang (hari)', type: FieldType.integer, min: 0, helper: 'Hari setelah jatuh tempo sebelum diisolir.'),
    FieldSpec.section('Jaringan isolir'),
    FieldSpec('isolationIpPool', 'IP pool isolir', hint: '192.168.200.0/24'),
    FieldSpec('isolationServerIp', 'IP server billing'),
    FieldSpec('isolationRateLimit', 'Rate limit isolir', hint: '64k/64k'),
    FieldSpec('isolationRedirectUrl', 'URL halaman isolir', type: FieldType.url),
    FieldSpec('isolationAllowDns', 'Izinkan DNS', type: FieldType.toggle),
    FieldSpec('isolationAllowPayment', 'Izinkan akses halaman bayar', type: FieldType.toggle),
    FieldSpec.section('Pemberitahuan'),
    FieldSpec('isolationMessage', 'Pesan isolir', type: FieldType.multiline),
    FieldSpec('isolationNotifyWhatsapp', 'Kirim WhatsApp saat diisolir', type: FieldType.toggle),
    FieldSpec('isolationNotifyEmail', 'Kirim email saat diisolir', type: FieldType.toggle),
  ],
  save: (v, _) => _api.put('/api/settings/isolation', data: v),
  secondary: [
    FormAction('Script MikroTik', Icons.code_rounded, (v) async {
      final res = _map(
        await _api.get(
          '/api/admin/settings/isolation/mikrotik-script',
          query: {
            if (!isBlank(v['isolationServerIp'])) 'billingIp': v['isolationServerIp'],
            if (!isBlank(v['isolationIpPool'])) 'isolationIp': v['isolationIpPool'],
          },
        ),
      );
      final script = str(res, 'script');
      if (script == null) return 'Script tidak tersedia.';
      await Clipboard.setData(ClipboardData(text: script));
      await Share.share(script, subject: 'Script isolir MikroTik');
      return 'Script disalin — tempel di terminal MikroTik.';
    }),
  ],
);

CrudConfig isolationTemplatesConfig() => CrudConfig(
  title: 'Template Isolir',
  noun: 'Template',
  icon: Icons.text_snippet_rounded,
  tone: Tone.warning,
  fetch: (_) => _api.get('/api/settings/isolation/templates'),
  listKey: 'data',
  titleOf: (t) => str(t, 'name') ?? '-',
  subtitleOf: (t) => const {'whatsapp': 'WhatsApp', 'email': 'Email', 'html_page': 'Halaman isolir (HTML)'}[t['type']] ?? str(t, 'type'),
  metaOf: (t) => str(t, 'subject'),
  statusOf: (t) => t['isActive'] == false ? const StatusPill(label: 'Nonaktif', tone: Tone.neutral) : const StatusPill(label: 'Aktif', tone: Tone.success),
  sectionsOf: (context, t) => [
    DetailSection(rows: [InfoRow('Subjek', str(t, 'subject')), InfoRow('Isi', str(t, 'message'))]),
  ],
  fields: (t) => [
    const FieldSpec('name', 'Nama', required: true),
    FieldSpec(
      'type',
      'Jenis',
      type: FieldType.select,
      required: true,
      readOnly: t != null,
      initial: 'whatsapp',
      options: const [('whatsapp', 'WhatsApp'), ('email', 'Email'), ('html_page', 'Halaman isolir (HTML)')],
    ),
    FieldSpec('subject', 'Subjek email', visibleIf: (v) => v['type'] == 'email'),
    const FieldSpec(
      'message',
      'Isi',
      type: FieldType.multiline,
      required: true,
      helper: 'Variabel: {{customerName}}, {{username}}, {{expiredDate}}, {{paymentLink}}, {{companyName}}, {{companyPhone}}.',
    ),
    const FieldSpec('isActive', 'Aktif', type: FieldType.toggle, initial: true),
  ],
  create: CrudRoutes.postTo('/api/settings/isolation/templates'),
  update: CrudRoutes.putById('/api/settings/isolation/templates'),
  delete: CrudRoutes.deleteById('/api/settings/isolation/templates'),
);

/// Banner promo portal pelanggan — /admin/settings/promo-banner.
CrudConfig promoBannersConfig() => CrudConfig(
  title: 'Banner Promo',
  noun: 'Banner',
  icon: Icons.photo_rounded,
  tone: Tone.violet,
  searchable: false,
  fetch: (_) => _api.get('/api/settings/promo-banners'),
  listKey: 'banners',
  titleOf: (b) => str(b, 'title') ?? 'Banner ${b['order'] ?? ''}',
  subtitleOf: (b) => str(b, 'linkUrl'),
  metaOf: (b) => 'Urutan ${b['order'] ?? 0}',
  statusOf: (b) => b['isActive'] == false ? const StatusPill(label: 'Nonaktif', tone: Tone.neutral) : const StatusPill(label: 'Tampil', tone: Tone.success),
  sectionsOf: (context, b) => [
    ProofImage(source: str(b, 'imageUrl'), baseUrl: ApiClient.instance.baseUrl, title: 'Gambar'),
    DetailSection(rows: [InfoRow('Link', str(b, 'linkUrl'), copyable: true), InfoRow('Urutan', str(b, 'order'))]),
  ],
  fields: (_) => [
    FieldSpec('imageUrl', 'Gambar banner', type: FieldType.image, required: true, uploader: _uploadTo('/api/upload/banner')),
    const FieldSpec('title', 'Judul'),
    const FieldSpec('linkUrl', 'Link saat diketuk', type: FieldType.url),
    const FieldSpec('order', 'Urutan', type: FieldType.integer, initial: 0, min: 0),
    const FieldSpec('isActive', 'Tampilkan', type: FieldType.toggle, initial: true),
  ],
  create: CrudRoutes.postTo('/api/settings/promo-banners'),
  update: CrudRoutes.putWithBodyId('/api/settings/promo-banners'),
  delete: CrudRoutes.deleteWithQueryId('/api/settings/promo-banners'),
);

/// Program referral — /admin/settings/referral.
SettingsFormScreen referralSettings() => SettingsFormScreen(
  title: 'Program Referral',
  load: () async => mapOf(_map(await _api.get('/api/admin/referrals/config')), 'config') ?? {},
  fields: (_) => [
    const FieldSpec('enabled', 'Program referral aktif', type: FieldType.toggle),
    const FieldSpec('rewardAmount', 'Bonus untuk pengajak (Rp)', type: FieldType.integer, min: 0),
    const FieldSpec(
      'rewardType',
      'Bonus diberikan saat',
      type: FieldType.select,
      options: [('FIRST_PAYMENT', 'Pembayaran pertama'), ('REGISTRATION', 'Pendaftaran')],
    ),
    const FieldSpec('rewardBoth', 'Pelanggan baru juga dapat bonus', type: FieldType.toggle),
    FieldSpec('referredAmount', 'Bonus pelanggan baru (Rp)', type: FieldType.integer, min: 0, visibleIf: (v) => v['rewardBoth'] == true),
  ],
  save: (v, _) => _api.put('/api/admin/referrals/config', data: {...v, 'referredAmount': v['referredAmount'] ?? 0}),
);

/// Peta — default map center/zoom and routing (/api/settings/map).
SettingsFormScreen mapSettings() => SettingsFormScreen(
  title: 'Pengaturan Peta',
  load: () async {
    final res = _map(await _api.get('/api/settings/map'));
    return mapOf(res, 'data') ?? mapOf(res, 'settings') ?? res;
  },
  fields: (_) => const [
    FieldSpec('defaultLat', 'Latitude pusat peta', type: FieldType.decimal),
    FieldSpec('defaultLon', 'Longitude pusat peta', type: FieldType.decimal),
    FieldSpec('defaultZoom', 'Zoom awal', type: FieldType.integer, min: 1, max: 20),
    FieldSpec(
      'mapTheme',
      'Tema peta',
      type: FieldType.select,
      options: [('street', 'Jalan'), ('satellite', 'Satelit'), ('topo', 'Topografi'), ('dark', 'Gelap')],
    ),
    FieldSpec('followRoad', 'Kabel mengikuti jalan', type: FieldType.toggle),
    FieldSpec('osrmApiUrl', 'OSRM API URL', type: FieldType.url),
  ],
  save: (v, _) => _api.put('/api/settings/map', data: v),
);

/// 2FA akun sendiri — /admin/settings/security.
class TwoFactorSettingsScreen extends StatefulWidget {
  const TwoFactorSettingsScreen({super.key});

  @override
  State<TwoFactorSettingsScreen> createState() => _TwoFactorSettingsScreenState();
}

class _TwoFactorSettingsScreenState extends State<TwoFactorSettingsScreen> {
  bool? _enabled;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = _map(await _api.get('/api/admin/profile/2fa'));
      if (mounted) setState(() => _enabled = res['enabled'] == true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _enable() async {
    Json setup;
    try {
      setup = _map(await _api.get('/api/admin/profile/2fa', query: {'action': 'setup'}));
    } on ApiException catch (e) {
      if (mounted) showToast(context, e.message);
      return;
    }
    if (!mounted) return;
    final secret = str(setup, 'secret') ?? '';
    final url = str(setup, 'otpauthUrl');
    final proceed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Tambahkan ke Authenticator'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Tambahkan akun di Google Authenticator / Authy dengan kunci ini, atau buka langsung di aplikasinya.'),
            const SizedBox(height: Gap.md),
            SelectableText(
              secret,
              style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700, fontSize: 15),
            ),
            TextButton.icon(
              onPressed: () => Clipboard.setData(ClipboardData(text: secret)),
              icon: const Icon(Icons.copy_rounded, size: 16),
              label: const Text('Salin kunci'),
            ),
            if (url != null)
              TextButton.icon(
                onPressed: () => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication),
                icon: const Icon(Icons.open_in_new_rounded, size: 16),
                label: const Text('Buka di aplikasi authenticator'),
              ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Lanjut')),
        ],
      ),
    );
    if (proceed != true || !mounted) return;
    final ok = await openForm(
      context,
      title: 'Aktifkan 2FA',
      submitLabel: 'Aktifkan',
      fields: const [
        FieldSpec.note('Masukkan kode 6 digit yang tampil di aplikasi authenticator.'),
        FieldSpec('code', 'Kode 6 digit', type: FieldType.phone, required: true),
      ],
      onSubmit: (v) => _api.post('/api/admin/profile/2fa', data: {'secret': secret, 'code': '${v['code']}'.trim()}),
      success: '2FA aktif. Login berikutnya meminta kode.',
    );
    if (ok) _load();
  }

  Future<void> _disable() async {
    final ok = await openForm(
      context,
      title: 'Matikan 2FA',
      submitLabel: 'Matikan',
      fields: const [
        FieldSpec('password', 'Password akun', type: FieldType.password, required: true),
        FieldSpec('code', 'Kode authenticator', type: FieldType.phone, required: true),
      ],
      onSubmit: (v) => _api.delete('/api/admin/profile/2fa', data: {'password': v['password'], 'code': '${v['code']}'.trim()}),
      success: '2FA dimatikan.',
    );
    if (ok) _load();
  }

  @override
  Widget build(BuildContext context) {
    final on = _enabled;
    return Scaffold(
      appBar: AppBar(title: const Text('Keamanan Akun')),
      bottomNavigationBar: on == null
          ? null
          : ActionBar(
              actions: [
                on
                    ? ActionSpec('Matikan 2FA', Icons.lock_open_rounded, _disable, kind: ActionKind.danger)
                    : ActionSpec('Aktifkan 2FA', Icons.lock_rounded, _enable),
              ],
            ),
      body: on == null
          ? (_error != null ? ErrorView(message: _error!, onRetry: _load) : const LoadingView())
          : ListView(
              padding: const EdgeInsets.all(Gap.page),
              children: [
                DetailHeader(
                  icon: on ? Icons.verified_user_rounded : Icons.gpp_maybe_rounded,
                  tone: on ? Tone.success : Tone.warning,
                  title: 'Verifikasi dua langkah',
                  subtitle: on
                      ? 'Aktif — login butuh kode dari aplikasi authenticator.'
                      : 'Belum aktif. Aktifkan agar akun tidak bisa dipakai hanya dengan password.',
                  status: StatusPill(label: on ? 'Aktif' : 'Nonaktif', tone: on ? Tone.success : Tone.warning),
                ),
              ],
            ),
    );
  }
}

/// Jadwal cron — /admin/settings/cron.
CrudConfig cronConfig() => CrudConfig(
  title: 'Jadwal Otomatis (Cron)',
  noun: 'Jadwal',
  icon: Icons.schedule_rounded,
  tone: Tone.accent,
  fetch: (_) => _api.get('/api/cron/schedules'),
  listKey: 'schedules',
  idKey: 'jobType',
  titleOf: (j) => str(j, 'name') ?? str(j, 'jobType') ?? '-',
  subtitleOf: (j) => '${j['schedule']}${j['hasOverride'] == true ? ' (diubah)' : ''}',
  metaOf: (j) => str(j, 'description'),
  statusOf: (j) => j['enabled'] == false ? const StatusPill(label: 'Mati', tone: Tone.neutral) : const StatusPill(label: 'Aktif', tone: Tone.success),
  sectionsOf: (context, j) => [
    DetailSection(
      rows: [
        InfoRow('Kode', str(j, 'jobType'), copyable: true),
        InfoRow('Jadwal', str(j, 'schedule')),
        InfoRow('Bawaan', '${j['defaultSchedule']} · ${j['defaultScheduleLabel']}'),
        InfoRow('Diubah', formatDateTimeOrNull(dateOf(j, 'updatedAt'))),
        InfoRow('Deskripsi', str(j, 'description')),
      ],
    ),
  ],
  fields: (_) => const [
    FieldSpec(
      'schedule',
      'Ekspresi cron',
      required: true,
      hint: '*/5 * * * *',
      helper: 'menit jam tanggal bulan hari. Perlu restart cron runner agar berlaku.',
    ),
    FieldSpec('enabled', 'Aktif', type: FieldType.toggle, initial: true),
  ],
  update: (j, v) => _api.put('/api/cron/schedules', data: {'jobType': j['jobType'], ...v}),
  itemActions: [
    CommonActions.confirmPost(
      'Jalankan sekarang',
      Icons.play_arrow_rounded,
      (_) => '/api/cron',
      body: (j) => {'type': j['jobType']},
      long: true,
      confirm: 'Job dijalankan sekarang (khusus Super Admin).',
    ),
    CrudAction('Kembalikan ke bawaan', Icons.settings_backup_restore_rounded, (ctx, j) async {
      final ok = await confirmAction(ctx, title: 'Kembalikan jadwal?', message: 'Jadwal kembali ke ${j['defaultSchedule']}.', confirmLabel: 'Kembalikan');
      if (!ok || !ctx.mounted) return false;
      return runAction(ctx, () => _api.delete('/api/cron/schedules', query: {'jobType': j['jobType']}), success: 'Jadwal dikembalikan.');
    }, visible: (j) => j['hasOverride'] == true),
  ],
  toolbar: [
    CrudAction('Riwayat eksekusi', Icons.history_rounded, (ctx, _) async {
      await CrudListScreen.open(ctx, cronHistoryConfig());
      return false;
    }),
  ],
);

CrudConfig cronHistoryConfig() => CrudConfig(
  title: 'Riwayat Cron',
  noun: 'Eksekusi',
  icon: Icons.history_rounded,
  fetch: (_) => _api.get('/api/cron'),
  listKey: 'history',
  titleOf: (h) => str(h, 'jobType') ?? '-',
  subtitleOf: (h) => formatDateTimeOrNull(dateOf(h, 'startedAt')),
  metaOf: (h) => str(h, 'error') ?? str(h, 'result'),
  toneOf: (h) => h['status'] == 'error' ? Tone.danger : (h['status'] == 'running' ? Tone.warning : Tone.success),
  statusOf: (h) =>
      StatusPill(label: str(h, 'status') ?? '-', tone: h['status'] == 'error' ? Tone.danger : (h['status'] == 'running' ? Tone.warning : Tone.success)),
  sectionsOf: (context, h) => [
    DetailSection(
      rows: [
        InfoRow('Job', str(h, 'jobType')),
        InfoRow('Mulai', formatDateTimeOrNull(dateOf(h, 'startedAt'))),
        InfoRow('Selesai', formatDateTimeOrNull(dateOf(h, 'completedAt'))),
        InfoRow('Durasi', h['duration'] == null ? null : '${h['duration']} ms'),
        InfoRow('Hasil', str(h, 'result')),
        InfoRow('Error', str(h, 'error')),
      ],
    ),
  ],
);

/// Backup database — /admin/settings/database.
CrudConfig databaseBackupsConfig() {
  String size(num b) => b >= 1 << 20 ? '${(b / (1 << 20)).toStringAsFixed(1)} MB' : '${(b / 1024).round()} KB';
  return CrudConfig(
    title: 'Backup Database',
    noun: 'Backup',
    icon: Icons.backup_rounded,
    tone: Tone.accent,
    searchable: false,
    fetch: (_) => _api.get('/api/backup'),
    listKey: 'backups',
    titleOf: (b) => str(b, 'filename') ?? '-',
    subtitleOf: (b) => '${size(numOf(b, 'filesize'))} · ${str(b, 'type') ?? 'manual'}',
    metaOf: (b) => formatDateTimeOrNull(dateOf(b, 'createdAt')),
    statusOf: (b) => b['status'] == null ? null : StatusPill.status(str(b, 'status')!),
    createLabel: 'Buat Backup',
    fields: (_) => const [FieldSpec.note('Backup lengkap database dibuat sekarang di server. Bisa beberapa menit untuk data besar.')],
    create: (_) => _api.postLong('/api/backup/create'),
    delete: CrudRoutes.deleteById('/api/backup/delete'),
    itemActions: [
      CrudAction('Unduh / bagikan', Icons.download_rounded, (ctx, b) async {
        await downloadAndShare(ctx, '/api/backup/download/${b['id']}', str(b, 'filename') ?? 'backup.sql');
        return false;
      }),
      CommonActions.confirmPost('Kirim ke Telegram', Icons.send_rounded, (_) => '/api/telegram/send-backup', body: (b) => {'backupId': b['id']}, long: true),
    ],
    toolbar: [
      CrudAction('Pulihkan dari file', Icons.settings_backup_restore_rounded, (ctx, _) async {
        final ok = await confirmAction(
          ctx,
          title: 'Pulihkan Database?',
          message: 'SELURUH data saat ini diganti isi file backup. Tidak bisa dibatalkan.',
          confirmLabel: 'Pilih file',
          destructive: true,
        );
        if (!ok || !ctx.mounted) return false;
        final res = await pickAndUpload(ctx, '/api/backup/restore', extensions: ['sql', 'gz', 'zip']);
        if (res != null && ctx.mounted) showToast(ctx, _msg(res) ?? 'Database dipulihkan.');
        return res != null;
      }, kind: ActionKind.danger),
      CrudAction('Backup via Telegram', Icons.telegram, (ctx, _) async {
        await SettingsFormScreen.open(ctx, _telegramBackupSettings());
        return false;
      }),
    ],
  );
}

SettingsFormScreen _telegramBackupSettings() => SettingsFormScreen(
  title: 'Backup ke Telegram',
  load: () async {
    final res = _map(await _api.get('/api/backup/telegram/settings'));
    return mapOf(res, 'settings') ?? res;
  },
  fields: (_) => const [
    FieldSpec('enabled', 'Backup otomatis ke Telegram', type: FieldType.toggle),
    FieldSpec('botToken', 'Bot token', type: FieldType.password),
    FieldSpec('chatId', 'Chat ID'),
    FieldSpec('backupTopicId', 'Topic ID backup'),
    FieldSpec('healthTopicId', 'Topic ID kesehatan'),
    FieldSpec(
      'schedule',
      'Jadwal',
      type: FieldType.select,
      options: [('daily', 'Harian'), ('12h', 'Tiap 12 jam'), ('6h', 'Tiap 6 jam'), ('weekly', 'Mingguan')],
    ),
    FieldSpec('scheduleTime', 'Jam', type: FieldType.time),
    FieldSpec('keepLastN', 'Simpan N terakhir', type: FieldType.integer, min: 1),
  ],
  save: (v, _) => _api.put('/api/backup/telegram/settings', data: v),
  secondary: [FormAction('Tes', Icons.send_rounded, (_) async => _msg(await _api.post('/api/backup/telegram/test')))],
);

/// Cloudflare Tunnel — /admin/settings/cloudflare-tunnel.
class CloudflareTunnelScreen extends StatefulWidget {
  const CloudflareTunnelScreen({super.key});

  @override
  State<CloudflareTunnelScreen> createState() => _CloudflareTunnelScreenState();
}

class _CloudflareTunnelScreenState extends State<CloudflareTunnelScreen> {
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
      final res = _map(await _api.get('/api/admin/cloudflare-tunnel'));
      if (mounted) setState(() => _s = res);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _action(String action, String label, {bool confirm = false}) async {
    if (confirm) {
      final ok = await confirmAction(context, title: '$label?', message: 'Layanan cloudflared di server akan di-$label.', confirmLabel: label);
      if (!ok || !mounted) return;
    }
    setState(() => _busy = action);
    String? msg;
    final done = await runAction(context, () async => msg = _msg(await _api.postLong('/api/admin/cloudflare-tunnel', data: {'action': action})));
    if (!mounted) return;
    setState(() => _busy = null);
    if (done) {
      showToast(context, msg ?? '$label selesai.');
      _load();
    }
  }

  Future<void> _configure() async {
    final cfg = mapOf(_s, 'tunnelConfig') ?? {};
    final ok = await openForm(
      context,
      title: 'Konfigurasi Tunnel',
      fields: const [
        FieldSpec('tunnelDomain', 'Domain publik', required: true, hint: 'billing.domain.id'),
        FieldSpec('tunnelToken', 'Tunnel token', type: FieldType.password, helper: 'Dari Cloudflare Zero Trust → Tunnels. Kosongkan jika tidak diganti.'),
        FieldSpec('localPort', 'Port lokal', type: FieldType.select, initial: '8080', options: [('8080', '8080 (disarankan)'), ('80', '80 (HTTP langsung)')]),
      ],
      initial: {'tunnelDomain': cfg['domain'] ?? _s?['baseUrl'], 'localPort': '${cfg['localPort'] ?? 8080}'},
      onSubmit: (v) => _api.postLong('/api/admin/cloudflare-tunnel', data: {'action': 'save_config', ...v}),
      success: 'Konfigurasi tunnel disimpan.',
    );
    if (ok) _load();
  }

  @override
  Widget build(BuildContext context) {
    final s = _s;
    Widget btn(String action, String label, IconData icon, {bool confirm = false}) => OutlinedButton.icon(
      onPressed: _busy != null ? null : () => _action(action, label, confirm: confirm),
      icon: _busy == action ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : Icon(icon, size: 18),
      label: Text(label),
    );
    return Scaffold(
      appBar: AppBar(
        title: const Text('Cloudflare Tunnel'),
        actions: [IconButton(icon: const Icon(Icons.refresh_rounded), onPressed: _load)],
      ),
      bottomNavigationBar: s == null ? null : ActionBar(actions: [ActionSpec('Konfigurasi', Icons.tune_rounded, _configure)]),
      body: s == null
          ? (_error != null ? ErrorView(message: _error!, onRetry: _load) : const LoadingView())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, Gap.xl),
                children: [
                  DetailHeader(
                    icon: Icons.cloud_rounded,
                    tone: s['serviceStatus'] == 'active' ? Tone.success : Tone.warning,
                    title: s['installed'] == true ? 'cloudflared ${s['version'] ?? ''}' : 'cloudflared belum terpasang',
                    subtitle: str(s, 'baseUrl'),
                    status: StatusPill(label: str(s, 'serviceStatus') ?? '-', tone: s['serviceStatus'] == 'active' ? Tone.success : Tone.warning),
                  ),
                  DetailSection(
                    title: 'Status',
                    rows: [
                      InfoRow('Layanan', str(s, 'serviceStatus')),
                      InfoRow('Auto start', s['serviceEnabled'] == true ? 'Ya' : 'Tidak'),
                      InfoRow('Koneksi', s['connections'] is List ? '${(s['connections'] as List).length} edge' : str(s, 'connections')),
                      InfoRow('APP URL (.env)', str(s, 'envAppUrl')),
                      InfoRow('NEXTAUTH URL', str(s, 'envNextauthUrl')),
                    ],
                  ),
                  const SizedBox(height: Gap.lg),
                  Wrap(
                    spacing: Gap.sm,
                    runSpacing: Gap.sm,
                    children: [
                      if (s['installed'] != true) btn('install', 'Pasang', Icons.download_rounded, confirm: true),
                      btn('install_service', 'Pasang service', Icons.miscellaneous_services_rounded, confirm: true),
                      btn('start', 'Start', Icons.play_arrow_rounded),
                      btn('stop', 'Stop', Icons.stop_rounded, confirm: true),
                      btn('restart', 'Restart', Icons.restart_alt_rounded),
                      btn('enable', 'Auto start on', Icons.toggle_on_rounded),
                      btn('disable', 'Auto start off', Icons.toggle_off_rounded),
                      btn('switch_nginx_port', 'Pindah port nginx', Icons.swap_horiz_rounded, confirm: true),
                    ],
                  ),
                ],
              ),
            ),
    );
  }
}

/// Sistem — versi & pembaruan (/admin/system).
class SystemUpdateScreen extends StatefulWidget {
  const SystemUpdateScreen({super.key});

  @override
  State<SystemUpdateScreen> createState() => _SystemUpdateScreenState();
}

class _SystemUpdateScreenState extends State<SystemUpdateScreen> {
  Json? _info;
  Json? _changes;
  Json? _status;
  String? _error;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final r = await Future.wait([_api.get('/api/admin/system/info'), _api.get('/api/admin/system/changelog')]);
      if (mounted) {
        setState(() {
          _info = _map(r[0]);
          _changes = _map(r[1]);
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _update() async {
    final ok = await confirmAction(
      context,
      title: 'Perbarui Sistem?',
      message: 'Server menarik kode terbaru, build ulang, lalu restart. Panel tidak bisa diakses beberapa menit.',
      confirmLabel: 'Perbarui',
    );
    if (!ok || !mounted) return;
    final done = await runAction(context, () => _api.post('/api/admin/system/changelog', data: {'action': 'update'}), success: 'Pembaruan dimulai.');
    if (!done) return;
    _poll?.cancel();
    _poll = Timer.periodic(const Duration(seconds: 5), (_) async {
      try {
        final s = mapOf(_map(await _api.get('/api/admin/system/changelog', query: {'action': 'status'})), 'status') ?? const {'phase': 'idle'};
        if (!mounted) return;
        setState(() => _status = s);
        if (s['phase'] == 'done' || s['phase'] == 'error' || s['phase'] == 'idle') {
          _poll?.cancel();
          _load();
        }
      } on ApiException catch (_) {
        // Server is restarting; keep polling.
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final info = _info;
    final commits = extractList(_changes, listKey: 'commits');
    final hasUpdate = info?['hasUpdate'] == true || _changes?['hasUpdate'] == true;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sistem & Pembaruan'),
        actions: [IconButton(icon: const Icon(Icons.refresh_rounded), onPressed: _load)],
      ),
      bottomNavigationBar: hasUpdate && _poll == null ? ActionBar(actions: [ActionSpec('Perbarui Sekarang', Icons.system_update_rounded, _update)]) : null,
      body: info == null
          ? (_error != null ? ErrorView(message: _error!, onRetry: _load) : const LoadingView())
          : ListView(
              padding: EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, Gap.xl),
              children: [
                DetailHeader(
                  icon: Icons.memory_rounded,
                  tone: hasUpdate ? Tone.warning : Tone.success,
                  title: 'Versi ${info['version'] ?? '-'}',
                  subtitle: '${info['gitBranch'] ?? '-'} · ${info['commit'] ?? '-'}',
                  status: StatusPill(
                    label: hasUpdate ? '${info['behindCount'] ?? commits.length} pembaruan' : 'Terbaru',
                    tone: hasUpdate ? Tone.warning : Tone.success,
                  ),
                ),
                if (_status != null)
                  DetailSection(
                    title: 'Proses pembaruan',
                    rows: [InfoRow('Tahap', str(_status, 'phase')), InfoRow('Langkah', str(_status, 'step')), InfoRow('Detail', str(_status, 'detail'))],
                  ),
                DetailSection(
                  title: 'Commit terpasang',
                  rows: [
                    InfoRow('Pesan', str(info, 'commitMessage')),
                    InfoRow('Tanggal', formatDateTimeOrNull(dateOf(info, 'commitDate'))),
                    InfoRow('Total commit', str(info, 'totalCommits')),
                  ],
                ),
                if (commits.isNotEmpty)
                  DetailSection(
                    title: 'Perubahan tersedia',
                    rows: [for (final c in commits.take(30)) InfoRow(_short(str(c, 'hash')), str(c, 'subject') ?? str(c, 'message'))],
                  ),
              ],
            ),
    );
  }
}

String _short(String? hash) => hash == null || hash.isEmpty ? '-' : (hash.length > 7 ? hash.substring(0, 7) : hash);

/// Build APK per portal — /admin/download-apk.
class ApkBuilderScreen extends StatefulWidget {
  const ApkBuilderScreen({super.key});

  @override
  State<ApkBuilderScreen> createState() => _ApkBuilderScreenState();
}

class _ApkBuilderScreenState extends State<ApkBuilderScreen> {
  static const _roles = [
    ('admin', 'Admin', Icons.admin_panel_settings_rounded),
    ('customer', 'Pelanggan', Icons.person_rounded),
    ('technician', 'Teknisi', Icons.engineering_rounded),
    ('agent', 'Agent', Icons.storefront_rounded),
    ('collector', 'Kolektor', Icons.badge_rounded),
    ('qris_listener', 'QRIS listener', Icons.qr_code_rounded),
  ];
  Json? _env;
  final Map<String, Json> _status = {};
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _load();
    _poll = Timer.periodic(const Duration(seconds: 10), (_) {
      if (_status.values.any((s) => s['status'] == 'building')) _loadStatuses();
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      _env = _map(await _api.get('/api/admin/apk/trigger'));
    } on ApiException catch (_) {}
    await _loadStatuses();
  }

  Future<void> _loadStatuses() async {
    for (final (role, _, _) in _roles) {
      try {
        _status[role] = _map(await _api.get('/api/admin/apk/status', query: {'role': role}));
      } on ApiException catch (_) {}
    }
    if (mounted) setState(() {});
  }

  Future<void> _build(String role, String label) async {
    final ok = await openForm(
      context,
      title: 'Build APK $label',
      submitLabel: 'Build',
      fields: const [FieldSpec('url', 'URL server di APK', type: FieldType.url, helper: 'Kosongkan untuk memakai URL aplikasi saat ini.')],
      initial: {'url': _env?['defaultUrl']},
      onSubmit: (v) => _api.post('/api/admin/apk/trigger?role=$role${isBlank(v['url']) ? '' : '&url=${Uri.encodeQueryComponent(v['url'] as String)}'}'),
      success: 'Build dimulai. Biasanya 3–10 menit.',
    );
    if (ok) _loadStatuses();
  }

  @override
  Widget build(BuildContext context) {
    final ready = _env?['ready'] == true;
    return Scaffold(
      appBar: AppBar(title: const Text('Build APK')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, listBottomPadding(context)),
          children: [
            if (_env != null)
              DetailSection(
                title: 'Lingkungan build di server',
                rows: [
                  InfoRow('Siap build', ready ? 'Ya' : 'Belum — pasang Java & Android SDK'),
                  InfoRow('Java', str(_env, 'javaVersion') ?? str(_env, 'java')),
                  InfoRow('Android SDK', str(_env, 'androidSdk') ?? str(_env, 'androidHome')),
                ],
              ),
            const SizedBox(height: Gap.lg),
            for (final (role, label, icon) in _roles) ...[
              EntityTile(
                icon: icon,
                tone: Tone.primary,
                title: 'Aplikasi $label',
                subtitle: _status[role]?['status'] == 'building'
                    ? 'Sedang build…'
                    : (_status[role]?['apkAvailable'] == true ? 'APK tersedia' : 'Belum ada APK'),
                meta: formatDateTimeOrNull(dateOf(_status[role], 'finishedAt') ?? dateOf(_status[role], 'startedAt')),
                footer: Row(
                  children: [
                    if (_status[role]?['apkAvailable'] == true) ...[
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => downloadAndShare(context, '/api/admin/apk/file', 'salfanet-$role.apk', query: {'role': role}),
                          icon: const Icon(Icons.download_rounded, size: 18),
                          label: const Text('Unduh'),
                        ),
                      ),
                      const SizedBox(width: Gap.sm),
                    ],
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: !ready || _status[role]?['status'] == 'building' ? null : () => _build(role, label),
                        icon: const Icon(Icons.build_rounded, size: 18),
                        label: const Text('Build'),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: Gap.sm),
            ],
            const SizedBox(height: Gap.md),
            Text('Buka tautan unduhan di ponsel untuk memasang.', style: TextStyle(fontSize: 12, color: context.colors.onSurfaceVariant)),
            TextButton(
              onPressed: () => launchUrl(Uri.parse(ApiClient.instance.baseUrl), mode: LaunchMode.externalApplication),
              child: const Text('Buka panel web'),
            ),
          ],
        ),
      ),
    );
  }
}
