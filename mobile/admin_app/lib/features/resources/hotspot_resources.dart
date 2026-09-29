import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/api/api_client.dart';
import '../../core/crud/crud_list_screen.dart';
import '../../core/crud/lookups.dart';
import '../../core/files.dart';
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

const _units = {'MINUTES': 'menit', 'HOURS': 'jam', 'DAYS': 'hari', 'MONTHS': 'bulan'};
String validityText(Json? p) => p == null ? '-' : '${p['validityValue'] ?? '-'} ${_units[p['validityUnit']] ?? p['validityUnit'] ?? ''}';

String _bytes(num b) {
  if (b >= 1 << 30) return '${(b / (1 << 30)).toStringAsFixed(b % (1 << 30) == 0 ? 0 : 1)} GB';
  return '${(b / (1 << 20)).round()} MB';
}

/// Profil Hotspot — mirrors /admin/hotspot/profile.
CrudConfig hotspotProfilesConfig() {
  Json payload(Json v) {
    final quota = v.remove('usageQuotaValue') as num?;
    final unit = v.remove('usageQuotaUnit') ?? 'MB';
    final dl = v.remove('speedDownload') ?? 0;
    final ul = v.remove('speedUpload') ?? 0;
    final burst = (v.remove('speedBurst') as String?)?.trim();
    return {
      ...v,
      'speed': burst != null && burst.isNotEmpty ? burst : '${dl}M/${ul}M',
      'usageQuota': quota == null || quota <= 0 ? null : (quota * (unit == 'GB' ? 1 << 30 : 1 << 20)).floor(),
      'usageDuration': (v['usageDuration'] as num?) == null || (v['usageDuration'] as num) <= 0 ? null : v['usageDuration'],
    };
  }

  Json initial(Json p) {
    final speed = (p['speed'] as String?) ?? '';
    final parts = speed.trim().split(RegExp(r'\s+'));
    final simple = parts.first.split('/');
    num? mbps(String s) {
      final n = num.tryParse(s.replaceAll(RegExp(r'[^0-9.]'), ''));
      if (n == null) return null;
      return s.toLowerCase().endsWith('k') ? n / 1024 : n;
    }

    final quota = p['usageQuota'] is num ? p['usageQuota'] as num : num.tryParse('${p['usageQuota'] ?? ''}');
    final gb = quota != null && quota >= (1 << 30) && quota % (1 << 30) == 0;
    return {
      ...p,
      'speedDownload': simple.isNotEmpty ? mbps(simple[0]) : null,
      'speedUpload': simple.length > 1 ? mbps(simple[1]) : null,
      'speedBurst': parts.length >= 3 ? speed : null,
      'usageQuotaValue': quota == null ? null : (gb ? quota / (1 << 30) : quota / (1 << 20)).round(),
      'usageQuotaUnit': gb ? 'GB' : 'MB',
    };
  }

  return CrudConfig(
    title: 'Profil Hotspot',
    noun: 'Profil',
    icon: Icons.wifi_rounded,
    tone: Tone.accent,
    fetch: (_) => _api.get('/api/hotspot/profiles'),
    listKey: 'profiles',
    titleOf: (p) => str(p, 'name') ?? '-',
    subtitleOf: (p) => '${p['speed'] ?? '-'} · ${validityText(p)}',
    metaOf: (p) => [
      'Modal ${formatCurrency(numOf(p, 'costPrice'))}',
      if (numOf(p, 'resellerFee') > 0) 'Fee agent ${formatCurrency(numOf(p, 'resellerFee'))}',
      if (p['usageQuota'] != null) 'Kuota ${_bytes(numOf(p, 'usageQuota'))}',
    ].join(' · '),
    trailingOf: (context, p) => AmountTrailing(amount: formatCurrency(numOf(p, 'sellingPrice')), pill: p['isActive'] == false ? _activePill(p) : null),
    sectionsOf: (context, p) => [
      DetailSection(
        title: 'Harga',
        rows: [
          InfoRow('Harga jual', formatCurrency(numOf(p, 'sellingPrice'))),
          InfoRow('Harga modal', formatCurrency(numOf(p, 'costPrice'))),
          InfoRow('Fee agent', formatCurrency(numOf(p, 'resellerFee'))),
        ],
      ),
      DetailSection(
        title: 'Layanan',
        rows: [
          InfoRow('Kecepatan', str(p, 'speed'), copyable: true),
          InfoRow('Masa aktif', validityText(p)),
          InfoRow('Kuota', p['usageQuota'] == null ? 'Tanpa batas' : _bytes(numOf(p, 'usageQuota'))),
          InfoRow('Durasi pakai', p['usageDuration'] == null ? 'Tanpa batas' : '${p['usageDuration']} ${_units[p['usageDurationUnit']] ?? ''}'),
          InfoRow('Perangkat bersamaan', str(p, 'sharedUsers')),
          InfoRow('Group profile', str(p, 'groupProfile'), copyable: true),
          InfoRow('Bisa dijual agent', p['agentAccess'] == true ? 'Ya' : 'Tidak'),
          InfoRow('Dijual di e-voucher', p['eVoucherAccess'] == true ? 'Ya' : 'Tidak'),
        ],
      ),
    ],
    fields: (p) => [
      const FieldSpec('name', 'Nama profil', required: true, hint: 'mis. 1 Hari 5 Mbps'),
      const FieldSpec.section('Harga'),
      const FieldSpec('costPrice', 'Harga modal (Rp)', type: FieldType.integer, required: true, min: 0),
      const FieldSpec('resellerFee', 'Fee agent (Rp)', type: FieldType.integer, initial: 0, min: 0, helper: 'Harga jual = modal + fee agent.'),
      const FieldSpec.section('Kecepatan'),
      const FieldSpec('speedDownload', 'Download (Mbps)', type: FieldType.decimal, initial: 5, required: true),
      const FieldSpec('speedUpload', 'Upload (Mbps)', type: FieldType.decimal, initial: 5, required: true),
      const FieldSpec('speedBurst', 'Rate limit lengkap (burst)', hint: '5M/5M 10M/10M 4M/4M 8', helper: 'Kosongkan untuk memakai kecepatan di atas.'),
      const FieldSpec.section('Masa aktif & batas'),
      const FieldSpec('validityValue', 'Masa aktif', type: FieldType.integer, required: true, min: 1),
      const FieldSpec(
        'validityUnit',
        'Satuan',
        type: FieldType.select,
        required: true,
        initial: 'HOURS',
        options: [('MINUTES', 'Menit'), ('HOURS', 'Jam'), ('DAYS', 'Hari'), ('MONTHS', 'Bulan')],
      ),
      const FieldSpec('usageQuotaValue', 'Kuota data', type: FieldType.integer, min: 0, helper: 'Kosongkan untuk tanpa batas.'),
      const FieldSpec('usageQuotaUnit', 'Satuan kuota', type: FieldType.select, initial: 'MB', options: [('MB', 'MB'), ('GB', 'GB')]),
      const FieldSpec('usageDuration', 'Batas durasi pakai', type: FieldType.integer, min: 0, helper: 'Total waktu online. Kosongkan untuk tanpa batas.'),
      const FieldSpec(
        'usageDurationUnit',
        'Satuan durasi',
        type: FieldType.select,
        initial: 'HOURS',
        options: [('MINUTES', 'Menit'), ('HOURS', 'Jam'), ('DAYS', 'Hari')],
      ),
      const FieldSpec('sharedUsers', 'Perangkat bersamaan', type: FieldType.integer, initial: 1, min: 1),
      const FieldSpec('groupProfile', 'Group profile RADIUS', initial: 'salfanetradius'),
      const FieldSpec.section('Penjualan'),
      const FieldSpec('agentAccess', 'Bisa dijual agent', type: FieldType.toggle, initial: true),
      const FieldSpec('eVoucherAccess', 'Dijual di e-voucher online', type: FieldType.toggle, initial: true),
      if (p != null) const FieldSpec('isActive', 'Profil aktif', type: FieldType.toggle, initial: true),
    ],
    initialOf: initial,
    create: (v) => _api.post('/api/hotspot/profiles', data: payload(v)),
    update: (p, v) => _api.put('/api/hotspot/profiles', data: {'id': p['id'], ...payload(v)}),
    delete: CrudRoutes.deleteWithQueryId('/api/hotspot/profiles'),
    deleteMessage: (p) => 'Profil "${p['name']}" dihapus dari sistem dan dari router lokal.',
    itemActions: [
      CommonActions.confirmPost('Sinkron ke router', Icons.sync_rounded, (_) => '/api/hotspot/profiles/sync', body: (p) => {'profileId': p['id']}, long: true),
    ],
    toolbar: [
      CommonActions.confirmPost(
        'Sinkron semua profil',
        Icons.sync_rounded,
        (_) => '/api/hotspot/profiles/sync',
        confirm: 'Semua profil hotspot ditulis ulang ke RADIUS dan router lokal.',
        long: true,
      ),
    ],
  );
}

/// Template cetak voucher — mirrors /admin/hotspot/template.
CrudConfig voucherTemplatesConfig() => CrudConfig(
  title: 'Template Voucher',
  noun: 'Template',
  icon: Icons.print_rounded,
  tone: Tone.violet,
  fetch: (_) => _api.get('/api/voucher-templates'),
  titleOf: (t) => str(t, 'name') ?? '-',
  subtitleOf: (t) => t['isDefault'] == true ? 'Template bawaan' : null,
  statusOf: _activePill,
  sectionsOf: (context, t) => [
    DetailSection(
      rows: [
        InfoRow('Bawaan', t['isDefault'] == true ? 'Ya' : 'Tidak'),
        InfoRow('Status', t['isActive'] == false ? 'Nonaktif' : 'Aktif'),
        InfoRow('Panjang HTML', '${(t['htmlTemplate'] as String?)?.length ?? 0} karakter'),
      ],
    ),
  ],
  fields: (_) => const [
    FieldSpec('name', 'Nama template', required: true),
    FieldSpec(
      'htmlTemplate',
      'HTML template',
      type: FieldType.multiline,
      required: true,
      helper: 'Variabel: {{code}}, {{password}}, {{profile}}, {{price}}, {{validity}}, {{company}}. Edit besar lebih nyaman di web.',
    ),
    FieldSpec('isDefault', 'Jadikan bawaan', type: FieldType.toggle),
    FieldSpec('isActive', 'Aktif', type: FieldType.toggle, initial: true),
  ],
  create: CrudRoutes.postTo('/api/voucher-templates'),
  update: CrudRoutes.putById('/api/voucher-templates'),
  delete: CrudRoutes.deleteById('/api/voucher-templates'),
);

/// Agent (reseller voucher) — mirrors /admin/hotspot/agent.
CrudConfig agentsConfig() => CrudConfig(
  title: 'Agent',
  noun: 'Agent',
  icon: Icons.storefront_rounded,
  tone: Tone.accent,
  fetch: (_) => _api.get('/api/hotspot/agents'),
  listKey: 'agents',
  titleOf: (a) => str(a, 'name') ?? '-',
  subtitleOf: (a) => str(a, 'phone'),
  metaOf: (a) => [
    str(mapOf(a, 'router'), 'name'),
    if (mapOf(a, 'stats') != null) '${mapOf(mapOf(a, 'stats'), 'currentMonth')?['count'] ?? 0} terjual bulan ini',
  ].whereType<String>().join(' · '),
  trailingOf: (context, a) => AmountTrailing(amount: formatCurrency(numOf(a, 'balance')), pill: _activePill(a)),
  figureLabel: 'Saldo',
  figureOf: (a) => formatCurrency(numOf(a, 'balance')),
  sectionsOf: (context, a) => [
    DetailSection(
      rows: [
        InfoRow('Telepon', str(a, 'phone'), copyable: true),
        InfoRow('Email', str(a, 'email'), copyable: true),
        InfoRow('Alamat', str(a, 'address')),
        InfoRow('Router', str(mapOf(a, 'router'), 'name') ?? 'Semua router'),
        InfoRow('Saldo minimum', a['minBalance'] == null ? null : formatCurrency(numOf(a, 'minBalance'))),
        InfoRow('Terdaftar', formatDateOrNull(dateOf(a, 'createdAt'))),
        InfoRow('Status', a['isActive'] == false ? 'Nonaktif' : 'Aktif'),
      ],
    ),
  ],
  fields: (a) => [
    const FieldSpec('name', 'Nama agent', required: true),
    const FieldSpec('phone', 'No. HP (login agent)', type: FieldType.phone, required: true),
    const FieldSpec('email', 'Email', type: FieldType.email),
    const FieldSpec('address', 'Alamat', type: FieldType.multiline),
    FieldSpec('routerId', 'Router', type: FieldType.select, loadOptions: Lookups.routers, helper: 'Kosongkan: voucher agent berlaku di semua router.'),
    if (a != null) const FieldSpec('isActive', 'Aktif', type: FieldType.toggle, initial: true),
  ],
  initialOf: (a) => {...a, 'routerId': mapOf(a, 'router')?['id'] ?? a['routerId']},
  create: CrudRoutes.postTo('/api/hotspot/agents'),
  update: CrudRoutes.putWithBodyId('/api/hotspot/agents'),
  delete: CrudRoutes.deleteWithQueryId('/api/hotspot/agents'),
  itemActions: [
    CommonActions.form(
      'Ubah Saldo',
      Icons.account_balance_wallet_rounded,
      fields: (a) => [
        FieldSpec.note('Saldo sekarang ${formatCurrency(numOf(a, 'balance'))}.'),
        const FieldSpec(
          'type',
          'Jenis',
          type: FieldType.select,
          required: true,
          initial: 'add',
          options: [('add', 'Tambah saldo'), ('subtract', 'Kurangi saldo')],
        ),
        const FieldSpec('amount', 'Jumlah (Rp)', type: FieldType.integer, required: true, min: 1),
        const FieldSpec('note', 'Catatan'),
      ],
      submitLabel: 'Simpan',
      submit: (a, v) => _api.post('/api/hotspot/agents/balance', data: {'agentId': a['id'], ...v}),
      success: 'Saldo agent diperbarui.',
      kind: ActionKind.primary,
    ),
    CrudAction('Riwayat penjualan', Icons.receipt_long_rounded, (ctx, a) async {
      await Navigator.of(ctx).push(MaterialPageRoute(builder: (_) => AgentHistoryScreen(agent: a)));
      return false;
    }),
  ],
  bulkActions: [
    CrudAction('Aktifkan', Icons.play_circle_outline_rounded, (ctx, sel) async {
      for (final a in (sel['items'] as List).cast<Json>()) {
        await _api.put('/api/hotspot/agents', data: {'id': a['id'], 'isActive': true});
      }
      return true;
    }),
    CrudAction('Nonaktifkan', Icons.pause_circle_outline_rounded, (ctx, sel) async {
      for (final a in (sel['items'] as List).cast<Json>()) {
        await _api.put('/api/hotspot/agents', data: {'id': a['id'], 'isActive': false});
      }
      return true;
    }),
  ],
);

class AgentHistoryScreen extends StatefulWidget {
  const AgentHistoryScreen({super.key, required this.agent});
  final Json agent;

  @override
  State<AgentHistoryScreen> createState() => _AgentHistoryScreenState();
}

class _AgentHistoryScreenState extends State<AgentHistoryScreen> {
  DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);
  Json? _data;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _data = null;
      _error = null;
    });
    try {
      final res = await _api.get('/api/hotspot/agents/${widget.agent['id']}/history', query: {'month': _month.month, 'year': _month.year});
      if (mounted) setState(() => _data = res is Map ? res.cast<String, dynamic>() : {});
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _shift(int months) {
    _month = DateTime(_month.year, _month.month + months);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final list = extractList(_data, listKey: 'sales');
    return Scaffold(
      appBar: AppBar(title: Text('Penjualan ${widget.agent['name'] ?? ''}')),
      body: ListView(
        padding: EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, listBottomPadding(context)),
        children: [
          Row(
            children: [
              IconButton(icon: const Icon(Icons.chevron_left_rounded), onPressed: () => _shift(-1)),
              Expanded(
                child: Center(
                  child: Text(formatDate(_month).split(' ').skip(1).join(' '), style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),
              IconButton(icon: const Icon(Icons.chevron_right_rounded), onPressed: () => _shift(1)),
            ],
          ),
          if (_error != null) Text(_error!, style: TextStyle(color: context.tone(Tone.danger))),
          if (_data == null && _error == null)
            const Padding(
              padding: EdgeInsets.all(Gap.xl),
              child: Center(child: CircularProgressIndicator()),
            ),
          if (_data != null) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(Gap.lg),
                child: Row(
                  children: [
                    Expanded(
                      child: LabeledFigure(label: 'Voucher terjual', value: '${_data!['count'] ?? list.length}', valueSize: 18),
                    ),
                    Expanded(
                      child: LabeledFigure(label: 'Komisi agent', value: formatCurrency(numOf(_data, 'total')), valueSize: 18),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: Gap.md),
            for (final h in list)
              Padding(
                padding: const EdgeInsets.only(bottom: Gap.sm),
                child: EntityTile(
                  icon: Icons.confirmation_number_rounded,
                  tone: Tone.success,
                  title: str(h, 'voucherCode') ?? '-',
                  subtitle: str(h, 'profileName'),
                  meta: formatDateTimeOrNull(dateOf(h, 'createdAt')),
                  trailing: Text('+${formatCurrency(numOf(h, 'amount'))}', style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

/// Voucher hotspot — mirrors /admin/hotspot/voucher.
CrudConfig vouchersConfig() {
  Json profileOf(Json v) => mapOf(v, 'profile') ?? const {};
  List<Json> sel(Json s) => (s['items'] as List).cast<Json>();

  return CrudConfig(
    title: 'Voucher Hotspot',
    noun: 'Voucher',
    icon: Icons.confirmation_number_rounded,
    fetch: (q) => _api.get('/api/hotspot/voucher', query: {'limit': 300, ...q}),
    listKey: 'vouchers',
    searchParam: 'search',
    searchHint: 'Cari kode voucher atau batch',
    filters: const [('all', 'Semua'), ('WAITING', 'Belum dipakai'), ('ACTIVE', 'Aktif'), ('EXPIRED', 'Kedaluwarsa')],
    fetchLimitNote: 'Menampilkan maksimal 300 voucher terbaru. Gunakan pencarian untuk batch tertentu.',
    titleOf: (v) => str(v, 'code') ?? '-',
    subtitleOf: (v) => [str(profileOf(v), 'name'), str(v, 'batchCode')].whereType<String>().join(' · '),
    metaOf: (v) => [
      str(mapOf(v, 'agent'), 'name'),
      str(mapOf(v, 'router'), 'name'),
      if (v['expiresAt'] != null) 'Exp ${formatDateTimeOrNull(dateOf(v, 'expiresAt'))}',
    ].whereType<String>().join(' · '),
    toneOf: (v) => statusTone(str(v, 'status') ?? 'WAITING'),
    trailingOf: (context, v) => StatusPill.status(str(v, 'status') ?? 'WAITING'),
    figureLabel: 'Harga jual',
    figureOf: (v) => formatCurrency(numOf(profileOf(v), 'sellingPrice')),
    sectionsOf: (context, v) => [
      DetailSection(
        title: 'Login',
        rows: [
          InfoRow('Kode / Username', str(v, 'code'), copyable: true),
          InfoRow('Password', str(v, 'password') ?? 'Sama dengan kode', copyable: v['password'] != null),
          InfoRow('Masa berlaku', validityText(profileOf(v))),
        ],
      ),
      DetailSection(
        title: 'Pemakaian',
        rows: [
          InfoRow('Login pertama', formatDateTimeOrNull(dateOf(v, 'firstLoginAt'))),
          InfoRow('Kedaluwarsa', formatDateTimeOrNull(dateOf(v, 'expiresAt'))),
          InfoRow('Dipakai oleh', str(v, 'lastUsedBy')),
        ],
      ),
      DetailSection(
        title: 'Asal',
        rows: [
          InfoRow('Batch', str(v, 'batchCode'), copyable: true),
          InfoRow('Router', str(mapOf(v, 'router'), 'name')),
          InfoRow('Agent', str(mapOf(v, 'agent'), 'name')),
          InfoRow('Dibuat', formatDateTimeOrNull(dateOf(v, 'createdAt'))),
        ],
      ),
    ],
    fields: (_) => [
      FieldSpec('profileId', 'Profil', type: FieldType.select, required: true, loadOptions: Lookups.hotspotProfiles),
      const FieldSpec('quantity', 'Jumlah voucher', type: FieldType.integer, required: true, initial: 10, min: 1, max: 25000),
      FieldSpec('routerId', 'Router', type: FieldType.select, loadOptions: Lookups.routers, helper: 'Kosongkan: berlaku di semua router.'),
      FieldSpec('agentId', 'Agent', type: FieldType.select, loadOptions: Lookups.agents),
      const FieldSpec.section('Format kode'),
      const FieldSpec('prefix', 'Awalan'),
      const FieldSpec('codeLength', 'Panjang kode', type: FieldType.integer, initial: 6, min: 4, max: 16),
      const FieldSpec(
        'codeType',
        'Jenis karakter',
        type: FieldType.select,
        initial: 'alpha-upper',
        options: [
          ('alpha-upper', 'Huruf besar (ABCD)'),
          ('alpha-lower', 'Huruf kecil (abcd)'),
          ('alpha-mixed', 'Huruf campur (AbCd)'),
          ('alpha-camel', 'Huruf selang-seling (aBcD)'),
          ('numeric', 'Angka (1234)'),
          ('alphanumeric-upper', 'Huruf besar + angka'),
          ('alphanumeric-lower', 'Huruf kecil + angka'),
          ('alphanumeric-mixed', 'Huruf campur + angka'),
        ],
      ),
      const FieldSpec(
        'voucherType',
        'Password',
        type: FieldType.select,
        initial: 'same',
        options: [('same', 'Sama dengan kode'), ('different', 'Berbeda dari kode')],
      ),
      const FieldSpec('lockMac', 'Kunci ke MAC pertama', type: FieldType.toggle),
    ],
    createLabel: 'Buat Voucher',
    create: (v) => _api.postLong('/api/hotspot/voucher', data: v),
    canEdit: (_) => false,
    delete: CrudRoutes.deleteById('/api/hotspot/voucher'),
    deleteMessage: (v) => 'Voucher ${v['code']} dihapus dari sistem, RADIUS, dan MikroTik.',
    itemActions: [
      CrudAction('Bagikan', Icons.share_rounded, (ctx, v) async {
        final p = profileOf(v);
        await Share.share(
          'Voucher internet ${str(p, 'name') ?? ''}\nKode: ${v['code']}${v['password'] != null ? '\nPassword: ${v['password']}' : ''}\nMasa berlaku: ${validityText(p)}',
        );
        return false;
      }),
      CrudAction('Kirim ke WhatsApp', Icons.chat_rounded, (ctx, v) => _sendWa(ctx, [v])),
      CrudAction(
        'Hapus seluruh batch',
        Icons.delete_sweep_rounded,
        (ctx, v) async {
          final ok = await confirmAction(
            ctx,
            title: 'Hapus Batch ${v['batchCode']}?',
            message: 'Semua voucher di batch ini dihapus.',
            confirmLabel: 'Hapus batch',
            destructive: true,
          );
          if (!ok || !ctx.mounted) return false;
          return runAction(ctx, () => _api.delete('/api/hotspot/voucher', query: {'batchCode': v['batchCode']}), success: 'Batch dihapus.');
        },
        kind: ActionKind.danger,
        visible: (v) => v['batchCode'] != null,
      ),
    ],
    bulkActions: [
      CrudAction('Kirim ke WhatsApp', Icons.chat_rounded, (ctx, s) => _sendWa(ctx, sel(s))),
      CrudAction(
        'Ubah profil / router / agent',
        Icons.edit_rounded,
        (ctx, s) => openForm(
          ctx,
          title: 'Ubah ${sel(s).length} Voucher',
          fields: [
            const FieldSpec.note('Kosongkan yang tidak diubah.'),
            FieldSpec('profileId', 'Profil', type: FieldType.select, loadOptions: Lookups.hotspotProfiles),
            FieldSpec('routerId', 'Router', type: FieldType.select, loadOptions: Lookups.routers),
            const FieldSpec('clearRouter', 'Lepas dari router', type: FieldType.toggle),
            FieldSpec('agentId', 'Agent', type: FieldType.select, loadOptions: Lookups.agents),
            const FieldSpec('clearAgent', 'Lepas dari agent', type: FieldType.toggle),
          ],
          success: 'Voucher diperbarui.',
          onSubmit: (v) => _api.patch(
            '/api/hotspot/voucher',
            data: {
              'ids': [for (final x in sel(s)) x['id']],
              ...{
                for (final e in v.entries)
                  if (!isBlank(e.value) && e.value != false) e.key: e.value,
              },
            },
          ),
        ),
      ),
      CrudAction('Hapus', Icons.delete_outline_rounded, (ctx, s) async {
        final ok = await confirmAction(
          ctx,
          title: 'Hapus ${sel(s).length} Voucher?',
          message: 'Voucher dihapus dari sistem, RADIUS, dan MikroTik.',
          confirmLabel: 'Hapus',
          destructive: true,
        );
        if (!ok || !ctx.mounted) return false;
        return runAction(
          ctx,
          () => _api.postLong(
            '/api/hotspot/voucher/delete-multiple',
            data: {
              'voucherIds': [for (final x in sel(s)) x['id']],
            },
          ),
          success: 'Voucher dihapus.',
        );
      }, kind: ActionKind.danger),
    ],
    toolbar: [
      CrudAction('Profil hotspot', Icons.wifi_rounded, (ctx, _) async {
        await CrudListScreen.open(ctx, hotspotProfilesConfig());
        return true;
      }),
      CrudAction('Template cetak', Icons.print_rounded, (ctx, _) async {
        await CrudListScreen.open(ctx, voucherTemplatesConfig());
        return false;
      }),
      CrudAction('Pesanan e-voucher', Icons.shopping_bag_rounded, (ctx, _) async {
        await CrudListScreen.open(ctx, evoucherOrdersConfig());
        return false;
      }),
      CrudAction('Ekspor Excel', Icons.ios_share_rounded, (ctx, _) async {
        await downloadAndShare(
          ctx,
          '/api/hotspot/voucher/export',
          'voucher-${DateTime.now().toIso8601String().substring(0, 10)}.xlsx',
          query: {'format': 'excel'},
        );
        return false;
      }),
      CommonActions.confirmPost(
        'Sinkron ulang ke RADIUS',
        Icons.sync_rounded,
        (_) => '/api/hotspot/voucher/resync',
        confirm: 'Semua voucher ditulis ulang ke RADIUS dan router.',
        long: true,
      ),
      CommonActions.confirmPost('Perbarui status', Icons.update_rounded, (_) => '/api/hotspot/voucher/sync-status', long: true),
      CommonActions.confirmPost(
        'Hapus yang kedaluwarsa',
        Icons.auto_delete_rounded,
        (_) => '/api/hotspot/voucher/delete-expired',
        confirm: 'Semua voucher berstatus kedaluwarsa dihapus permanen.',
        kind: ActionKind.danger,
        long: true,
      ),
    ],
  );
}

Future<bool> _sendWa(BuildContext ctx, List<Json> vouchers) {
  return openForm(
    ctx,
    title: 'Kirim ${vouchers.length} Voucher',
    submitLabel: 'Kirim',
    fields: const [FieldSpec('phone', 'No. WhatsApp tujuan', type: FieldType.phone, required: true, hint: '08xxxxxxxxxx')],
    success: 'Voucher dikirim ke WhatsApp.',
    onSubmit: (v) => _api.post(
      '/api/hotspot/voucher/send-whatsapp',
      data: {
        'phone': v['phone'],
        'vouchers': [
          for (final x in vouchers)
            {
              'code': x['code'],
              'profileName': mapOf(x, 'profile')?['name'],
              'price': numOf(mapOf(x, 'profile'), 'sellingPrice'),
              'validity': validityText(mapOf(x, 'profile')),
            },
        ],
      },
    ),
  );
}

/// Pesanan e-voucher online — mirrors /admin/hotspot/evoucher.
CrudConfig evoucherOrdersConfig() => CrudConfig(
  title: 'Pesanan E-Voucher',
  noun: 'Pesanan',
  icon: Icons.shopping_bag_rounded,
  tone: Tone.violet,
  fetch: (_) => _api.get('/api/admin/evoucher/orders'),
  listKey: 'orders',
  filters: const [('all', 'Semua'), ('PENDING', 'Menunggu'), ('PAID', 'Dibayar'), ('CANCELLED', 'Batal'), ('EXPIRED', 'Kedaluwarsa')],
  filterOf: (o) => str(o, 'status'),
  initialFilter: 'all',
  titleOf: (o) => str(o, 'customerName') ?? str(o, 'orderNumber') ?? '-',
  subtitleOf: (o) => [str(o, 'orderNumber'), str(mapOf(o, 'profile'), 'name')].whereType<String>().join(' · '),
  metaOf: (o) => [str(o, 'customerPhone'), formatDateTimeOrNull(dateOf(o, 'createdAt'))].whereType<String>().join(' · '),
  toneOf: (o) => statusTone(str(o, 'status') ?? ''),
  trailingOf: (context, o) => AmountTrailing(amount: formatCurrency(numOf(o, 'totalAmount')), pill: StatusPill.status(str(o, 'status') ?? '')),
  sectionsOf: (context, o) => [
    DetailSection(
      rows: [
        InfoRow('No. pesanan', str(o, 'orderNumber'), copyable: true),
        InfoRow('Pelanggan', str(o, 'customerName')),
        InfoRow('Telepon', str(o, 'customerPhone'), copyable: true),
        InfoRow('Email', str(o, 'customerEmail')),
        InfoRow('Paket', str(mapOf(o, 'profile'), 'name')),
        InfoRow('Jumlah', str(o, 'quantity')),
        InfoRow('Total', formatCurrency(numOf(o, 'totalAmount'))),
        InfoRow('Metode', str(o, 'paymentMethod') ?? str(o, 'paymentGateway')),
        InfoRow('Dibayar', formatDateTimeOrNull(dateOf(o, 'paidAt'))),
        InfoRow('Voucher', (o['vouchers'] as List?)?.whereType<Map>().map((v) => v['code']).join(', '), copyable: true),
      ],
    ),
  ],
  itemActions: [
    CommonActions.confirmPost(
      'Kirim ulang voucher',
      Icons.send_rounded,
      (o) => '/api/admin/evoucher/orders/${o['id']}/resend',
      confirm: 'Kode voucher dikirim ulang ke pelanggan.',
      visible: (o) => o['status'] == 'PAID',
    ),
    CommonActions.confirmPost(
      'Batalkan pesanan',
      Icons.cancel_rounded,
      (o) => '/api/admin/evoucher/orders/${o['id']}/cancel',
      confirm: 'Pesanan dibatalkan.',
      kind: ActionKind.danger,
      visible: (o) => o['status'] == 'PENDING',
    ),
  ],
  bulkActions: [
    CrudAction('Hapus', Icons.delete_outline_rounded, (ctx, s) async {
      final ids = [for (final o in (s['items'] as List).cast<Json>()) o['id']];
      final ok = await confirmAction(
        ctx,
        title: 'Hapus ${ids.length} Pesanan?',
        message: 'Riwayat pesanan dihapus permanen.',
        confirmLabel: 'Hapus',
        destructive: true,
      );
      if (!ok || !ctx.mounted) return false;
      return runAction(ctx, () => _api.post('/api/admin/evoucher/orders/bulk-delete', data: {'orderIds': ids}), success: 'Pesanan dihapus.');
    }, kind: ActionKind.danger),
  ],
);
