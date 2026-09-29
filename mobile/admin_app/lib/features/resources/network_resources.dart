import 'dart:math';

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
import '../../core/widgets/result_screen.dart';
import 'olt_resources.dart';

final _api = ApiClient.instance;
Json _map(dynamic res) => res is Map ? res.cast<String, dynamic>() : <String, dynamic>{};

const _statusOptions = [('active', 'Aktif'), ('inactive', 'Nonaktif'), ('maintenance', 'Perbaikan'), ('damaged', 'Rusak')];
const _cableTypes = ['GPON', 'ADSS', 'OPGW', 'Figure_8', 'Aerial', 'Underground', 'Indoor'];

Widget _statusPill(Json i, {String key = 'status'}) {
  final s = str(i, key) ?? 'active';
  final tone = switch (s) {
    'active' => Tone.success,
    'maintenance' => Tone.warning,
    'damaged' => Tone.danger,
    _ => Tone.neutral,
  };
  return StatusPill(
    label: _statusOptions.firstWhere((o) => o.$1 == s, orElse: () => (s, s)).$2,
    tone: tone,
  );
}

String? _coords(Json i) => i['latitude'] == null ? null : '${i['latitude']}, ${i['longitude']}';

String _secret() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  final r = Random.secure();
  return List.generate(16, (_) => chars[r.nextInt(chars.length)]).join();
}

/// Router / NAS — mirrors /admin/network/routers.
CrudConfig routersConfig() => CrudConfig(
  title: 'Router / NAS',
  noun: 'Router',
  icon: Icons.router_rounded,
  fetch: (_) async {
    final res = _map(await _api.get('/api/network/routers'));
    final routers = extractList(res, listKey: 'routers');
    if (routers.isNotEmpty) {
      try {
        final st = _map(
          await _api.post(
            '/api/network/routers/status',
            data: {
              'routerIds': [for (final r in routers) r['id']],
            },
          ),
        );
        final map = mapOf(st, 'statusMap') ?? {};
        for (final r in routers) {
          r['_status'] = map['${r['id']}'];
        }
      } on ApiException catch (_) {}
    }
    return {'routers': routers};
  },
  listKey: 'routers',
  titleOf: (r) => str(r, 'name') ?? '-',
  subtitleOf: (r) => '${r['nasname'] ?? r['ipAddress'] ?? '-'} · ${(str(r, 'authMode') ?? 'radius').toUpperCase()}',
  metaOf: (r) => [
    str(mapOf(r, '_status'), 'identity'),
    if (mapOf(r, '_status')?['uptime'] != null) 'Up ${mapOf(r, '_status')!['uptime']}',
    str(mapOf(r, 'vpnClient'), 'name'),
  ].whereType<String>().join(' · '),
  toneOf: (r) => mapOf(r, '_status')?['online'] == true ? Tone.success : Tone.danger,
  statusOf: (r) => mapOf(r, '_status') == null
      ? null
      : StatusPill(
          label: mapOf(r, '_status')!['online'] == true ? 'Online' : 'Offline',
          tone: mapOf(r, '_status')!['online'] == true ? Tone.success : Tone.danger,
        ),
  sectionsOf: (context, r) => [
    DetailSection(
      title: 'Koneksi',
      rows: [
        InfoRow('Jenis', str(r, 'type')),
        InfoRow('Mode auth', (str(r, 'authMode') ?? 'radius').toUpperCase()),
        InfoRow('IP API', str(r, 'ipAddress'), copyable: true),
        InfoRow('NAS IP', str(r, 'nasname'), copyable: true),
        InfoRow('Port API', str(r, 'port')),
        InfoRow('Username API', str(r, 'username'), copyable: true),
        InfoRow('RADIUS secret', str(r, 'secret'), copyable: true),
        InfoRow('VPN client', str(mapOf(r, 'vpnClient'), 'name')),
        InfoRow('Identity', str(mapOf(r, '_status'), 'identity')),
        InfoRow('Uptime', str(mapOf(r, '_status'), 'uptime')),
        InfoRow('Lokasi', _coords(r)),
        InfoRow('Deskripsi', str(r, 'description')),
      ],
    ),
  ],
  fields: (r) => [
    const FieldSpec('name', 'Nama router', required: true),
    const FieldSpec(
      'type',
      'Jenis',
      type: FieldType.select,
      required: true,
      initial: 'mikrotik',
      options: [('mikrotik', 'MikroTik'), ('gateway', 'Gateway / VPS'), ('other', 'Lainnya')],
    ),
    const FieldSpec(
      'authMode',
      'Mode autentikasi',
      type: FieldType.select,
      required: true,
      initial: 'radius',
      options: [('radius', 'RADIUS — semua auth via FreeRADIUS'), ('local', 'Local — PPP secret di MikroTik')],
    ),
    FieldSpec(
      'vpnClientId',
      'Lewat VPN client',
      type: FieldType.select,
      loadOptions: Lookups.vpnClients,
      helper: 'IP API diisi otomatis dari IP VPN bila kosong.',
    ),
    const FieldSpec('ipAddress', 'IP / host API', helper: 'Kosongkan bila memakai VPN client.'),
    const FieldSpec('nasIpAddress', 'NAS IP (sumber paket RADIUS)', helper: 'Kosongkan: sama dengan IP API.'),
    const FieldSpec('port', 'Port API', type: FieldType.integer, initial: 8728),
    const FieldSpec('username', 'Username API', required: true),
    FieldSpec('password', r == null ? 'Password API' : 'Password API baru', type: FieldType.password, required: r == null, omitWhenEmpty: r != null),
    FieldSpec('secret', 'RADIUS secret', required: true, initial: _secret()),
    const FieldSpec('latitude', 'Lokasi', type: FieldType.location, pairKey: 'longitude'),
    const FieldSpec('description', 'Deskripsi'),
    if (r != null) const FieldSpec('isActive', 'Aktif', type: FieldType.toggle, initial: true),
  ],
  initialOf: (r) => {...r, 'password': null, 'nasIpAddress': r['nasname'], 'vpnClientId': r['vpnClientId'] ?? mapOf(r, 'vpnClient')?['id']},
  create: (v) async {
    if (isBlank(v['ipAddress']) && !isBlank(v['vpnClientId'])) {
      final clients = extractList(await _api.get('/api/network/vpn-client'), listKey: 'clients');
      v['ipAddress'] = clients.firstWhere((c) => c['id'] == v['vpnClientId'], orElse: () => {})['vpnIp'];
    }
    await _api.post('/api/network/routers', data: v);
  },
  update: (r, v) => _api.put('/api/network/routers', data: {'id': r['id'], ...v, 'nasname': isBlank(v['nasIpAddress']) ? v['ipAddress'] : v['nasIpAddress']}),
  delete: CrudRoutes.deleteWithQueryId('/api/network/routers'),
  itemActions: [
    CrudAction('Tes koneksi API', Icons.network_check_rounded, (ctx, r) async {
      final res = _map(
        await _api.post(
          '/api/network/routers/test',
          data: {'ipAddress': r['ipAddress'], 'username': r['username'], 'password': r['password'], 'port': r['port']},
        ),
      );
      if (!ctx.mounted) return false;
      showToast(
        ctx,
        res['success'] == true
            ? 'Terhubung ke ${res['identity'] ?? 'router'} (port ${res['usedPort'] ?? r['port']}).'
            : '${res['message'] ?? 'Gagal terhubung.'}',
      );
      return false;
    }),
    CrudAction('Ping gateway', Icons.wifi_tethering_rounded, (ctx, r) async {
      final res = _map(await _api.post('/api/network/routers/test-gateway', data: {'ipAddress': r['ipAddress']}));
      if (ctx.mounted) showToast(ctx, str(res, 'message') ?? (res['success'] == true ? 'Terjangkau.' : 'Tidak terjangkau.'));
      return false;
    }),
    CommonActions.showResult(
      'Script RADIUS',
      Icons.code_rounded,
      (r) => '/api/network/routers/${r['id']}/setup-radius',
      intro: 'Tempel di terminal MikroTik (pilih versi RouterOS yang sesuai).',
      labels: const {'scriptRos7': 'RouterOS 7', 'scriptRos6': 'RouterOS 6', 'script': 'Script'},
    ),
    CommonActions.showResult(
      'Script isolir',
      Icons.block_rounded,
      (r) => '/api/network/routers/${r['id']}/setup-isolir',
      intro: 'Script firewall & pool isolir untuk router ini.',
    ),
    CommonActions.showResult('Deteksi IP publik', Icons.public_rounded, (r) => '/api/network/routers/${r['id']}/detect-public-ip'),
    CommonActions.showResult('Interface', Icons.settings_ethernet_rounded, (r) => '/api/network/routers/${r['id']}/interfaces', method: 'GET'),
    CommonActions.form(
      'Ping ke OLT',
      Icons.dns_rounded,
      fields: (_) => [
        FieldSpec('oltId', 'OLT', type: FieldType.select, required: true, loadOptions: Lookups.olts),
        const FieldSpec('count', 'Jumlah ping', type: FieldType.integer, initial: 4),
      ],
      submitLabel: 'Ping',
      submit: (r, v) async {
        final res = _map(await _api.postLong('/api/network/routers/${r['id']}/ping-olt', data: v));
        throw ApiException(
          res['success'] == true ? 'Ping berhasil: ${res['details'] ?? res['message'] ?? 'OK'}' : 'Ping gagal: ${res['details'] ?? res['message'] ?? '-'}',
        );
      },
    ),
    CrudAction('Uplink ke OLT', Icons.cable_rounded, (ctx, r) async {
      await CrudListScreen.open(ctx, routerUplinksConfig(r));
      return false;
    }),
  ],
);

CrudConfig routerUplinksConfig(Json router) => CrudConfig(
  title: 'Uplink ${router['name'] ?? ''}',
  noun: 'Uplink',
  icon: Icons.cable_rounded,
  searchable: false,
  fetch: (_) => _api.get('/api/network/routers/${router['id']}/uplinks'),
  listKey: 'connections',
  titleOf: (c) => str(c, 'oltName') ?? '-',
  subtitleOf: (c) => 'Port ${c['uplinkPort'] ?? '-'} · prioritas ${c['priority'] ?? 0}',
  metaOf: (c) => str(c, 'oltIp'),
  statusOf: (c) => c['isActive'] == false ? const StatusPill(label: 'Nonaktif', tone: Tone.neutral) : const StatusPill(label: 'Aktif', tone: Tone.success),
  fields: (c) => [
    FieldSpec('oltId', 'OLT', type: FieldType.select, required: true, loadOptions: Lookups.olts),
    const FieldSpec('uplinkPort', 'Port uplink di router', hint: 'ether1'),
    const FieldSpec('priority', 'Prioritas', type: FieldType.integer, initial: 1),
    if (c != null) const FieldSpec('isActive', 'Aktif', type: FieldType.toggle, initial: true),
  ],
  create: CrudRoutes.postTo('/api/network/routers/${router['id']}/uplinks'),
  update: (c, v) => _api.put('/api/network/routers/${router['id']}/uplinks', data: {'connectionId': c['id'], ...v}),
  delete: (c) => _api.delete('/api/network/routers/${router['id']}/uplinks', query: {'connectionId': c['id']}),
);

/// OLT — mirrors /admin/network/olts.
CrudConfig oltsConfig() => CrudConfig(
  title: 'OLT',
  noun: 'OLT',
  icon: Icons.dns_rounded,
  tone: Tone.accent,
  fetch: (_) => _api.get('/api/network/olts'),
  listKey: 'olts',
  titleOf: (o) => str(o, 'name') ?? '-',
  subtitleOf: (o) => '${o['ipAddress'] ?? '-'} · ${(str(o, 'vendor') ?? '').toUpperCase()} ${o['model'] ?? ''}'.trim(),
  metaOf: (o) => o['_count'] is Map ? '${(o['_count'] as Map)['odcs'] ?? 0} ODC · ${(o['_count'] as Map)['odps'] ?? 0} ODP' : null,
  statusOf: _statusPill,
  sectionsOf: (context, o) => [
    DetailSection(
      rows: [
        InfoRow('IP', str(o, 'ipAddress'), copyable: true),
        InfoRow('Vendor', str(o, 'vendor')),
        InfoRow('Model', str(o, 'model')),
        InfoRow('Firmware', str(o, 'firmwareVersion')),
        InfoRow('SSH', o['sshEnabled'] == true ? 'Port ${o['sshPort'] ?? 22}' : 'Mati'),
        InfoRow('Telnet', o['telnetEnabled'] == true ? 'Port ${o['telnetPort'] ?? 23}' : 'Mati'),
        InfoRow('SNMP', '${o['snmpCommunity'] ?? '-'} : ${o['snmpPort'] ?? 161}'),
        InfoRow('Lokasi', _coords(o)),
      ],
    ),
  ],
  fields: (o) => [
    const FieldSpec('name', 'Nama OLT', required: true),
    const FieldSpec('ipAddress', 'IP address', required: true),
    const FieldSpec(
      'vendor',
      'Vendor',
      type: FieldType.select,
      required: true,
      initial: 'huawei',
      options: [
        ('huawei', 'Huawei'),
        ('zte', 'ZTE'),
        ('fiberhome', 'FiberHome'),
        ('hioso', 'Hioso / C-Data'),
        ('bdcom', 'BDCOM'),
        ('raisecom', 'Raisecom'),
        ('other', 'Lainnya'),
      ],
    ),
    const FieldSpec('model', 'Model'),
    const FieldSpec('firmwareVersion', 'Firmware'),
    const FieldSpec.section('Akses'),
    const FieldSpec('username', 'Username'),
    FieldSpec('password', o == null ? 'Password' : 'Password baru', type: FieldType.password, omitWhenEmpty: o != null),
    const FieldSpec('sshEnabled', 'SSH aktif', type: FieldType.toggle, initial: true),
    const FieldSpec('sshPort', 'Port SSH', type: FieldType.integer, initial: 22),
    const FieldSpec('telnetEnabled', 'Telnet aktif', type: FieldType.toggle),
    const FieldSpec('telnetPort', 'Port Telnet', type: FieldType.integer, initial: 23),
    const FieldSpec('snmpCommunity', 'SNMP community', initial: 'public'),
    const FieldSpec('snmpPort', 'Port SNMP', type: FieldType.integer, initial: 161),
    const FieldSpec.section('Lainnya'),
    FieldSpec('routerIds', 'Router terhubung', type: FieldType.multiSelect, loadOptions: Lookups.routers),
    const FieldSpec('latitude', 'Lokasi', type: FieldType.location, pairKey: 'longitude'),
    const FieldSpec(
      'status',
      'Status',
      type: FieldType.select,
      initial: 'active',
      options: [('active', 'Aktif'), ('inactive', 'Nonaktif'), ('maintenance', 'Perbaikan')],
    ),
    const FieldSpec('followRoad', 'Kabel mengikuti jalan di peta', type: FieldType.toggle),
  ],
  initialOf: (o) => {
    ...o,
    'password': null,
    'routerIds':
        (o['routers'] as List?)?.whereType<Map>().map((r) => '${r['routerId'] ?? mapOf(r.cast<String, dynamic>(), 'router')?['id'] ?? r['id']}').toList() ??
        o['routerIds'],
  },
  create: CrudRoutes.postTo('/api/network/olts'),
  update: CrudRoutes.putWithBodyId('/api/network/olts'),
  delete: CrudRoutes.deleteWithQueryId('/api/network/olts'),
  itemActions: [
    CrudAction('Kelola ONU', Icons.settings_input_component_rounded, (ctx, o) async {
      await CrudListScreen.open(ctx, oltDeviceConfig(o));
      return false;
    }, kind: ActionKind.primary),
    CommonActions.form(
      'Tes koneksi',
      Icons.network_check_rounded,
      fields: (_) => const [
        FieldSpec(
          'protocol',
          'Protokol',
          type: FieldType.select,
          required: true,
          initial: 'ssh',
          options: [('ssh', 'SSH'), ('telnet', 'Telnet'), ('snmp', 'SNMP')],
        ),
      ],
      submitLabel: 'Tes',
      submit: (o, v) async {
        final res = _map(await _api.postLong('/api/olt/test-connection', data: {'oltId': o['id'], ...v}));
        throw ApiException(res['success'] == true ? 'Berhasil: ${res['message'] ?? 'OLT merespons.'}' : 'Gagal: ${res['message'] ?? res['error'] ?? '-'}');
      },
    ),
  ],
);

/// ODC — mirrors /admin/network/odcs.
CrudConfig odcsConfig() => CrudConfig(
  title: 'ODC',
  noun: 'ODC',
  icon: Icons.hub_rounded,
  tone: Tone.violet,
  fetch: (_) => _api.get('/api/network/odcs'),
  listKey: 'odcs',
  titleOf: (o) => str(o, 'name') ?? '-',
  subtitleOf: (o) =>
      [str(mapOf(o, 'olt'), 'name'), if (o['ponPort'] != null) 'PON ${o['ponPort']}', '${o['portCount'] ?? '-'} port'].whereType<String>().join(' · '),
  metaOf: _coords,
  statusOf: _statusPill,
  fields: (o) => [
    const FieldSpec('name', 'Nama ODC', required: true),
    FieldSpec('oltId', 'OLT', type: FieldType.select, required: true, loadOptions: Lookups.olts),
    const FieldSpec('ponPort', 'Port PON', type: FieldType.integer),
    const FieldSpec('portCount', 'Jumlah port', type: FieldType.integer, initial: 8, min: 1),
    const FieldSpec('latitude', 'Lokasi', type: FieldType.location, pairKey: 'longitude', required: true),
    if (o != null) const FieldSpec('status', 'Status', type: FieldType.select, options: _statusOptions),
    const FieldSpec('followRoad', 'Kabel mengikuti jalan', type: FieldType.toggle),
  ],
  initialOf: (o) => {...o, 'oltId': o['oltId'] ?? mapOf(o, 'olt')?['id']},
  create: CrudRoutes.postTo('/api/network/odcs'),
  update: CrudRoutes.putWithBodyId('/api/network/odcs'),
  delete: CrudRoutes.deleteWithQueryId('/api/network/odcs'),
);

/// ODP — mirrors /admin/network/odps.
CrudConfig odpsConfig() => CrudConfig(
  title: 'ODP',
  noun: 'ODP',
  icon: Icons.device_hub_rounded,
  tone: Tone.accent,
  fetch: (_) => _api.get('/api/network/odps'),
  listKey: 'odps',
  titleOf: (o) => str(o, 'name') ?? '-',
  subtitleOf: (o) => [str(mapOf(o, 'odc'), 'name') ?? str(mapOf(o, 'olt'), 'name'), '${o['portCount'] ?? '-'} port'].whereType<String>().join(' · '),
  metaOf: (o) => [if (o['_count'] is Map) '${(o['_count'] as Map)['customers'] ?? 0} pelanggan', _coords(o)].whereType<String>().join(' · '),
  statusOf: _statusPill,
  fields: (o) => [
    const FieldSpec('name', 'Nama ODP', required: true),
    FieldSpec('odcId', 'ODC induk', type: FieldType.select, loadOptions: Lookups.odcs),
    FieldSpec('parentOdpId', 'ODP induk (kaskade)', type: FieldType.select, loadOptions: Lookups.odps),
    FieldSpec('oltId', 'OLT', type: FieldType.select, loadOptions: Lookups.olts),
    const FieldSpec('ponPort', 'Port PON', type: FieldType.integer),
    const FieldSpec('portCount', 'Jumlah port', type: FieldType.integer, initial: 8, min: 1),
    const FieldSpec('latitude', 'Lokasi', type: FieldType.location, pairKey: 'longitude', required: true),
    if (o != null) const FieldSpec('status', 'Status', type: FieldType.select, options: _statusOptions),
    const FieldSpec('followRoad', 'Kabel mengikuti jalan', type: FieldType.toggle),
  ],
  initialOf: (o) => {...o, 'odcId': o['odcId'] ?? mapOf(o, 'odc')?['id'], 'oltId': o['oltId'] ?? mapOf(o, 'olt')?['id']},
  create: CrudRoutes.postTo('/api/network/odps'),
  update: CrudRoutes.putWithBodyId('/api/network/odps'),
  delete: CrudRoutes.deleteWithQueryId('/api/network/odps'),
);

/// Joint closure — mirrors /admin/network/fiber-joint-closures.
CrudConfig jointClosuresConfig() => CrudConfig(
  title: 'Joint Closure',
  noun: 'Joint Closure',
  icon: Icons.merge_type_rounded,
  tone: Tone.warning,
  fetch: (q) => _api.get('/api/network/joint-closures', query: q),
  listKey: 'data',
  searchParam: 'search',
  titleOf: (j) => str(j, 'name') ?? '-',
  subtitleOf: (j) => [str(j, 'code'), str(j, 'type'), str(j, 'closureType')].whereType<String>().join(' · '),
  metaOf: (j) => [
    '${j['fiberCount'] ?? '-'} core',
    if (j['hasSplitter'] == true) 'splitter ${j['splitterRatio'] ?? ''}',
    str(j, 'address'),
  ].whereType<String>().join(' · '),
  statusOf: _statusPill,
  fields: (j) => [
    const FieldSpec('name', 'Nama', required: true),
    const FieldSpec('code', 'Kode', required: true),
    FieldSpec(
      'type',
      'Jenis',
      type: FieldType.select,
      required: true,
      initial: 'DISTRIBUTION',
      options: const [('CORE', 'Core'), ('DISTRIBUTION', 'Distribusi'), ('FEEDER', 'Feeder')],
    ),
    FieldSpec(
      'closureType',
      'Tipe closure',
      type: FieldType.select,
      initial: 'BRANCHING',
      options: const [('BRANCHING', 'Branching'), ('STRAIGHT', 'Straight'), ('LOOP', 'Loop')],
    ),
    FieldSpec('cableType', 'Jenis kabel', type: FieldType.select, initial: 'GPON', options: [for (final c in _cableTypes) (c, c)]),
    const FieldSpec('fiberCount', 'Jumlah core', type: FieldType.integer, initial: 24),
    const FieldSpec('hasSplitter', 'Ada splitter', type: FieldType.toggle),
    FieldSpec('splitterRatio', 'Rasio splitter', hint: '1:8', visibleIf: (v) => v['hasSplitter'] == true),
    const FieldSpec('spliceTrayCount', 'Jumlah tray', type: FieldType.integer, initial: 4),
    const FieldSpec('totalSpliceCapacity', 'Kapasitas sambungan', type: FieldType.integer, initial: 96),
    const FieldSpec('latitude', 'Lokasi', type: FieldType.location, pairKey: 'longitude', required: true),
    const FieldSpec('address', 'Alamat'),
    const FieldSpec('status', 'Status', type: FieldType.select, initial: 'active', options: _statusOptions),
    const FieldSpec('followRoad', 'Kabel mengikuti jalan', type: FieldType.toggle, initial: true),
  ],
  create: CrudRoutes.postTo('/api/network/joint-closures'),
  update: CrudRoutes.putById('/api/network/joint-closures'),
  delete: CrudRoutes.deleteById('/api/network/joint-closures'),
  itemActions: [
    CrudAction('Sambungan (splice)', Icons.linear_scale_rounded, (ctx, j) async {
      await CrudListScreen.open(ctx, splicesConfig(deviceId: '${j['id']}', deviceType: 'JOINT_CLOSURE', title: 'Splice ${j['name']}'));
      return false;
    }),
  ],
);

/// OTB — mirrors the OTB part of /admin/network/infrastruktur & diagrams.
CrudConfig otbsConfig() => CrudConfig(
  title: 'OTB',
  noun: 'OTB',
  icon: Icons.inventory_2_rounded,
  tone: Tone.primary,
  fetch: (q) => _api.get('/api/network/otbs', query: {'limit': 500, ...q}),
  listKey: 'otbs',
  searchParam: 'search',
  titleOf: (o) => str(o, 'name') ?? '-',
  subtitleOf: (o) => [str(o, 'code'), str(mapOf(o, 'olt'), 'name'), '${o['portCount'] ?? '-'} port'].whereType<String>().join(' · '),
  metaOf: (o) => str(o, 'address') ?? _coords(o),
  statusOf: _statusPill,
  fields: (o) => [
    const FieldSpec('name', 'Nama', required: true),
    const FieldSpec('code', 'Kode', required: true),
    FieldSpec('oltId', 'OLT', type: FieldType.select, loadOptions: Lookups.olts),
    const FieldSpec('portCount', 'Jumlah port', type: FieldType.integer, initial: 24),
    FieldSpec('cableType', 'Jenis kabel', type: FieldType.select, initial: 'GPON', options: [for (final c in _cableTypes) (c, c)]),
    FieldSpec('incomingCableId', 'Kabel masuk', type: FieldType.select, loadOptions: Lookups.cables),
    const FieldSpec('hasSplitter', 'Ada splitter', type: FieldType.toggle),
    FieldSpec('splitterRatio', 'Rasio splitter', visibleIf: (v) => v['hasSplitter'] == true),
    const FieldSpec('spliceTrayCount', 'Jumlah tray', type: FieldType.integer),
    const FieldSpec('totalSpliceCapacity', 'Kapasitas sambungan', type: FieldType.integer),
    const FieldSpec('coverageRadiusKm', 'Radius cakupan (km)', type: FieldType.decimal),
    const FieldSpec('latitude', 'Lokasi', type: FieldType.location, pairKey: 'longitude', required: true),
    const FieldSpec('address', 'Alamat'),
    const FieldSpec('installDate', 'Tanggal pasang', type: FieldType.date),
    const FieldSpec('status', 'Status', type: FieldType.select, initial: 'active', options: _statusOptions),
    const FieldSpec('notes', 'Catatan', type: FieldType.multiline),
  ],
  initialOf: (o) => {...o, 'oltId': o['oltId'] ?? mapOf(o, 'olt')?['id']},
  create: CrudRoutes.postTo('/api/network/otbs'),
  update: CrudRoutes.putById('/api/network/otbs'),
  delete: CrudRoutes.deleteById('/api/network/otbs'),
  itemActions: [
    CrudAction('Segmen ke joint closure', Icons.call_split_rounded, (ctx, o) async {
      await CrudListScreen.open(ctx, otbSegmentsConfig(o));
      return false;
    }),
    CrudAction('Kabel feeder', Icons.cable_rounded, (ctx, o) async {
      await CrudListScreen.open(ctx, otbFeederConfig(o));
      return false;
    }),
  ],
);

CrudConfig otbSegmentsConfig(Json otb) => CrudConfig(
  title: 'Segmen ${otb['name'] ?? ''}',
  noun: 'Segmen',
  icon: Icons.call_split_rounded,
  searchable: false,
  fetch: (_) => _api.get('/api/network/otbs/${otb['id']}/segments'),
  titleOf: (s) => 'Tube ${s['tubeNumber'] ?? '-'} → ${str(mapOf(s, 'toDevice'), 'name') ?? str(mapOf(s, 'jointClosure'), 'name') ?? '-'}',
  subtitleOf: (s) => s['lengthMeters'] == null ? null : '${s['lengthMeters']} m',
  metaOf: (s) => str(s, 'status'),
  fields: (_) => [
    const FieldSpec('tubeNumber', 'Nomor tube', type: FieldType.integer, required: true, min: 1),
    FieldSpec('jcId', 'Joint closure tujuan', type: FieldType.select, required: true, loadOptions: Lookups.jointClosures),
    const FieldSpec('lengthMeters', 'Panjang (m)', type: FieldType.integer),
  ],
  create: CrudRoutes.postTo('/api/network/otbs/${otb['id']}/segments'),
  delete: (s) => _api.delete('/api/network/otbs/${otb['id']}/segments', query: {'segmentId': s['id']}),
);

CrudConfig otbFeederConfig(Json otb) => CrudConfig(
  title: 'Feeder ${otb['name'] ?? ''}',
  noun: 'Kabel feeder',
  icon: Icons.cable_rounded,
  searchable: false,
  fetch: (_) => _api.get('/api/network/otbs/${otb['id']}/feeder-cables'),
  titleOf: (s) => str(mapOf(s, 'cable'), 'name') ?? str(s, 'cableId') ?? '-',
  subtitleOf: (s) => 'Port ${s['portFrom'] ?? '-'}–${s['portTo'] ?? '-'}',
  fields: (_) => [
    FieldSpec('cableId', 'Kabel', type: FieldType.select, required: true, loadOptions: Lookups.cables),
    const FieldSpec('portFrom', 'Port awal', type: FieldType.integer, required: true),
    const FieldSpec('portTo', 'Port akhir', type: FieldType.integer, required: true),
  ],
  create: CrudRoutes.postTo('/api/network/otbs/${otb['id']}/feeder-cables'),
  delete: (s) => _api.delete('/api/network/otbs/${otb['id']}/feeder-cables', query: {'segmentId': s['id']}),
);

/// Kabel fiber — mirrors /admin/network/fiber-cables.
CrudConfig cablesConfig() => CrudConfig(
  title: 'Kabel Fiber',
  noun: 'Kabel',
  icon: Icons.cable_rounded,
  tone: Tone.accent,
  fetch: (q) => _api.get('/api/network/cables', query: {'limit': 500, ...q}),
  listKey: 'cables',
  searchParam: 'search',
  titleOf: (c) => '${c['code'] ?? ''} ${c['name'] ?? ''}'.trim(),
  subtitleOf: (c) => '${c['cableType'] ?? '-'} · ${c['tubeCount'] ?? '-'} tube × ${c['coresPerTube'] ?? '-'} core',
  metaOf: (c) => [str(c, 'manufacturer'), if (c['outerDiameter'] != null) 'Ø ${c['outerDiameter']} mm'].whereType<String>().join(' · '),
  statusOf: (c) => c['status'] == null ? null : _statusPill(c),
  fields: (_) => [
    const FieldSpec('code', 'Kode', required: true),
    const FieldSpec('name', 'Nama', required: true),
    FieldSpec('cableType', 'Jenis', type: FieldType.select, required: true, initial: 'GPON', options: [for (final c in _cableTypes) (c, c)]),
    const FieldSpec('tubeCount', 'Jumlah tube', type: FieldType.integer, required: true, initial: 12, min: 1),
    const FieldSpec('coresPerTube', 'Core per tube', type: FieldType.integer, required: true, initial: 12, min: 1),
    const FieldSpec('outerDiameter', 'Diameter luar (mm)', type: FieldType.decimal),
    const FieldSpec('manufacturer', 'Pabrikan'),
    const FieldSpec('partNumber', 'Part number'),
    const FieldSpec('notes', 'Catatan', type: FieldType.multiline),
  ],
  create: CrudRoutes.postTo('/api/network/cables'),
  update: CrudRoutes.putById('/api/network/cables'),
  delete: CrudRoutes.deleteById('/api/network/cables'),
  deleteMessage: (c) => 'Kabel ${c['code']} beserta tube dan core-nya dihapus.',
  itemActions: [
    CrudAction('Core kabel', Icons.grain_rounded, (ctx, c) async {
      await CrudListScreen.open(ctx, coresConfig(cable: c));
      return false;
    }),
  ],
);

/// Core fiber — /admin/network/fiber-cores (reserve / release / damaged).
CrudConfig coresConfig({Json? cable}) {
  List<String> ids(Json s) => [for (final c in (s['items'] as List).cast<Json>()) '${c['id']}'];
  CrudAction bulk(String label, IconData icon, String action, {bool reason = false, ActionKind kind = ActionKind.neutral}) =>
      CrudAction(label, icon, (ctx, s) async {
        String? why;
        if (reason) {
          why = await askReason(ctx, title: label, label: 'Keterangan', confirmLabel: label, required: false, destructive: kind == ActionKind.danger);
          if (why == null) return false;
        }
        if (!ctx.mounted) return false;
        return runAction(
          ctx,
          () => _api.post('/api/network/cores', data: {'action': action, 'coreIds': ids(s), if (why != null) 'reason': why, if (why != null) 'notes': why}),
          success: '$label: ${ids(s).length} core.',
        );
      }, kind: kind);
  return CrudConfig(
    title: cable == null ? 'Core Fiber' : 'Core ${cable['code'] ?? ''}',
    noun: 'Core',
    icon: Icons.grain_rounded,
    searchable: false,
    fetch: (q) => _api.get('/api/network/cores', query: {'limit': 500, if (cable != null) 'cableId': cable['id'], ...q}),
    listKey: 'cores',
    filters: const [('all', 'Semua'), ('AVAILABLE', 'Tersedia'), ('ASSIGNED', 'Terpakai'), ('RESERVED', 'Dipesan'), ('DAMAGED', 'Rusak')],
    titleOf: (c) => 'Tube ${mapOf(c, 'tube')?['tubeNumber'] ?? c['tubeNumber'] ?? '-'} · Core ${c['coreNumber'] ?? '-'}',
    subtitleOf: (c) => [str(c, 'colorName') ?? str(c, 'color'), str(c, 'assignedToType')].whereType<String>().join(' · '),
    metaOf: (c) => str(c, 'notes'),
    toneOf: (c) => switch (c['status']) {
      'AVAILABLE' => Tone.success,
      'ASSIGNED' => Tone.primary,
      'RESERVED' => Tone.warning,
      _ => Tone.danger,
    },
    statusOf: (c) => StatusPill(
      label: str(c, 'status') ?? '-',
      tone: switch (c['status']) {
        'AVAILABLE' => Tone.success,
        'ASSIGNED' => Tone.primary,
        'RESERVED' => Tone.warning,
        _ => Tone.danger,
      },
    ),
    bulkActions: [
      bulk('Pesan (reserve)', Icons.bookmark_add_rounded, 'reserve', reason: true),
      bulk('Lepaskan', Icons.bookmark_remove_rounded, 'release'),
      bulk('Tandai rusak', Icons.report_rounded, 'damaged', reason: true, kind: ActionKind.danger),
    ],
  );
}

/// Titik sambung (splice) — /admin/network/splice-points.
CrudConfig splicesConfig({String? deviceId, String? deviceType, String? title}) {
  Future<FieldOptions> availableCores() async {
    final list = extractList(await _api.get('/api/network/cores', query: {'status': 'AVAILABLE', 'limit': 1000}), listKey: 'cores');
    return [
      for (final c in list)
        (
          '${c['id']}',
          '${str(mapOf(mapOf(c, 'tube'), 'cable'), 'code') ?? ''} T${mapOf(c, 'tube')?['tubeNumber'] ?? '-'} C${c['coreNumber'] ?? '-'} ${c['colorName'] ?? ''}'
              .trim(),
        ),
    ];
  }

  return CrudConfig(
    title: title ?? 'Titik Sambung',
    noun: 'Sambungan',
    icon: Icons.linear_scale_rounded,
    tone: Tone.violet,
    searchable: false,
    fetch: (q) => _api.get(
      '/api/network/splices',
      query: {'limit': 500, if (deviceId != null) 'deviceId': deviceId, if (deviceType != null) 'deviceType': deviceType, ...q},
    ),
    listKey: 'splices',
    titleOf: (s) => '${_coreLabel(mapOf(s, 'incomingCore'))} ⇄ ${_coreLabel(mapOf(s, 'outgoingCore'))}',
    subtitleOf: (s) => [str(s, 'spliceType'), if (s['insertionLoss'] != null) '${s['insertionLoss']} dB'].whereType<String>().join(' · '),
    metaOf: (s) => [str(s, 'splicedBy'), formatDateOrNull(dateOf(s, 'spliceDate') ?? dateOf(s, 'createdAt'))].whereType<String>().join(' · '),
    fields: (_) => [
      FieldSpec('incomingCoreId', 'Core A', type: FieldType.select, required: true, loadOptions: availableCores),
      FieldSpec(
        'outgoingCoreId',
        'Core B',
        type: FieldType.select,
        required: true,
        loadOptions: availableCores,
        validator: (val, v) => val != null && val == v['incomingCoreId'] ? 'Core A dan B tidak boleh sama' : null,
      ),
      const FieldSpec(
        'spliceType',
        'Jenis',
        type: FieldType.select,
        initial: 'FUSION',
        options: [('FUSION', 'Fusion'), ('MECHANICAL', 'Mechanical'), ('PIGTAIL', 'Pigtail')],
      ),
      const FieldSpec('insertionLoss', 'Insertion loss (dB)', type: FieldType.decimal),
      const FieldSpec('splicedBy', 'Dikerjakan oleh'),
      const FieldSpec('locationDescription', 'Lokasi'),
      const FieldSpec('notes', 'Catatan', type: FieldType.multiline),
    ],
    create: (v) =>
        _api.post('/api/network/splices', data: {...v, if (deviceId != null) 'deviceId': deviceId, if (deviceType != null) 'deviceType': deviceType}),
    delete: CrudRoutes.deleteById('/api/network/splices'),
    deleteMessage: (_) => 'Sambungan dihapus dan kedua core kembali tersedia.',
  );
}

String _coreLabel(Json? c) => c == null ? '-' : 'T${mapOf(c, 'tube')?['tubeNumber'] ?? '-'}C${c['coreNumber'] ?? '-'}';

/// Pelanggan di ODP — /admin/network/customers.
CrudConfig customerAssignmentsConfig() {
  return CrudConfig(
    title: 'Pelanggan per ODP',
    noun: 'Penempatan',
    icon: Icons.person_pin_circle_rounded,
    tone: Tone.success,
    fetch: (_) => _api.get('/api/network/customers/assign'),
    titleOf: (a) => str(mapOf(a, 'customer'), 'name') ?? '-',
    subtitleOf: (a) => '${str(mapOf(a, 'odp'), 'name') ?? '-'} · port ${a['portNumber'] ?? '-'}',
    metaOf: (a) => [
      str(mapOf(a, 'customer'), 'username'),
      str(mapOf(mapOf(a, 'customer'), 'profile'), 'name'),
      if (a['distance'] != null) '${a['distance']} km',
    ].whereType<String>().join(' · '),
    searchTextOf: (a) => '${mapOf(a, 'customer')?['name']} ${mapOf(a, 'customer')?['username']} ${mapOf(a, 'odp')?['name']}',
    fields: (a) => [
      if (a == null) FieldSpec('customerId', 'Pelanggan', type: FieldType.select, required: true, loadOptions: Lookups.pppoeUsers),
      FieldSpec('odpId', 'ODP', type: FieldType.select, required: true, loadOptions: Lookups.odps),
      const FieldSpec('portNumber', 'Nomor port', type: FieldType.integer, required: true, min: 1),
      const FieldSpec('notes', 'Catatan'),
    ],
    initialOf: (a) => {...a, 'odpId': a['odpId'] ?? mapOf(a, 'odp')?['id']},
    create: CrudRoutes.postTo('/api/network/customers/assign'),
    update: CrudRoutes.putWithBodyId('/api/network/customers/assign'),
    delete: CrudRoutes.deleteWithQueryId('/api/network/customers/assign'),
    deleteMessage: (a) => '${mapOf(a, 'customer')?['name'] ?? 'Pelanggan'} dilepas dari ODP; port kembali kosong.',
    itemActions: [
      CommonActions.showResult(
        'ODP terdekat',
        Icons.near_me_rounded,
        (_) => '/api/network/customers/assign',
        method: 'GET',
        query: (a) => {'customerId': mapOf(a, 'customer')?['id'] ?? a['customerId']},
      ),
    ],
  );
}

/// Server (VPS/billing) — /api/network/servers.
CrudConfig serversConfig() => CrudConfig(
  title: 'Server',
  noun: 'Server',
  icon: Icons.storage_rounded,
  fetch: (_) => _api.get('/api/network/servers'),
  listKey: 'servers',
  titleOf: (s) => str(s, 'name') ?? '-',
  subtitleOf: (s) => str(s, 'ipAddress'),
  metaOf: (s) => str(mapOf(s, 'router'), 'name'),
  statusOf: _statusPill,
  fields: (_) => [
    const FieldSpec('name', 'Nama', required: true),
    const FieldSpec('ipAddress', 'IP address', required: true),
    FieldSpec('routerId', 'Router', type: FieldType.select, loadOptions: Lookups.routers),
    const FieldSpec('latitude', 'Lokasi', type: FieldType.location, pairKey: 'longitude'),
    const FieldSpec('status', 'Status', type: FieldType.select, initial: 'active', options: _statusOptions),
  ],
  create: CrudRoutes.postTo('/api/network/servers'),
  update: CrudRoutes.putWithBodyId('/api/network/servers'),
  delete: CrudRoutes.deleteWithQueryId('/api/network/servers'),
);

/// VPN server (MikroTik CHR) — /admin/network/vpn-server.
CrudConfig vpnServersConfig() {
  Json ssh(Json v) => {'host': v['sshHost'], 'port': v['sshPort'] ?? 22, 'username': v['sshUser'] ?? 'root', 'password': v['sshPassword']};
  const sshFields = [
    FieldSpec.section('SSH ke VPS'),
    FieldSpec('sshHost', 'Host', required: true),
    FieldSpec('sshPort', 'Port', type: FieldType.integer, initial: 22),
    FieldSpec('sshUser', 'Username', initial: 'root'),
    FieldSpec('sshPassword', 'Password', type: FieldType.password, required: true),
  ];
  CrudAction control(String label, String path, List<FieldSpec> extra, Json Function(Json v) body) => CrudAction(label, Icons.terminal_rounded, (ctx, s) async {
    Json? out;
    final ok = await openForm(
      ctx,
      title: label,
      submitLabel: 'Jalankan',
      fields: [
        const FieldSpec(
          'action',
          'Aksi',
          type: FieldType.select,
          required: true,
          initial: 'status',
          options: [('status', 'Status'), ('configure', 'Konfigurasi'), ('start', 'Start'), ('stop', 'Stop'), ('restart', 'Restart'), ('logs', 'Log')],
        ),
        ...sshFields,
        ...extra,
      ],
      initial: {'sshHost': s['host']},
      onSubmit: (v) async => out = _map(await _api.postLong(path, data: {'action': v['action'], ...ssh(v), ...body(v)})),
    );
    if (ok && out != null && ctx.mounted) await showResultScreen(ctx, title: label, data: out!);
    return false;
  });

  return CrudConfig(
    title: 'VPN Server',
    noun: 'VPN Server',
    icon: Icons.vpn_lock_rounded,
    tone: Tone.violet,
    fetch: (_) => _api.get('/api/network/vpn-server'),
    listKey: 'servers',
    titleOf: (s) => str(s, 'name') ?? '-',
    subtitleOf: (s) => '${s['host'] ?? '-'} · ${s['subnet'] ?? '-'}',
    metaOf: (s) => [
      if (s['l2tpEnabled'] == true) 'L2TP',
      if (s['sstpEnabled'] == true) 'SSTP',
      if (s['pptpEnabled'] == true) 'PPTP',
      if (s['openVpnEnabled'] == true) 'OpenVPN',
    ].join(' · '),
    fields: (s) => [
      const FieldSpec('name', 'Nama', required: true),
      const FieldSpec('host', 'Host / IP MikroTik', required: true),
      const FieldSpec('username', 'Username API', initial: 'admin', required: true),
      FieldSpec('password', s == null ? 'Password API' : 'Password API baru', type: FieldType.password, required: s == null, omitWhenEmpty: s != null),
      const FieldSpec('apiPort', 'Port API', type: FieldType.integer, initial: 8728),
      const FieldSpec('subnet', 'Subnet VPN', initial: '10.20.30.0/24'),
      const FieldSpec('poolStart', 'Awal pool (oktet)', type: FieldType.integer, initial: 10),
      const FieldSpec('poolEnd', 'Akhir pool (oktet)', type: FieldType.integer, initial: 254),
      const FieldSpec('gateway', 'Gateway'),
      const FieldSpec('l2tpEnabled', 'L2TP', type: FieldType.toggle),
      const FieldSpec('sstpEnabled', 'SSTP', type: FieldType.toggle),
      const FieldSpec('pptpEnabled', 'PPTP', type: FieldType.toggle),
      const FieldSpec('openVpnEnabled', 'OpenVPN', type: FieldType.toggle),
    ],
    initialOf: (s) => {...s, 'password': null},
    create: CrudRoutes.postTo('/api/network/vpn-server'),
    update: CrudRoutes.putWithBodyId('/api/network/vpn-server'),
    delete: CrudRoutes.deleteWithQueryId('/api/network/vpn-server'),
    itemActions: [
      CommonActions.form(
        'Tes koneksi',
        Icons.network_check_rounded,
        fields: (_) => const [FieldSpec('password', 'Password API', type: FieldType.password, required: true)],
        submitLabel: 'Tes',
        submit: (s, v) async {
          final res = _map(
            await _api.post(
              '/api/network/vpn-server/test',
              data: {'host': s['host'], 'username': s['username'], 'password': v['password'], 'apiPort': s['apiPort']},
            ),
          );
          throw ApiException(
            res['success'] == true ? 'Terhubung: ${res['identity'] ?? res['message'] ?? 'OK'}' : 'Gagal: ${res['message'] ?? res['error'] ?? '-'}',
          );
        },
      ),
      CrudAction('Setup otomatis', Icons.auto_fix_high_rounded, (ctx, s) async {
        Json? out;
        final ok = await openForm(
          ctx,
          title: 'Setup VPN Server',
          submitLabel: 'Setup',
          fields: const [
            FieldSpec.note('Membuat profil, pool, dan service VPN di MikroTik server ini.'),
            FieldSpec('password', 'Password API', type: FieldType.password, required: true),
          ],
          onSubmit: (v) async => out = _map(
            await _api.postLong(
              '/api/network/vpn-server/setup',
              data: {
                'serverId': s['id'],
                'host': s['host'],
                'username': s['username'],
                'password': v['password'],
                'apiPort': '${s['apiPort'] ?? 8728}',
                'subnet': s['subnet'],
                'name': s['name'],
              },
            ),
          ),
        );
        if (ok && out != null && ctx.mounted) await showResultScreen(ctx, title: 'Hasil setup', data: out!);
        return ok;
      }),
      control(
        'Kontrol L2TP (VPS)',
        '/api/network/vpn-server/l2tp-control',
        const [
          FieldSpec('l2tpUsername', 'Username L2TP'),
          FieldSpec('l2tpPassword', 'Password L2TP', type: FieldType.password),
          FieldSpec('vpnSubnet', 'Subnet VPN'),
        ],
        (v) => {'l2tpUsername': v['l2tpUsername'], 'l2tpPassword': v['l2tpPassword'], 'vpnSubnet': v['vpnSubnet']},
      ),
      control(
        'Kontrol PPTP (VPS)',
        '/api/network/vpn-server/pptp-control',
        const [
          FieldSpec('vpnServerIp', 'IP server PPTP'),
          FieldSpec('pptpUsername', 'Username PPTP'),
          FieldSpec('pptpPassword', 'Password PPTP', type: FieldType.password),
        ],
        (v) => {'vpnServerIp': v['vpnServerIp'], 'pptpUsername': v['pptpUsername'], 'pptpPassword': v['pptpPassword']},
      ),
      control('Kontrol SSTP (VPS)', '/api/network/vpn-server/sstp-control', const [], (_) => const {}),
    ],
  );
}

/// VPN client (NAS behind VPN) — /admin/network/vpn-client, including the
/// VPS WireGuard / VPS L2TP peer flows.
CrudConfig vpnClientsConfig() => CrudConfig(
  title: 'VPN Client',
  noun: 'VPN Client',
  icon: Icons.vpn_key_rounded,
  tone: Tone.violet,
  fetch: (_) => _api.get('/api/network/vpn-client'),
  listKey: 'clients',
  titleOf: (c) => str(c, 'name') ?? '-',
  subtitleOf: (c) => '${(str(c, 'vpnType') ?? '').toUpperCase()} · ${c['vpnIp'] ?? '-'}',
  metaOf: (c) => [str(mapOf(c, 'vpnServer'), 'name'), if (c['isRadiusServer'] == true) 'Server RADIUS', str(c, 'description')].whereType<String>().join(' · '),
  statusOf: (c) => c['isRadiusServer'] == true ? const StatusPill(label: 'RADIUS', tone: Tone.accent) : null,
  sectionsOf: (context, c) => [
    DetailSection(
      rows: [
        InfoRow('Jenis', (str(c, 'vpnType') ?? '').toUpperCase()),
        InfoRow('IP VPN', str(c, 'vpnIp'), copyable: true),
        InfoRow('Username', str(c, 'username'), copyable: true),
        InfoRow('Password', str(c, 'password'), copyable: true),
        InfoRow('Server', str(mapOf(c, 'vpnServer'), 'name') ?? str(c, 'vpnServerId')),
        InfoRow('Winbox remote', str(c, 'winboxRemote'), copyable: true),
        InfoRow('API user', str(c, 'apiUsername'), copyable: true),
        InfoRow('Server RADIUS', c['isRadiusServer'] == true ? 'Ya' : 'Tidak'),
        InfoRow('Deskripsi', str(c, 'description')),
      ],
    ),
  ],
  fields: (_) => [
    const FieldSpec('name', 'Nama (nama NAS)', required: true),
    const FieldSpec('description', 'Deskripsi'),
    const FieldSpec(
      'vpnType',
      'Jenis VPN',
      type: FieldType.select,
      required: true,
      initial: 'l2tp',
      options: [('l2tp', 'L2TP'), ('pptp', 'PPTP'), ('sstp', 'SSTP'), ('wireguard', 'WireGuard')],
    ),
    FieldSpec(
      'vpnServerId',
      'Server VPN',
      type: FieldType.select,
      required: true,
      loadOptions: () async => [('__vps_wg__', 'VPS · WireGuard'), ('__vps_l2tp__', 'VPS · L2TP/IPsec'), ...await Lookups.vpnServers()],
    ),
    const FieldSpec('customVpnIp', 'IP VPN khusus', helper: 'Kosongkan untuk otomatis.'),
    const FieldSpec('localNetworks', 'Jaringan lokal di belakang NAS', hint: '192.168.75.0/24'),
  ],
  create: (v) async {
    final server = v['vpnServerId'];
    dynamic res;
    if (server == '__vps_wg__') {
      res = await _api.postLong(
        '/api/network/vps-wg-peer',
        data: {'action': 'add', 'nasName': v['name'], if (!isBlank(v['localNetworks'])) 'localNetworks': v['localNetworks']},
      );
    } else if (server == '__vps_l2tp__') {
      res = await _api.postLong(
        '/api/network/vps-l2tp-peer',
        data: {'action': 'add', 'label': v['name'], if (!isBlank(v['localNetworks'])) 'localNetworks': v['localNetworks']},
      );
    } else {
      res = await _api.postLong('/api/network/vpn-client', data: v);
    }
    _lastCreated = _map(res);
  },
  afterCreate: showLastVpnCredentials,
  delete: CrudRoutes.deleteWithQueryId('/api/network/vpn-client'),
  itemActions: [
    CrudAction('Jadikan server RADIUS', Icons.star_rounded, (ctx, c) async {
      await _api.put('/api/network/vpn-client', data: {'id': c['id'], 'isRadiusServer': true});
      return true;
    }, visible: (c) => c['isRadiusServer'] != true),
    CrudAction('Lepas status server RADIUS', Icons.star_border_rounded, (ctx, c) async {
      await _api.put('/api/network/vpn-client', data: {'id': c['id'], 'isRadiusServer': false});
      return true;
    }, visible: (c) => c['isRadiusServer'] == true),
    CommonActions.form(
      'Ubah IP VPN',
      Icons.edit_location_alt_rounded,
      fields: (_) => const [FieldSpec('vpnIp', 'IP VPN', required: true)],
      initial: (c) => {'vpnIp': c['vpnIp']},
      submit: (c, v) => _api.patch('/api/network/vpn-client', data: {'id': c['id'], ...v}),
    ),
    CrudAction('Terapkan routing (SSH)', Icons.alt_route_rounded, (ctx, c) async {
      Json? out;
      final ok = await openForm(
        ctx,
        title: 'Routing ke ${c['name']}',
        submitLabel: 'Terapkan',
        fields: const [
          FieldSpec.note('Menambah route di VPS agar jaringan lokal NAS bisa dijangkau.'),
          FieldSpec('host', 'Host VPS', required: true),
          FieldSpec('port', 'Port SSH', type: FieldType.integer, initial: 22),
          FieldSpec('username', 'Username', initial: 'root'),
          FieldSpec('password', 'Password', type: FieldType.password, required: true),
          FieldSpec('script', 'Perintah', type: FieldType.multiline, required: true, hint: 'ip route add 192.168.75.0/24 via 10.20.30.2'),
        ],
        onSubmit: (v) async => out = _map(await _api.postLong('/api/network/vpn-routing', data: v)),
      );
      if (ok && out != null && ctx.mounted) await showResultScreen(ctx, title: 'Hasil routing', data: out!);
      return false;
    }),
  ],
);

/// Credentials returned by the last VPN client creation, shown right after
/// the form closes (the web shows them in a dialog once).
Json? _lastCreated;

Future<void> showLastVpnCredentials(BuildContext context) async {
  final data = _lastCreated;
  _lastCreated = null;
  if (data == null || !context.mounted) return;
  await showResultScreen(context, title: 'Kredensial VPN', data: data, intro: 'Simpan kredensial ini — password tidak ditampilkan lagi.');
}
