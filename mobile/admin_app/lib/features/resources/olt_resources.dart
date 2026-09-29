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

final _api = ApiClient.instance;
Json _map(dynamic res) => res is Map ? res.cast<String, dynamic>() : <String, dynamic>{};

Tone _onuTone(String? s) => switch (s) {
  'online' => Tone.success,
  'offline' || 'los' => Tone.danger,
  'dying_gasp' || 'dyinggasp' => Tone.warning,
  'auth_failed' || 'unregistered' => Tone.violet,
  _ => Tone.neutral,
};

String _onuLabel(String? s) => switch (s) {
  'online' => 'Online',
  'offline' => 'Offline',
  'los' => 'LOS',
  'dying_gasp' || 'dyinggasp' => 'Dying gasp',
  'auth_failed' || 'unregistered' => 'Belum terdaftar',
  _ => s ?? '-',
};

bool _unregistered(Json o) => o['status'] == 'auth_failed' || o['status'] == 'unregistered';

/// ONU list and device actions for one OLT — mirrors /admin/olt/[id].
CrudConfig oltDeviceConfig(Json olt) {
  final id = olt['id'];
  final vendor = str(olt, 'vendor') ?? '';
  return CrudConfig(
    title: str(olt, 'name') ?? 'OLT',
    noun: 'ONU',
    icon: Icons.router_outlined,
    tone: Tone.accent,
    fetch: (q) => _api.get('/api/olt/$id', query: q),
    parse: (res) => extractList(mapOf(_map(res), 'olt'), listKey: 'onuStatuses'),
    filters: const [('all', 'Semua'), ('online', 'Online'), ('offline', 'Offline')],
    filterParam: 'onuStatus',
    searchHint: 'Cari SN, nama, pelanggan',
    searchTextOf: (o) => '${o['serialNumber']} ${o['name']} ${o['description']} ${mapOf(o, 'customer')?['name']} ${mapOf(o, 'customer')?['username']}',
    titleOf: (o) => str(mapOf(o, 'customer'), 'name') ?? str(o, 'name') ?? str(o, 'serialNumber') ?? '-',
    subtitleOf: (o) => '${o['frame'] ?? 0}/${o['slot'] ?? 0}/${o['port'] ?? 0}:${o['onuId'] ?? '-'} · ${o['serialNumber'] ?? '-'}',
    metaOf: (o) =>
        [if (o['rxPower'] != null) 'Rx ${o['rxPower']} dBm', str(o, 'onuType'), str(mapOf(o, 'customer'), 'username')].whereType<String>().join(' · '),
    toneOf: (o) => _onuTone(str(o, 'status')),
    statusOf: (o) => StatusPill(label: _onuLabel(str(o, 'status')), tone: _onuTone(str(o, 'status'))),
    sectionsOf: (context, o) => [
      DetailSection(
        rows: [
          InfoRow('Posisi', '${o['frame'] ?? 0}/${o['slot'] ?? 0}/${o['port'] ?? 0} · ONU ${o['onuId'] ?? '-'}'),
          InfoRow('Serial number', str(o, 'serialNumber'), copyable: true),
          InfoRow('Nama', str(o, 'name')),
          InfoRow('Deskripsi', str(o, 'description')),
          InfoRow('Tipe', str(o, 'onuType')),
          InfoRow('Rx power', o['rxPower'] == null ? null : '${o['rxPower']} dBm'),
          InfoRow('Tx power', o['txPower'] == null ? null : '${o['txPower']} dBm'),
          InfoRow('Jarak', o['distance'] == null ? null : '${o['distance']} m'),
          InfoRow('Pelanggan', str(mapOf(o, 'customer'), 'name')),
          InfoRow('Terakhir terlihat', formatDateTimeOrNull(dateOf(o, 'lastSeen') ?? dateOf(o, 'updatedAt'))),
        ],
      ),
    ],
    delete: (o) => _api.delete('/api/olt/$id/onus/${o['id']}/delete'),
    deleteMessage: (o) => 'ONU ${o['serialNumber'] ?? ''} dihapus dari konfigurasi OLT. Pelanggan terputus sampai didaftarkan ulang.',
    canDelete: (o) => !_unregistered(o),
    itemActions: [
      CrudAction('Daftarkan ONU', Icons.app_registration_rounded, (ctx, o) => registerOnu(ctx, olt, o), kind: ActionKind.primary, visible: _unregistered),
      CommonActions.showResult(
        'Detail dari OLT',
        Icons.info_outline_rounded,
        (o) => '/api/olt/$id/onus/${o['id']}/detail',
        method: 'GET',
        visible: (o) => !_unregistered(o),
      ),
      CommonActions.form(
        'Hubungkan ke pelanggan',
        Icons.person_add_alt_rounded,
        fields: (_) => [FieldSpec('customerId', 'Pelanggan', type: FieldType.select, required: true, loadOptions: Lookups.pppoeUsers)],
        initial: (o) => {'customerId': mapOf(o, 'customer')?['id']},
        submit: (o, v) => _api.post('/api/olt/$id/onus/${o['id']}/assign', data: v),
        success: 'ONU dihubungkan ke pelanggan.',
        visible: (o) => !_unregistered(o),
      ),
      CrudAction('Ubah nama / deskripsi', Icons.edit_rounded, (ctx, o) async {
        Json? out;
        final ok = await openForm(
          ctx,
          title: 'Konfigurasi ONU',
          submitLabel: 'Kirim ke OLT',
          fields: const [
            FieldSpec('name', 'Nama'),
            FieldSpec('description', 'Deskripsi'),
            FieldSpec('commit', 'Terapkan langsung', type: FieldType.toggle, initial: true, helper: 'Matikan untuk melihat perintah saja (dry run).'),
          ],
          initial: {'name': o['name'], 'description': o['description']},
          onSubmit: (v) async => out = _map(await _api.postLong('/api/olt/$id/onus/${o['id']}/config', data: v)),
        );
        if (ok && out != null && ctx.mounted) await showResultScreen(ctx, title: 'Hasil konfigurasi', data: out!, labels: const {'commands': 'Perintah'});
        return ok;
      }, visible: (o) => !_unregistered(o)),
      CommonActions.confirmPost(
        'Reboot ONU',
        Icons.restart_alt_rounded,
        (o) => '/api/olt/$id/onus/${o['id']}/reboot',
        confirm: 'Pelanggan terputus sekitar 1–2 menit selama ONU restart.',
        kind: ActionKind.warning,
        visible: (o) => !_unregistered(o),
        long: true,
      ),
    ],
    bulkActions: [
      CrudAction('Reboot massal', Icons.restart_alt_rounded, (ctx, s) async {
        final ids = [for (final o in (s['items'] as List).cast<Json>()) o['id']];
        final ok = await confirmAction(
          ctx,
          title: 'Reboot ${ids.length} ONU?',
          message: 'Semua pelanggan pada ONU terpilih terputus sebentar.',
          confirmLabel: 'Reboot',
        );
        if (!ok || !ctx.mounted) return false;
        dynamic res;
        final done = await runAction(ctx, () async => res = await _api.postLong('/api/olt/$id/onus/batch-reboot', data: {'onuIds': ids}));
        if (done && ctx.mounted) showToast(ctx, '${_map(res)['successCount'] ?? 0} dari ${_map(res)['total'] ?? ids.length} ONU di-reboot.');
        return done;
      }, kind: ActionKind.warning),
    ],
    toolbar: [
      CommonActions.confirmPost(
        'Sinkron dari OLT',
        Icons.sync_rounded,
        (_) => '/api/olt/$id/sync',
        confirm: 'Data ONU dibaca ulang dari OLT (berjalan di latar belakang).',
        long: true,
      ),
      CommonActions.confirmPost('Cek monitoring sekarang', Icons.monitor_heart_rounded, (_) => '/api/olt/monitoring', body: (_) => {'oltId': id}, long: true),
      CrudAction('Pengaturan OLT', Icons.tune_rounded, (ctx, _) => editOltSettings(ctx, olt)),
      CrudAction('Uplink / VLAN', Icons.settings_ethernet_rounded, (ctx, _) => uplinkAction(ctx, olt)),
      CommonActions.showResult('Info chassis', Icons.view_module_rounded, (_) => '/api/olt/$id/chassis', method: 'GET'),
      CommonActions.showResult('Grafik performa', Icons.show_chart_rounded, (_) => '/api/olt/metrics', method: 'GET', query: (_) => {'oltId': id, 'hours': 24}),
    ],
    emptyMessage: vendor.isEmpty ? 'Belum ada data ONU' : 'Belum ada data ONU — jalankan "Sinkron dari OLT"',
  );
}

Future<bool> editOltSettings(BuildContext context, Json olt) => openForm(
  context,
  title: 'Pengaturan ${olt['name'] ?? 'OLT'}',
  fields: [
    const FieldSpec(
      'vendor',
      'Vendor',
      type: FieldType.select,
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
    const FieldSpec('monitoringEnabled', 'Monitoring otomatis', type: FieldType.toggle),
    const FieldSpec('pollingInterval', 'Interval polling (detik)', type: FieldType.integer, min: 60),
    const FieldSpec.section('Akses'),
    const FieldSpec('username', 'Username'),
    const FieldSpec('password', 'Password baru', type: FieldType.password, omitWhenEmpty: true),
    const FieldSpec('sshEnabled', 'SSH', type: FieldType.toggle),
    const FieldSpec('sshPort', 'Port SSH', type: FieldType.integer),
    const FieldSpec('telnetEnabled', 'Telnet', type: FieldType.toggle),
    const FieldSpec('telnetPort', 'Port Telnet', type: FieldType.integer),
    const FieldSpec('snmpEnabled', 'SNMP', type: FieldType.toggle),
    const FieldSpec('snmpCommunity', 'SNMP community'),
    const FieldSpec('snmpPort', 'Port SNMP', type: FieldType.integer),
    FieldSpec('routerIds', 'Router terhubung', type: FieldType.multiSelect, loadOptions: Lookups.routers),
  ],
  initial: {
    ...olt,
    'password': null,
    'routerIds': (olt['routers'] as List?)?.whereType<Map>().map((r) => '${r['routerId'] ?? (r['router'] as Map?)?['id']}').toList(),
  },
  success: 'Pengaturan OLT disimpan.',
  onSubmit: (v) => _api.put('/api/olt/${olt['id']}', data: v),
);

Future<bool> uplinkAction(BuildContext context, Json olt) async {
  Json? out;
  final ok = await openForm(
    context,
    title: 'Uplink / VLAN',
    submitLabel: 'Kirim ke OLT',
    fields: [
      const FieldSpec('port', 'Port uplink', required: true, hint: 'gei_1/3/1'),
      const FieldSpec(
        'action',
        'Aksi',
        type: FieldType.select,
        required: true,
        initial: 'addVlan',
        options: [
          ('addVlan', 'Tambah VLAN'),
          ('removeVlan', 'Hapus VLAN'),
          ('setPvid', 'Set PVID'),
          ('removePvid', 'Hapus PVID'),
          ('setDescription', 'Ubah deskripsi'),
          ('enable', 'Aktifkan port'),
          ('disable', 'Matikan port'),
        ],
      ),
      FieldSpec('vlanId', 'VLAN ID', type: FieldType.integer, visibleIf: (v) => const {'addVlan', 'removeVlan', 'setPvid'}.contains(v['action'])),
      FieldSpec(
        'mode',
        'Mode',
        type: FieldType.select,
        initial: 'tag',
        options: const [('tag', 'Tagged (trunk)'), ('access', 'Access (PVID)')],
        visibleIf: (v) => v['action'] == 'addVlan',
      ),
      FieldSpec('description', 'Deskripsi', visibleIf: (v) => v['action'] == 'setDescription'),
    ],
    onSubmit: (v) async => out = _map(await _api.postLong('/api/olt/${olt['id']}/uplink', data: v)),
  );
  if (ok && out != null && context.mounted) await showResultScreen(context, title: 'Hasil uplink', data: out!);
  return false;
}

/// Registers an unconfigured ONU: reads the OLT's profiles first (like the
/// web dialog), then submits the vendor-specific payload.
Future<bool> registerOnu(BuildContext context, Json olt, Json onu) async {
  final id = olt['id'];
  Json meta = {};
  final loaded = await runAction(context, () async {
    final res = _map(
      await _api.get(
        '/api/olt/$id/onus/register',
        query: {'frame': onu['frame'], 'slot': onu['slot'], 'port': onu['port'], 'onuId': onu['onuId'], 'serialNumber': onu['serialNumber'] ?? ''},
      ),
    );
    meta = mapOf(res, 'metadata') ?? res;
  });
  if (!loaded || !context.mounted) return false;
  List<(String, String)> opts(String key) => [for (final t in (meta[key] as List?) ?? const []) ('$t', '$t')];
  final vendor = (str(olt, 'vendor') ?? '').toLowerCase();
  final zte = vendor == 'zte';
  final huawei = vendor == 'huawei';
  final fiberhome = vendor == 'fiberhome';
  bool tr069(Json v) => v['enableTr069'] == true;

  return openForm(
    context,
    title: 'Daftarkan ${onu['serialNumber'] ?? 'ONU'}',
    submitLabel: 'Daftarkan',
    fields: [
      FieldSpec.note('Port ${onu['frame'] ?? 0}/${onu['slot'] ?? 0}/${onu['port'] ?? 0} · ${str(olt, 'vendor')?.toUpperCase() ?? ''}'),
      FieldSpec(
        'onuType',
        'Tipe ONU',
        type: opts('onuTypes').isEmpty ? FieldType.text : FieldType.select,
        options: opts('onuTypes').isEmpty ? null : opts('onuTypes'),
      ),
      const FieldSpec('onuId', 'ONU ID', type: FieldType.integer, required: true),
      const FieldSpec('description', 'Deskripsi', hint: 'nama pelanggan'),
      const FieldSpec(
        'serviceTemplate',
        'Template layanan',
        type: FieldType.select,
        initial: 'basic',
        options: [
          ('basic', 'Dasar (1 VLAN)'),
          ('zte_full', 'ZTE lengkap (2 VLAN + WAN)'),
          ('huawei_full', 'Huawei lengkap'),
          ('fiberhome_veip', 'FiberHome VEIP'),
        ],
      ),
      const FieldSpec('vlan', 'VLAN', type: FieldType.integer),
      if (zte) ...[
        FieldSpec(
          'tcontProfile',
          'T-CONT profile',
          type: opts('tcontProfiles').isEmpty ? FieldType.text : FieldType.select,
          options: opts('tcontProfiles').isEmpty ? null : opts('tcontProfiles'),
        ),
        FieldSpec(
          'trafficProfile',
          'Traffic profile',
          type: opts('trafficProfiles').isEmpty ? FieldType.text : FieldType.select,
          options: opts('trafficProfiles').isEmpty ? null : opts('trafficProfiles'),
        ),
        const FieldSpec('primaryVlan', 'VLAN utama', type: FieldType.integer),
        const FieldSpec('secondaryVlan', 'VLAN kedua', type: FieldType.integer),
        const FieldSpec('mgmtVlan', 'VLAN manajemen', type: FieldType.integer),
        const FieldSpec('internetVlan', 'VLAN internet', type: FieldType.integer),
        const FieldSpec('voipVlan', 'VLAN VoIP', type: FieldType.integer),
        const FieldSpec('vlanProfile', 'VLAN profile'),
      ],
      if (huawei) ...[
        const FieldSpec('lineProfileId', 'Line profile ID', type: FieldType.integer),
        const FieldSpec('srvProfileId', 'Service profile ID', type: FieldType.integer),
      ],
      if (fiberhome) const FieldSpec('profileName', 'Profile name'),
      const FieldSpec.section('WAN PPPoE di ONU (opsional)'),
      FieldSpec('pppoeUsername', 'Username PPPoE', helper: 'Kosongkan bila PPPoE dijalankan di router pelanggan.'),
      const FieldSpec('pppoePassword', 'Password PPPoE', type: FieldType.password),
      const FieldSpec.section('WiFi (opsional)'),
      const FieldSpec('ssid1Name', 'SSID 1'),
      const FieldSpec('ssid1Password', 'Password SSID 1', type: FieldType.password),
      const FieldSpec('enableDualSsid', 'SSID kedua', type: FieldType.toggle),
      FieldSpec('ssid2Name', 'SSID 2', visibleIf: (v) => v['enableDualSsid'] == true),
      FieldSpec('ssid2Password', 'Password SSID 2', type: FieldType.password, visibleIf: (v) => v['enableDualSsid'] == true),
      const FieldSpec.section('TR-069 / keamanan'),
      const FieldSpec('enableTr069', 'Aktifkan TR-069 (GenieACS)', type: FieldType.toggle),
      FieldSpec('tr069Vlan', 'VLAN TR-069', type: FieldType.integer, visibleIf: tr069),
      FieldSpec('acsUrl', 'ACS URL', type: FieldType.url, visibleIf: tr069),
      FieldSpec('acsUsername', 'ACS username', visibleIf: tr069),
      FieldSpec('acsPassword', 'ACS password', type: FieldType.password, visibleIf: tr069),
      const FieldSpec('enableFirewall', 'Firewall ONU', type: FieldType.toggle),
      FieldSpec(
        'firewallLevel',
        'Level firewall',
        type: FieldType.select,
        initial: 'medium',
        options: const [('low', 'Rendah'), ('medium', 'Sedang'), ('high', 'Tinggi')],
        visibleIf: (v) => v['enableFirewall'] == true,
      ),
      const FieldSpec('enableSecurityMgmt', 'Batasi akses manajemen', type: FieldType.toggle),
    ],
    initial: {
      'onuType': meta['detectedOnuType'] ?? onu['onuType'] ?? (opts('onuTypes').isNotEmpty ? opts('onuTypes').first.$1 : null),
      'onuId': meta['suggestedOnuId'] ?? onu['onuId'],
    },
    success: 'ONU didaftarkan.',
    onSubmit: (v) => _api.postLong(
      '/api/olt/$id/onus/register',
      data: {
        'frame': onu['frame'],
        'slot': onu['slot'],
        'port': onu['port'],
        'serialNumber': onu['serialNumber'],
        ...{
          for (final e in v.entries)
            if (!isBlank(e.value)) e.key: e.value,
        },
      },
    ),
  );
}
