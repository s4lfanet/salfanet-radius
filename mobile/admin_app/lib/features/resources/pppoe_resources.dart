import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/crud/crud_list_screen.dart';
import '../../core/crud/lookups.dart';
import '../../core/formatters.dart';
import '../../core/forms/field_spec.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/entity_tile.dart';

final _api = ApiClient.instance;

Widget _activePill(Json i, {String key = 'isActive'}) =>
    i[key] == false ? const StatusPill(label: 'Nonaktif', tone: Tone.neutral) : const StatusPill(label: 'Aktif', tone: Tone.success);

const _validityUnits = [('HOURS', 'Jam'), ('DAYS', 'Hari'), ('MONTHS', 'Bulan')];

/// Paket PPPoE — mirrors /admin/pppoe/profiles.
CrudConfig pppoeProfilesConfig() {
  String speed(Json p) => '${p['downloadSpeed'] ?? '-'}/${p['uploadSpeed'] ?? '-'} Mbps';
  bool isBurst(Object? rl) => rl is String && rl.trim().split(RegExp(r'\s+')).length >= 3;

  Json payload(Json v, Json? item) {
    final dl = v['downloadSpeed'] ?? 0;
    final ul = v['uploadSpeed'] ?? 0;
    final name = (v['name'] as String?) ?? '';
    return {
      ...v,
      'groupName': (v['groupName'] as String?)?.isNotEmpty == true ? v['groupName'] : name,
      'rateLimit': (v['rateLimit'] as String?)?.isNotEmpty == true ? v['rateLimit'] : '${dl}M/${ul}M',
      'ppnRate': v['ppnActive'] == true ? (v['ppnRate'] ?? 11) : null,
    };
  }

  return CrudConfig(
    title: 'Paket PPPoE',
    noun: 'Paket',
    icon: Icons.speed_rounded,
    fetch: (_) => _api.get('/api/pppoe/profiles'),
    listKey: 'profiles',
    titleOf: (p) => str(p, 'name') ?? '-',
    subtitleOf: (p) =>
        '${speed(p)} · ${p['validityValue'] ?? 1} ${_validityUnits.firstWhere((u) => u.$1 == p['validityUnit'], orElse: () => ('', '')).$2.toLowerCase()}',
    metaOf: (p) => [
      if (p['syncedToRadius'] == true) 'Tersinkron RADIUS' else 'Belum sinkron RADIUS',
      if (p['_count'] is Map) '${(p['_count'] as Map)['users'] ?? 0} pelanggan',
    ].join(' · '),
    trailingOf: (context, p) => AmountTrailing(amount: formatCurrency(numOf(p, 'price')), pill: p['isActive'] == false ? _activePill(p) : null),
    sectionsOf: (context, p) => [
      DetailSection(
        title: 'Harga',
        rows: [
          InfoRow('Harga jual', formatCurrency(numOf(p, 'price'))),
          InfoRow('HPP', p['hpp'] == null ? null : formatCurrency(numOf(p, 'hpp'))),
          InfoRow('PPN', p['ppnActive'] == true ? '${p['ppnRate'] ?? 11}%' : 'Tidak'),
        ],
      ),
      DetailSection(
        title: 'Layanan',
        rows: [
          InfoRow('Kecepatan', speed(p)),
          InfoRow('Rate limit', str(p, 'rateLimit'), copyable: true),
          InfoRow('Masa aktif', '${p['validityValue']} ${_validityUnits.firstWhere((u) => u.$1 == p['validityUnit'], orElse: () => ('', '-')).$2}'),
          InfoRow('Group RADIUS', str(p, 'groupName'), copyable: true),
          InfoRow('Profil MikroTik', str(p, 'mikrotikProfileName')),
          InfoRow('Pool RADIUS', str(p, 'radiusPoolName')),
          InfoRow('IP Pool MikroTik', str(p, 'ipPoolName')),
          InfoRow('Rentang pool', str(p, 'ipPoolRange')),
          InfoRow('Local address', str(p, 'localAddress')),
          InfoRow('Satu perangkat', p['sharedUser'] == true ? 'Ya' : 'Tidak'),
          InfoRow('Status', p['isActive'] == false ? 'Nonaktif' : 'Aktif'),
          InfoRow('Deskripsi', str(p, 'description')),
        ],
      ),
    ],
    fields: (item) => [
      const FieldSpec('name', 'Nama paket', required: true, hint: 'mis. Paket 20 Mbps'),
      const FieldSpec('description', 'Deskripsi'),
      const FieldSpec.section('Harga'),
      const FieldSpec('price', 'Harga jual (Rp)', type: FieldType.integer, required: true, min: 0),
      const FieldSpec('hpp', 'HPP / harga modal (Rp)', type: FieldType.integer, min: 0),
      const FieldSpec('ppnActive', 'PPN aktif', type: FieldType.toggle),
      FieldSpec('ppnRate', 'Tarif PPN (%)', type: FieldType.integer, initial: 11, visibleIf: (v) => v['ppnActive'] == true),
      const FieldSpec.section('Kecepatan & masa aktif'),
      const FieldSpec('downloadSpeed', 'Download (Mbps)', type: FieldType.integer, required: true, initial: 10, min: 0),
      const FieldSpec('uploadSpeed', 'Upload (Mbps)', type: FieldType.integer, required: true, initial: 10, min: 0),
      const FieldSpec(
        'rateLimit',
        'Rate limit MikroTik (burst)',
        hint: '10M/10M 20M/20M 8M/8M 8',
        helper: 'Kosongkan untuk memakai kecepatan di atas. Isi hanya jika memakai burst / priority.',
      ),
      const FieldSpec('validityValue', 'Masa aktif', type: FieldType.integer, required: true, initial: 1, min: 1),
      const FieldSpec('validityUnit', 'Satuan masa aktif', type: FieldType.select, options: _validityUnits, initial: 'MONTHS', required: true),
      const FieldSpec.section('RADIUS'),
      const FieldSpec('groupName', 'Group RADIUS', helper: 'Kosongkan untuk memakai nama paket.'),
      FieldSpec('radiusPoolName', 'IP Pool RADIUS', type: FieldType.select, loadOptions: Lookups.ipPools, helper: 'Kosongkan: otomatis dari tier kecepatan.'),
      const FieldSpec('sharedUser', 'Satu perangkat per akun', type: FieldType.toggle, initial: true),
      const FieldSpec('isActive', 'Paket aktif', type: FieldType.toggle, initial: true),
    ],
    initialOf: (p) => {...p, 'rateLimit': isBurst(p['rateLimit']) ? p['rateLimit'] : null},
    create: (v) => _api.post('/api/pppoe/profiles', data: payload(v, null)),
    update: (item, v) => _api.put('/api/pppoe/profiles', data: {'id': item['id'], ...payload(v, item)}),
    delete: CrudRoutes.deleteWithQueryId('/api/pppoe/profiles'),
    deleteMessage: (p) => 'Paket "${p['name']}" akan dihapus. Paket yang masih dipakai pelanggan tidak bisa dihapus.',
    itemActions: [
      CommonActions.confirmPost('Sinkron ke RADIUS', Icons.sync_rounded, (_) => '/api/pppoe/profiles/sync-radius', body: (p) => {'id': p['id']}),
      CommonActions.form(
        'Sinkron ke MikroTik',
        Icons.router_rounded,
        fields: (p) => [
          const FieldSpec.note('Membuat/memperbarui PPP profile dan IP pool di router yang dipilih.'),
          FieldSpec('routerIds', 'Router', type: FieldType.multiSelect, required: true, loadOptions: Lookups.routers),
          const FieldSpec('ipPoolName', 'Nama IP pool MikroTik'),
          const FieldSpec('localAddress', 'Local address', hint: '10.10.10.1'),
          const FieldSpec('poolRanges', 'Rentang pool', hint: '10.10.10.2-10.10.10.254'),
        ],
        initial: (p) => {
          'routerIds': [if (p['lastRouterId'] != null) p['lastRouterId']],
          'ipPoolName': p['ipPoolName'],
          'localAddress': p['localAddress'],
          'poolRanges': p['ipPoolRange'],
        },
        submitLabel: 'Sinkron',
        submit: (p, v) => _api.postLong('/api/pppoe/profiles/sync-mikrotik', data: {'id': p['id'], ...v}),
        success: 'Paket disinkron ke MikroTik.',
      ),
    ],
    toolbar: [
      CommonActions.confirmPost(
        'Sinkron semua ke RADIUS',
        Icons.sync_rounded,
        (_) => '/api/pppoe/profiles/sync-radius',
        confirm: 'Semua paket akan ditulis ulang ke tabel RADIUS (radgroupreply).',
        long: true,
      ),
    ],
  );
}

/// Area — mirrors /admin/pppoe/areas.
CrudConfig pppoeAreasConfig() => CrudConfig(
  title: 'Area',
  noun: 'Area',
  icon: Icons.map_rounded,
  tone: Tone.accent,
  fetch: (_) => _api.get('/api/pppoe/areas'),
  listKey: 'areas',
  titleOf: (a) => str(a, 'name') ?? '-',
  subtitleOf: (a) => str(a, 'description'),
  metaOf: (a) => a['_count'] is Map ? '${(a['_count'] as Map)['users'] ?? 0} pelanggan' : null,
  statusOf: (a) => _activePill(a),
  fields: (_) => const [
    FieldSpec('name', 'Nama area', required: true),
    FieldSpec('description', 'Deskripsi', type: FieldType.multiline),
    FieldSpec('isActive', 'Area aktif', type: FieldType.toggle, initial: true),
  ],
  create: CrudRoutes.postTo('/api/pppoe/areas'),
  update: CrudRoutes.putWithBodyId('/api/pppoe/areas'),
  delete: CrudRoutes.deleteWithQueryId('/api/pppoe/areas'),
  deleteMessage: (a) => 'Area "${a['name']}" akan dihapus. Area yang masih punya pelanggan tidak bisa dihapus.',
);

/// Add-on layanan — mirrors /admin/pppoe/addons.
CrudConfig addonTypesConfig() => CrudConfig(
  title: 'Add-on Layanan',
  noun: 'Add-on',
  icon: Icons.extension_rounded,
  tone: Tone.violet,
  fetch: (_) => _api.get('/api/addon-types'),
  listKey: 'addons',
  titleOf: (a) => str(a, 'name') ?? '-',
  subtitleOf: (a) => a['isRecurring'] == true ? 'Bulanan' : 'Sekali bayar',
  metaOf: (a) => str(a, 'description'),
  trailingOf: (context, a) => AmountTrailing(amount: formatCurrency(numOf(a, 'price')), pill: _activePill(a)),
  fields: (_) => const [
    FieldSpec('name', 'Nama add-on', required: true, hint: 'mis. IP Publik'),
    FieldSpec('description', 'Deskripsi'),
    FieldSpec('price', 'Harga (Rp)', type: FieldType.integer, required: true, min: 0),
    FieldSpec('isRecurring', 'Ditagih setiap bulan', type: FieldType.toggle, initial: true, helper: 'Mati = hanya ditagih sekali.'),
    FieldSpec('isActive', 'Aktif', type: FieldType.toggle, initial: true),
  ],
  create: CrudRoutes.postTo('/api/addon-types'),
  update: CrudRoutes.putById('/api/addon-types'),
  delete: CrudRoutes.deleteById('/api/addon-types'),
);

/// IP Pool RADIUS — mirrors /admin/ippool (pools).
CrudConfig ipPoolsConfig() => CrudConfig(
  title: 'IP Pool RADIUS',
  noun: 'IP Pool',
  icon: Icons.lan_rounded,
  tone: Tone.accent,
  fetch: (_) => _api.get('/api/admin/ippool'),
  listKey: 'data',
  titleOf: (p) => str(p, 'pool_name') ?? '-',
  subtitleOf: (p) => '${p['start_ip'] ?? '-'} – ${p['end_ip'] ?? '-'}',
  metaOf: (p) => '${p['total_ips'] ?? 0} alamat IP',
  sectionsOf: (context, p) => [
    DetailSection(
      rows: [
        InfoRow('Nama pool', str(p, 'pool_name'), copyable: true),
        InfoRow('IP awal', str(p, 'start_ip')),
        InfoRow('IP akhir', str(p, 'end_ip')),
        InfoRow('Jumlah IP', str(p, 'total_ips')),
      ],
    ),
  ],
  header: (context, items) => Card(
    child: ListTile(
      leading: const Icon(Icons.account_tree_rounded),
      title: const Text('Mapping pool ke group', style: TextStyle(fontWeight: FontWeight.w700)),
      subtitle: const Text('Group RADIUS mana memakai pool mana'),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: () => CrudListScreen.open(context, ipPoolMappingsConfig()),
    ),
  ),
  fields: (_) => const [
    FieldSpec('pool_name', 'Nama pool', required: true, hint: 'mis. pool-20mbps'),
    FieldSpec(
      'network',
      'Network (3 oktet)',
      required: true,
      hint: '10.20.30',
      helper: 'Tanpa oktet terakhir. IP dibuat dari network.awal sampai network.akhir.',
    ),
    FieldSpec('start', 'Oktet awal', type: FieldType.integer, required: true, initial: 2, min: 1, max: 254),
    FieldSpec('end', 'Oktet akhir', type: FieldType.integer, required: true, initial: 254, min: 1, max: 254),
  ],
  create: CrudRoutes.postTo('/api/admin/ippool'),
  delete: (p) => _api.delete('/api/admin/ippool', query: {'poolName': p['pool_name']}),
  deleteMessage: (p) => 'Semua ${p['total_ips'] ?? ''} alamat di pool "${p['pool_name']}" akan dihapus.',
  itemActions: [
    CommonActions.form(
      'Perluas Pool',
      Icons.add_box_rounded,
      fields: (p) => const [
        FieldSpec.note('Tambah rentang IP ke pool ini (boleh dari network lain).'),
        FieldSpec('network', 'Network (3 oktet)', required: true, hint: '10.20.31'),
        FieldSpec('start', 'Oktet awal', type: FieldType.integer, required: true, initial: 2, min: 1, max: 254),
        FieldSpec('end', 'Oktet akhir', type: FieldType.integer, required: true, initial: 254, min: 1, max: 254),
      ],
      submitLabel: 'Tambahkan',
      submit: (p, v) => _api.put('/api/admin/ippool/expand', data: {'pool_name': p['pool_name'], ...v}),
      success: 'Pool diperluas.',
    ),
  ],
);

CrudConfig ipPoolMappingsConfig() => CrudConfig(
  title: 'Mapping IP Pool',
  noun: 'Mapping',
  icon: Icons.account_tree_rounded,
  tone: Tone.accent,
  fetch: (_) => _api.get('/api/admin/ippool/mappings/list'),
  listKey: 'data',
  titleOf: (m) => str(m, 'groupname') ?? '-',
  subtitleOf: (m) => 'Pool: ${m['pool_name'] ?? '-'}',
  fields: (_) => [
    const FieldSpec('groupname', 'Group RADIUS', required: true, helper: 'Sama dengan Group RADIUS pada paket.'),
    FieldSpec('pool_name', 'IP Pool', type: FieldType.select, required: true, loadOptions: Lookups.ipPools),
  ],
  create: CrudRoutes.postTo('/api/admin/ippool/mappings'),
  delete: CrudRoutes.deleteById('/api/admin/ippool/mappings'),
);
