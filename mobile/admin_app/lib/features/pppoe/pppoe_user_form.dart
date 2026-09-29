import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/api/api_client.dart';
import '../../core/crud/lookups.dart';
import '../../core/formatters.dart';
import '../../core/forms/field_spec.dart';
import '../../core/forms/form_screen.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';

final _api = ApiClient.instance;

/// Upload used by the KTP and installation photo fields — same endpoint and
/// `type` values as the web customer form.
Future<String> Function(XFile) customerPhotoUploader(String type) => (file) async {
  final res = await _api.upload('/api/upload/pppoe-customer', file.path, filename: file.name, fields: {'type': type});
  final url = res is Map ? res['url']?.toString() : null;
  if (url == null) throw ApiException((res is Map ? res['error']?.toString() : null) ?? 'Upload gagal');
  return url;
};

const _connectionTypes = [('PPPOE', 'PPPoE'), ('STATIC_IP', 'Static IP (ARP)'), ('HOTSPOT', 'Static IP (Hotspot binding)')];
const _subscriptionTypes = [('POSTPAID', 'Pascabayar'), ('PREPAID', 'Prabayar')];

bool _needsIp(Map<String, dynamic> v) => v['connectionType'] == 'STATIC_IP' || v['connectionType'] == 'HOTSPOT';

List<FieldSpec> _fields({required bool editing}) => [
  const FieldSpec.section('Data pelanggan'),
  const FieldSpec('name', 'Nama lengkap', required: true),
  const FieldSpec('phone', 'No. HP / WhatsApp', type: FieldType.phone, required: true, hint: '08xxxxxxxxxx'),
  const FieldSpec('email', 'Email', type: FieldType.email),
  const FieldSpec('address', 'Alamat', type: FieldType.multiline),
  FieldSpec('areaId', 'Area', type: FieldType.select, loadOptions: Lookups.areas),
  const FieldSpec('idCardNumber', 'No. KTP / NIK', type: FieldType.phone),
  FieldSpec('idCardPhoto', 'Foto KTP', type: FieldType.image, required: !editing, uploader: customerPhotoUploader('idCard')),
  FieldSpec('latitude', 'Lokasi rumah (GPS)', type: FieldType.location, pairKey: 'longitude', required: !editing),
  FieldSpec('installationPhotos', 'Foto instalasi', type: FieldType.images, max: 5, uploader: customerPhotoUploader('installation')),
  const FieldSpec.section('Paket & tagihan'),
  FieldSpec('profileId', 'Paket', type: FieldType.select, required: true, loadOptions: Lookups.pppoeProfiles),
  const FieldSpec('subscriptionType', 'Jenis langganan', type: FieldType.select, options: _subscriptionTypes, initial: 'POSTPAID', required: true),
  FieldSpec(
    'billingDay',
    'Tanggal tagihan (1–28)',
    type: FieldType.integer,
    initial: 1,
    min: 1,
    max: 28,
    visibleIf: (v) => v['subscriptionType'] == 'POSTPAID',
  ),
  if (!editing)
    const FieldSpec(
      'firstInvoice',
      'Tagihan pertama',
      type: FieldType.select,
      initial: 'prorate',
      required: true,
      options: [('prorate', 'Prorata sampai tanggal tagihan'), ('full', 'Penuh satu periode'), ('none', 'Tidak dibuat')],
    ),
  const FieldSpec('expiredAt', 'Berlaku sampai', type: FieldType.date, helper: 'Kosongkan untuk dihitung otomatis dari paket.'),
  const FieldSpec('discount', 'Diskon (Rp)', type: FieldType.integer, min: 0),
  const FieldSpec('discountNote', 'Keterangan diskon'),
  const FieldSpec('autoIsolationEnabled', 'Isolir otomatis saat jatuh tempo', type: FieldType.toggle, initial: true),
  if (editing) const FieldSpec('autoRenewal', 'Perpanjang otomatis dari saldo', type: FieldType.toggle),
  const FieldSpec.section('Koneksi'),
  const FieldSpec('connectionType', 'Tipe koneksi', type: FieldType.select, options: _connectionTypes, initial: 'PPPOE', required: true),
  if (!editing)
    const FieldSpec(
      'hasPppoeAccount',
      'Buat akun PPPoE',
      type: FieldType.toggle,
      initial: true,
      helper: 'Matikan untuk pelanggan yang belum punya akun (mis. Static IP).',
    ),
  FieldSpec('username', 'Username PPPoE', required: true, visibleIf: (v) => editing || v['hasPppoeAccount'] != false),
  FieldSpec(
    'password',
    editing ? 'Password baru' : 'Password PPPoE',
    type: FieldType.password,
    required: !editing,
    omitWhenEmpty: editing,
    helper: editing ? 'Kosongkan jika tidak diganti.' : null,
    visibleIf: (v) => editing || v['hasPppoeAccount'] != false,
  ),
  FieldSpec('routerId', 'Router / NAS', type: FieldType.select, loadOptions: Lookups.routers),
  if (!editing) FieldSpec('createPppSecret', 'Buat juga PPP secret di MikroTik', type: FieldType.toggle, visibleIf: (v) => v['hasPppoeAccount'] != false),
  if (editing)
    FieldSpec(
      'forceSyncMikrotik',
      'Paksa sinkron ulang ke MikroTik',
      type: FieldType.toggle,
      visibleIf: (v) => v['connectionType'] == 'PPPOE' && v['routerId'] != null,
    ),
  FieldSpec(
    'ipAddress',
    'IP address',
    hint: '192.168.1.10',
    required: false,
    visibleIf: _needsIp,
    validator: (val, v) => _needsIp(v) && (val ?? '').toString().trim().isEmpty ? 'IP wajib untuk Static / Hotspot' : null,
  ),
  const FieldSpec('macAddress', 'MAC address', hint: 'AA:BB:CC:DD:EE:FF'),
  const FieldSpec('odp', 'ODP'),
  const FieldSpec('comment', 'Catatan', type: FieldType.multiline),
  const FieldSpec('registeredAt', 'Tanggal daftar', type: FieldType.date),
];

/// Opens the add-customer form. Mirrors the web PSB wizard's payload.
Future<bool> openCreateCustomer(BuildContext context) {
  return openForm(
    context,
    title: 'Tambah Pelanggan',
    fields: _fields(editing: false),
    initial: {'registeredAt': DateTime.now()},
    success: 'Pelanggan ditambahkan.',
    onSubmit: (v) async {
      final hasAccount = v.remove('hasPppoeAccount') != false;
      await _api.post(
        '/api/pppoe/users',
        data: {
          ...v,
          'username': hasAccount ? v['username'] : '',
          'password': hasAccount ? v['password'] : '',
          'noPppoeAccount': !hasAccount,
          'createPppSecret': hasAccount && v['createPppSecret'] == true,
          'discount': v['discount'] ?? 0,
          'installationPhotos': v['installationPhotos'] ?? const [],
          if (v['expiredAt'] != null) 'expiredAt': '${v['expiredAt']}T16:59:59.000Z', // 23:59:59 WIB
        },
      );
    },
  );
}

/// Opens the edit form for a customer record as returned by
/// GET /api/pppoe/users/:id (`user`).
Future<bool> openEditCustomer(BuildContext context, Map<String, dynamic> user) {
  final initial = <String, dynamic>{
    ...user,
    'areaId': mapOf(user, 'area')?['id'] ?? user['areaId'],
    'profileId': mapOf(user, 'profile')?['id'] ?? user['profileId'],
    'routerId': mapOf(user, 'router')?['id'] ?? user['routerId'],
    'password': null,
    'subscriptionType': user['subscriptionType'] ?? 'POSTPAID',
    'connectionType': user['connectionType'] ?? 'PPPOE',
    'autoIsolationEnabled': user['autoIsolationEnabled'] != false,
    'registeredAt': user['createdAt'],
  };
  return openForm(
    context,
    title: 'Edit Pelanggan',
    fields: _fields(editing: true),
    initial: initial,
    success: 'Data pelanggan disimpan.',
    onSubmit: (v) async {
      final data = {...v, 'id': user['id']};
      if (data['connectionType'] == 'PPPOE') data['ipAddress'] = '';
      if (data['forceSyncMikrotik'] != true) data.remove('forceSyncMikrotik');
      if (data['expiredAt'] != null) data['expiredAt'] = '${data['expiredAt']}T16:59:59.000Z';
      data['discount'] = data['discount'] ?? 0;
      await _api.put('/api/pppoe/users', data: data);
    },
  );
}

/// Delete needs the SUPER_ADMIN's own password, exactly as on the web.
Future<bool> deleteCustomer(BuildContext context, Map<String, dynamic> user) async {
  final password = await showDialog<String>(
    context: context,
    builder: (_) => _PasswordConfirmDialog(name: str(user, 'name') ?? str(user, 'username') ?? ''),
  );
  if (password == null || !context.mounted) return false;
  return runAction(
    context,
    () => _api.delete('/api/pppoe/users', query: {'id': user['id']}, data: {'confirmPassword': password}),
    success: 'Pelanggan dihapus.',
  );
}

class _PasswordConfirmDialog extends StatefulWidget {
  const _PasswordConfirmDialog({required this.name});
  final String name;

  @override
  State<_PasswordConfirmDialog> createState() => _PasswordConfirmDialogState();
}

class _PasswordConfirmDialogState extends State<_PasswordConfirmDialog> {
  final _c = TextEditingController();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final danger = context.tone(Tone.danger);
    return AlertDialog(
      title: const Text('Hapus Pelanggan?'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${widget.name} beserta akun RADIUS, sesi, dan riwayatnya akan dihapus permanen. Hanya Super Admin yang bisa menghapus.'),
          const SizedBox(height: Gap.md),
          TextField(
            controller: _c,
            obscureText: true,
            autofocus: true,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(labelText: 'Password akun Anda'),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Batal')),
        FilledButton(
          onPressed: _c.text.isEmpty ? null : () => Navigator.pop(context, _c.text),
          style: FilledButton.styleFrom(backgroundColor: danger, foregroundColor: onColor(danger)),
          child: const Text('Hapus'),
        ),
      ],
    );
  }
}

/// Extend the subscription one period, optionally switching package.
Future<bool> extendCustomer(BuildContext context, Map<String, dynamic> user) {
  return openForm(
    context,
    title: 'Perpanjang Langganan',
    submitLabel: 'Perpanjang',
    fields: [
      FieldSpec.note('Masa aktif ${str(user, 'username') ?? ''} diperpanjang satu periode paket yang dipilih.'),
      FieldSpec('profileId', 'Paket', type: FieldType.select, required: true, loadOptions: Lookups.pppoeProfiles),
    ],
    initial: {'profileId': mapOf(user, 'profile')?['id'] ?? user['profileId']},
    success: 'Langganan diperpanjang.',
    onSubmit: (v) => _api.post('/api/pppoe/users/${user['id']}/extend', data: v),
  );
}

Future<bool> topUpCustomer(BuildContext context, Map<String, dynamic> user) {
  return openForm(
    context,
    title: 'Top Up Saldo',
    submitLabel: 'Top Up',
    fields: const [
      FieldSpec('amount', 'Jumlah (Rp)', type: FieldType.integer, required: true, min: 1000),
      FieldSpec(
        'paymentMethod',
        'Metode',
        type: FieldType.select,
        required: true,
        initial: 'CASH',
        options: [('CASH', 'Tunai'), ('TRANSFER', 'Transfer bank'), ('EWALLET', 'E-wallet')],
      ),
      FieldSpec('note', 'Catatan'),
    ],
    success: 'Saldo ditambahkan.',
    onSubmit: (v) =>
        _api.post('/api/admin/pppoe/users/${user['id']}/deposit', data: {...v, 'note': (v['note'] as String?) ?? 'Top up via ${v['paymentMethod']}'}),
  );
}

Future<bool> promiseToPay(BuildContext context, Map<String, dynamic> user) {
  return openForm(
    context,
    title: 'Janji Bayar',
    fields: const [
      FieldSpec.note('Selama masa janji, pelanggan tidak diisolir otomatis.'),
      FieldSpec('promiseDate', 'Tanggal janji', type: FieldType.date, required: true),
      FieldSpec('notes', 'Catatan', type: FieldType.multiline),
    ],
    success: 'Janji bayar dicatat.',
    onSubmit: (v) {
      final d = DateTime.tryParse('${v['promiseDate']}');
      if (d == null || !d.isAfter(DateTime.now())) throw ApiException('Tanggal janji harus di masa depan.');
      return _api.post('/api/pppoe/users/${user['id']}/promise', data: v);
    },
  );
}

Future<bool> cancelPromise(BuildContext context, Map<String, dynamic> user) async {
  final ok = await confirmAction(
    context,
    title: 'Batalkan Janji Bayar?',
    message: 'Pelanggan kembali mengikuti jadwal isolir normal.',
    confirmLabel: 'Batalkan janji',
    destructive: true,
  );
  if (!ok || !context.mounted) return false;
  return runAction(context, () => _api.delete('/api/pppoe/users/${user['id']}/promise'), success: 'Janji bayar dibatalkan.');
}

Future<bool> sendCustomerNotice(BuildContext context, Map<String, dynamic> user) => sendNotice(context, [user['id'].toString()]);

/// Outage / invoice / payment notice to one or many customers — the web
/// list's "Kirim Notifikasi" dialog.
Future<bool> sendNotice(BuildContext context, List<String> userIds) {
  bool outage(Map<String, dynamic> v) => v['notificationType'] == 'outage';
  return openForm(
    context,
    title: userIds.length == 1 ? 'Kirim Notifikasi' : 'Notifikasi ke ${userIds.length} pelanggan',
    submitLabel: 'Kirim',
    fields: [
      const FieldSpec(
        'notificationType',
        'Jenis',
        type: FieldType.select,
        required: true,
        initial: 'invoice',
        options: [('invoice', 'Info tagihan'), ('payment', 'Konfirmasi pembayaran'), ('outage', 'Gangguan jaringan')],
      ),
      const FieldSpec(
        'notificationMethod',
        'Kirim lewat',
        type: FieldType.select,
        required: true,
        initial: 'whatsapp',
        options: [('whatsapp', 'WhatsApp'), ('email', 'Email'), ('both', 'WhatsApp & email')],
      ),
      FieldSpec(
        'status',
        'Status gangguan',
        type: FieldType.select,
        initial: 'in_progress',
        visibleIf: outage,
        options: const [('in_progress', 'Sedang ditangani'), ('resolved', 'Sudah selesai')],
      ),
      FieldSpec('issueType', 'Jenis gangguan', initial: 'Gangguan Jaringan', visibleIf: outage, required: true),
      FieldSpec(
        'description',
        'Keterangan',
        type: FieldType.multiline,
        visibleIf: outage,
        validator: (val, v) => outage(v) && (val ?? '').toString().trim().isEmpty ? 'Wajib diisi' : null,
      ),
      FieldSpec(
        'estimatedTime',
        'Perkiraan selesai',
        hint: 'mis. 2 jam',
        visibleIf: outage,
        validator: (val, v) => outage(v) && (val ?? '').toString().trim().isEmpty ? 'Wajib diisi' : null,
      ),
      FieldSpec(
        'affectedArea',
        'Area terdampak',
        visibleIf: outage,
        validator: (val, v) => outage(v) && (val ?? '').toString().trim().isEmpty ? 'Wajib diisi' : null,
      ),
      FieldSpec('additionalMessage', 'Pesan tambahan', type: FieldType.multiline, visibleIf: (v) => !outage(v)),
    ],
    success: 'Notifikasi dikirim.',
    onSubmit: (v) => _api.post('/api/pppoe/users/send-notification', data: {...v, 'userIds': userIds}),
  );
}

/// Add-ons attached to one customer: list, add, remove.
class CustomerAddonsSheet extends StatefulWidget {
  const CustomerAddonsSheet({super.key, required this.userId});
  final String userId;

  static Future<void> open(BuildContext context, String userId) => showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => CustomerAddonsSheet(userId: userId),
  );

  @override
  State<CustomerAddonsSheet> createState() => _CustomerAddonsSheetState();
}

class _CustomerAddonsSheetState extends State<CustomerAddonsSheet> {
  List<Map<String, dynamic>>? _addons;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await _api.get('/api/pppoe/users/${widget.userId}/addons');
      if (mounted) setState(() => _addons = extractList(res, listKey: 'addons'));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _add() async {
    final ok = await openForm(
      context,
      title: 'Tambah Add-on',
      fields: [
        FieldSpec('addonTypeId', 'Add-on', type: FieldType.select, required: true, loadOptions: Lookups.addonTypes),
        const FieldSpec('priceOverride', 'Harga khusus (Rp)', type: FieldType.integer, helper: 'Kosongkan untuk memakai harga standar.'),
        const FieldSpec('startDate', 'Mulai', type: FieldType.date),
        const FieldSpec('notes', 'Catatan'),
      ],
      success: 'Add-on ditambahkan.',
      onSubmit: (v) => _api.post('/api/pppoe/users/${widget.userId}/addons', data: v),
    );
    if (ok) _load();
  }

  Future<void> _remove(Map<String, dynamic> a) async {
    final name = str(mapOf(a, 'addonType'), 'name') ?? 'add-on';
    final ok = await confirmAction(context, title: 'Lepas Add-on?', message: '$name tidak akan ditagihkan lagi.', confirmLabel: 'Lepas', destructive: true);
    if (!ok || !mounted) return;
    if (await runAction(context, () => _api.delete('/api/customer-addons/${a['id']}'), success: 'Add-on dilepas.')) _load();
  }

  @override
  Widget build(BuildContext context) {
    final list = _addons;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      maxChildSize: 0.95,
      builder: (context, controller) => ListView(
        controller: controller,
        padding: EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, listBottomPadding(context)),
        children: [
          Row(
            children: [
              const Expanded(
                child: Text('Add-on Pelanggan', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              ),
              FilledButton.icon(onPressed: _add, icon: const Icon(Icons.add_rounded, size: 18), label: const Text('Tambah')),
            ],
          ),
          const SizedBox(height: Gap.md),
          if (_error != null) Text(_error!, style: TextStyle(color: context.tone(Tone.danger))),
          if (list == null && _error == null)
            const Padding(
              padding: EdgeInsets.all(Gap.xl),
              child: Center(child: CircularProgressIndicator()),
            ),
          if (list != null && list.isEmpty)
            Padding(
              padding: const EdgeInsets.all(Gap.xl),
              child: Center(
                child: Text('Belum ada add-on.', style: TextStyle(color: context.colors.onSurfaceVariant)),
              ),
            ),
          for (final a in list ?? const <Map<String, dynamic>>[])
            Padding(
              padding: const EdgeInsets.only(bottom: Gap.sm),
              child: EntityTile(
                icon: Icons.extension_rounded,
                tone: Tone.violet,
                title: str(mapOf(a, 'addonType'), 'name') ?? '-',
                subtitle: '${formatCurrency(numOf(a, 'effective_price'))}${mapOf(a, 'addonType')?['isRecurring'] == true ? ' / bulan' : ' sekali'}',
                meta: [str(a, 'notes'), formatDateOrNull(dateOf(a, 'startDate'))].whereType<String>().join(' · '),
                trailing: IconButton(
                  icon: Icon(Icons.delete_outline_rounded, color: context.tone(Tone.danger)),
                  onPressed: () => _remove(a),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
