import 'dart:convert';

import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/crud/crud_list_screen.dart';
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
String _enc(Object? id) => Uri.encodeComponent('$id');

/// GenieACS hub — every /admin/genieacs page.
class GenieacsScreen extends StatelessWidget {
  const GenieacsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    Widget link(IconData icon, String title, String subtitle, VoidCallback onTap) => Padding(
      padding: const EdgeInsets.only(bottom: Gap.sm),
      child: EntityTile(icon: icon, tone: Tone.accent, title: title, subtitle: subtitle, onTap: onTap),
    );
    return Scaffold(
      appBar: AppBar(title: const Text('GenieACS (TR-069)')),
      body: ListView(
        padding: EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, listBottomPadding(context)),
        children: [
          link(Icons.router_rounded, 'Perangkat', 'ONT/CPE: WiFi, WAN, reboot, reset', () => CrudListScreen.open(context, acsDevicesConfig())),
          link(Icons.pending_actions_rounded, 'Tugas', 'Antrian tugas ke perangkat', () => CrudListScreen.open(context, acsTasksConfig())),
          link(Icons.report_problem_rounded, 'Fault', 'Error dari perangkat', () => CrudListScreen.open(context, acsFaultsConfig())),
          link(
            Icons.auto_mode_rounded,
            'Auto provision',
            'Parameter yang diset otomatis saat inform',
            () => SettingsFormScreen.open(context, acsAutoProvision()),
          ),
          link(Icons.rule_rounded, 'Preset', 'Aturan kapan provision dijalankan', () => CrudListScreen.open(context, acsPresetsConfig())),
          link(Icons.code_rounded, 'Provision', 'Script provision', () => CrudListScreen.open(context, acsScriptsConfig('provisions', 'Provision'))),
          link(
            Icons.functions_rounded,
            'Virtual parameter (script)',
            'Script VP di GenieACS',
            () => CrudListScreen.open(context, acsScriptsConfig('virtual-parameters', 'Virtual Parameter')),
          ),
          link(
            Icons.dashboard_customize_rounded,
            'Virtual parameter tampilan',
            'Kartu parameter di detail perangkat',
            () => CrudListScreen.open(context, acsDisplayVpConfig()),
          ),
          link(Icons.view_list_rounded, 'Tampilan parameter', 'Kolom parameter per bagian', () => CrudListScreen.open(context, acsParameterDisplayConfig())),
          link(Icons.tune_rounded, 'Konfigurasi server', 'cwmp.* / nbi.* di GenieACS', () => CrudListScreen.open(context, acsServerConfig())),
          link(Icons.settings_rounded, 'Koneksi GenieACS', 'Host & kredensial NBI', () => SettingsFormScreen.open(context, acsConnectionSettings())),
        ],
      ),
    );
  }
}

SettingsFormScreen acsConnectionSettings() => SettingsFormScreen(
  title: 'Koneksi GenieACS',
  load: () async {
    final res = _map(await _api.get('/api/settings/genieacs'));
    return {...(mapOf(res, 'settings') ?? res), 'password': null};
  },
  fields: (s) => [
    const FieldSpec('host', 'URL NBI', type: FieldType.url, required: true, hint: 'http://10.0.0.5:7557'),
    const FieldSpec('username', 'Username'),
    FieldSpec(
      'password',
      'Password',
      type: FieldType.password,
      omitWhenEmpty: true,
      helper: s['hasPassword'] == true ? 'Tersimpan. Kosongkan jika tidak diganti.' : null,
    ),
    const FieldSpec('nbiSecurityAcknowledged', 'Saya paham NBI harus dibatasi firewall', type: FieldType.toggle),
  ],
  save: (v, _) => _api.post('/api/settings/genieacs', data: v),
  secondary: [
    FormAction('Tes', Icons.network_check_rounded, (v) async {
      final res = _map(await _api.post('/api/settings/genieacs/test', data: v));
      return res['success'] == true ? (res['message']?.toString() ?? 'Terhubung.') : 'Gagal: ${res['message'] ?? res['error'] ?? '-'}';
    }),
  ],
);

const _securityModes = [
  ('None', 'Terbuka (tanpa password)'),
  ('WPA-PSK', 'WPA-PSK'),
  ('WPA2-PSK', 'WPA2-PSK (disarankan)'),
  ('WPA-WPA2-PSK', 'WPA/WPA2 campuran'),
];

CrudConfig acsDevicesConfig() {
  String id(Json d) => _enc(d['_id']);
  CrudAction task(String label, IconData icon, String path, {String? confirm, Json? body, ActionKind kind = ActionKind.neutral}) => CommonActions.confirmPost(
    label,
    icon,
    (d) => '/api/genieacs/devices/${id(d)}/$path',
    confirm: confirm,
    body: body == null ? null : (_) => body,
    kind: kind,
    long: true,
    reload: false,
  );
  return CrudConfig(
    title: 'Perangkat ACS',
    noun: 'Perangkat',
    icon: Icons.router_rounded,
    tone: Tone.accent,
    fetch: (_) => _api.get('/api/settings/genieacs/devices'),
    listKey: 'devices',
    idKey: '_id',
    filters: const [('all', 'Semua'), ('online', 'Online'), ('offline', 'Offline')],
    filterOf: (d) => str(d, 'status'),
    initialFilter: 'all',
    searchHint: 'Cari SN, PPPoE, model',
    searchTextOf: (d) => '${d['serialNumber']} ${d['pppoeUsername']} ${d['model']} ${d['manufacturer']} ${d['macAddress']}',
    titleOf: (d) => str(d, 'pppoeUsername') ?? str(d, 'serialNumber') ?? str(d, '_id') ?? '-',
    subtitleOf: (d) => [str(d, 'manufacturer'), str(d, 'model'), str(d, 'serialNumber')].whereType<String>().join(' · '),
    metaOf: (d) => [if (d['rxPower'] != null) 'Rx ${d['rxPower']} dBm', str(d, 'pppoeIP'), str(d, 'ssid')].whereType<String>().join(' · '),
    toneOf: (d) => d['status'] == 'online' ? Tone.success : Tone.danger,
    statusOf: (d) => StatusPill(label: d['status'] == 'online' ? 'Online' : 'Offline', tone: d['status'] == 'online' ? Tone.success : Tone.danger),
    sectionsOf: (context, d) => [
      DetailSection(
        rows: [
          InfoRow('Device ID', str(d, '_id'), copyable: true),
          InfoRow('Serial number', str(d, 'serialNumber'), copyable: true),
          InfoRow('Pabrikan / model', [str(d, 'manufacturer'), str(d, 'model')].whereType<String>().join(' ')),
          InfoRow('Firmware', str(d, 'softwareVersion')),
          InfoRow('PPPoE', str(d, 'pppoeUsername'), copyable: true),
          InfoRow('IP PPPoE', str(d, 'pppoeIP'), copyable: true),
          InfoRow('IP TR-069', str(d, 'tr069IP')),
          InfoRow('Rx power', d['rxPower'] == null ? null : '${d['rxPower']} dBm'),
          InfoRow('Mode PON', str(d, 'ponMode')),
          InfoRow('SSID', str(d, 'ssid')),
          InfoRow('User terhubung', str(d, 'userConnected')),
          InfoRow('MAC', str(d, 'macAddress'), copyable: true),
          InfoRow('Suhu', str(d, 'temp')),
          InfoRow('Uptime', str(d, 'uptime')),
          InfoRow('Inform terakhir', formatDateTimeOrNull(dateOf(d, 'lastInform'))),
        ],
      ),
    ],
    delete: (d) => _api.delete('/api/settings/genieacs/devices/${id(d)}'),
    deleteMessage: (_) => 'Perangkat dihapus dari GenieACS. Akan muncul lagi saat inform berikutnya.',
    itemActions: [
      CrudAction('Ubah WiFi', Icons.wifi_rounded, (ctx, d) async {
        Json current = {};
        try {
          current = mapOf(_map(await _api.get('/api/genieacs/devices/${id(d)}/wifi', query: {'wlanIndex': 1})), 'config') ?? {};
        } on ApiException catch (_) {}
        if (!ctx.mounted) return false;
        return openForm(
          ctx,
          title: 'WiFi ${d['pppoeUsername'] ?? ''}',
          submitLabel: 'Kirim ke perangkat',
          fields: const [
            FieldSpec(
              'wlanIndex',
              'WLAN',
              type: FieldType.select,
              initial: '1',
              options: [('1', 'WLAN 1 (2.4 GHz)'), ('2', 'WLAN 2'), ('3', 'WLAN 3'), ('4', 'WLAN 4'), ('5', 'WLAN 5 (5 GHz)')],
            ),
            FieldSpec('ssid', 'Nama WiFi (SSID)', required: true),
            FieldSpec('securityMode', 'Keamanan', type: FieldType.select, initial: 'WPA2-PSK', options: _securityModes),
            FieldSpec('password', 'Password WiFi', type: FieldType.password, helper: 'Minimal 8 karakter. Kosongkan jika tidak diganti.', omitWhenEmpty: true),
            FieldSpec('enabled', 'WiFi aktif', type: FieldType.toggle, initial: true),
          ],
          initial: {'ssid': current['ssid'] ?? d['ssid'], 'enabled': current['enabled'] ?? true, 'securityMode': current['securityMode'] ?? 'WPA2-PSK'},
          success: 'Perubahan WiFi dikirim ke perangkat.',
          onSubmit: (v) => _api.postLong('/api/genieacs/devices/${id(d)}/wifi', data: {...v, 'wlanIndex': int.tryParse('${v['wlanIndex']}') ?? 1}),
        );
      }, kind: ActionKind.primary),
      CommonActions.form(
        'Tambah WAN',
        Icons.add_link_rounded,
        fields: (_) => _wanFields(),
        submitLabel: 'Buat',
        success: 'WAN dibuat.',
        submit: (d, v) => _api.putLong('/api/genieacs/devices/${id(d)}/wan', data: v),
      ),
      CommonActions.form(
        'Ubah WAN',
        Icons.settings_ethernet_rounded,
        fields: (_) => [
          const FieldSpec('connectionPath', 'Path koneksi', required: true, hint: 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1'),
          ..._wanFields(edit: true),
        ],
        submitLabel: 'Simpan',
        success: 'WAN diperbarui.',
        submit: (d, v) => _api.postLong('/api/genieacs/devices/${id(d)}/wan', data: v),
      ),
      CommonActions.form(
        'Hapus WAN',
        Icons.link_off_rounded,
        fields: (_) => const [FieldSpec('connectionPath', 'Path koneksi', required: true)],
        submitLabel: 'Hapus',
        kind: ActionKind.danger,
        success: 'WAN dihapus.',
        submit: (d, v) => _api.delete('/api/genieacs/devices/${id(d)}/wan', data: v),
      ),
      task('Connection request', Icons.bolt_rounded, 'connection-request'),
      task('Refresh parameter', Icons.refresh_rounded, 'refresh', body: const {'objectName': 'InternetGatewayDevice'}),
      task('Reboot', Icons.restart_alt_rounded, 'reboot', confirm: 'Perangkat pelanggan restart (±2 menit tanpa internet).', kind: ActionKind.warning),
      task(
        'Factory reset',
        Icons.settings_backup_restore_rounded,
        'factory-reset',
        confirm: 'Semua pengaturan perangkat (WiFi, WAN) kembali ke pabrik. Pelanggan offline sampai dikonfigurasi ulang.',
        kind: ActionKind.danger,
      ),
      CommonActions.showResult('Traffic', Icons.show_chart_rounded, (d) => '/api/genieacs/devices/${id(d)}/traffic', method: 'GET'),
      CrudAction('Tugas perangkat', Icons.pending_actions_rounded, (ctx, d) async {
        await CrudListScreen.open(ctx, acsTasksConfig(deviceId: '${d['_id']}'));
        return false;
      }),
      CommonActions.form(
        'Kirim tugas',
        Icons.send_rounded,
        fields: (_) => const [
          FieldSpec(
            'taskName',
            'Tugas',
            type: FieldType.select,
            required: true,
            initial: 'refreshObject',
            options: [('refreshObject', 'Refresh object'), ('reboot', 'Reboot'), ('factoryReset', 'Factory reset'), ('getParameterValues', 'Ambil parameter')],
          ),
        ],
        submitLabel: 'Kirim',
        success: 'Tugas dikirim.',
        submit: (d, v) => _api.post('/api/settings/genieacs/tasks', data: {'deviceId': d['_id'], ...v}),
      ),
      CommonActions.form(
        'Set parameter',
        Icons.edit_note_rounded,
        fields: (_) => const [
          FieldSpec('path', 'Path parameter', required: true, hint: 'InternetGatewayDevice.ManagementServer.PeriodicInformInterval'),
          FieldSpec('value', 'Nilai', required: true),
          FieldSpec(
            'type',
            'Tipe',
            type: FieldType.select,
            initial: 'xsd:string',
            options: [('xsd:string', 'string'), ('xsd:boolean', 'boolean'), ('xsd:int', 'int'), ('xsd:unsignedInt', 'unsignedInt')],
          ),
        ],
        submitLabel: 'Kirim',
        success: 'Parameter dikirim.',
        submit: (d, v) => _api.postLong(
          '/api/genieacs/devices/${id(d)}/parameters',
          data: {
            'updates': [
              {'path': v['path'], 'value': v['value'], 'type': v['type']},
            ],
          },
        ),
      ),
      CommonActions.form(
        'Firmware / file',
        Icons.system_update_alt_rounded,
        fields: (_) => const [
          FieldSpec('fileName', 'Nama file di GenieACS', required: true),
          FieldSpec(
            'fileType',
            'Jenis',
            type: FieldType.select,
            initial: '1 Firmware Upgrade Image',
            options: [('1 Firmware Upgrade Image', 'Firmware'), ('3 Vendor Configuration File', 'File konfigurasi')],
          ),
          FieldSpec('targetFileName', 'Nama file tujuan'),
        ],
        submitLabel: 'Kirim',
        success: 'Download dijadwalkan ke perangkat.',
        submit: (d, v) => _api.postLong('/api/genieacs/devices/${id(d)}/download', data: v),
      ),
    ],
  );
}

List<FieldSpec> _wanFields({bool edit = false}) => [
  const FieldSpec('connectionType', 'Jenis', type: FieldType.select, initial: 'PPPoE', options: [('PPPoE', 'PPPoE'), ('IP', 'IP (DHCP)')]),
  if (!edit) const FieldSpec('name', 'Nama koneksi'),
  FieldSpec('username', 'Username PPPoE', visibleIf: (v) => v['connectionType'] != 'IP'),
  FieldSpec('password', 'Password PPPoE', type: FieldType.password, visibleIf: (v) => v['connectionType'] != 'IP', omitWhenEmpty: true),
  const FieldSpec('vlanId', 'VLAN ID', type: FieldType.integer),
  const FieldSpec('vlanPriority', 'Prioritas VLAN', type: FieldType.integer, initial: 0),
  const FieldSpec(
    'serviceList',
    'Service',
    type: FieldType.select,
    initial: 'INTERNET',
    options: [('INTERNET', 'INTERNET'), ('TR069', 'TR069'), ('VOIP', 'VOIP'), ('IPTV', 'IPTV'), ('INTERNET_TR069', 'INTERNET,TR069'), ('OTHER', 'OTHER')],
  ),
  if (!edit) const FieldSpec('wanDeviceIndex', 'WANDevice', type: FieldType.integer, initial: 1),
  if (!edit) const FieldSpec('wanConnectionDeviceIndex', 'WANConnectionDevice', type: FieldType.integer, initial: 1),
  const FieldSpec('enable', 'Aktif', type: FieldType.toggle, initial: true),
  const FieldSpec('natEnabled', 'NAT', type: FieldType.toggle, initial: true),
];

CrudConfig acsTasksConfig({String? deviceId}) => CrudConfig(
  title: deviceId == null ? 'Tugas ACS' : 'Tugas perangkat',
  noun: 'Tugas',
  icon: Icons.pending_actions_rounded,
  fetch: (_) => deviceId == null ? _api.get('/api/genieacs/tasks') : _api.get('/api/genieacs/devices/${_enc(deviceId)}/tasks'),
  idKey: '_id',
  titleOf: (t) => str(t, 'name') ?? '-',
  subtitleOf: (t) => str(t, 'device'),
  metaOf: (t) => [formatDateTimeOrNull(dateOf(t, 'timestamp')), if (t['fault'] != null) 'fault'].whereType<String>().join(' · '),
  toneOf: (t) => t['fault'] != null ? Tone.danger : Tone.warning,
  delete: (t) => _api.delete('/api/genieacs/tasks/${_enc(t['_id'])}'),
  itemActions: [CommonActions.confirmPost('Ulangi', Icons.replay_rounded, (t) => '/api/genieacs/tasks/${_enc(t['_id'])}/retry')],
);

CrudConfig acsFaultsConfig() => CrudConfig(
  title: 'Fault ACS',
  noun: 'Fault',
  icon: Icons.report_problem_rounded,
  tone: Tone.danger,
  fetch: (_) => _api.get('/api/genieacs/faults'),
  idKey: '_id',
  titleOf: (f) => str(f, '_id') ?? '-',
  subtitleOf: (f) => [str(f, 'code'), str(f, 'message')].whereType<String>().join(' · '),
  metaOf: (f) =>
      [str(f, 'device'), formatDateTimeOrNull(dateOf(f, 'timestamp')), if (f['retries'] != null) '${f['retries']}x ulang'].whereType<String>().join(' · '),
  sectionsOf: (context, f) => [
    DetailSection(
      rows: [
        InfoRow('ID', str(f, '_id'), copyable: true),
        InfoRow('Perangkat', str(f, 'device'), copyable: true),
        InfoRow('Kode', str(f, 'code')),
        InfoRow('Pesan', str(f, 'message')),
        InfoRow('Detail', f['detail'] == null ? null : const JsonEncoder.withIndent('  ').convert(f['detail'])),
      ],
    ),
  ],
  delete: (f) => _api.delete('/api/genieacs/faults', data: {'id': f['_id']}),
  bulkActions: [
    CrudAction('Hapus', Icons.delete_outline_rounded, (ctx, s) async {
      final ids = [for (final f in (s['items'] as List).cast<Json>()) f['_id']];
      final ok = await confirmAction(
        ctx,
        title: 'Hapus ${ids.length} fault?',
        message: 'Fault dihapus dari GenieACS.',
        confirmLabel: 'Hapus',
        destructive: true,
      );
      if (!ok || !ctx.mounted) return false;
      return runAction(ctx, () => _api.post('/api/genieacs/faults/bulk-delete', data: {'ids': ids}), success: 'Fault dihapus.');
    }, kind: ActionKind.danger),
  ],
);

SettingsFormScreen acsAutoProvision() => SettingsFormScreen(
  title: 'Auto Provision',
  load: () async {
    final res = _map(await _api.get('/api/genieacs/auto-provision'));
    final data = mapOf(res, 'data') ?? res;
    final preset = mapOf(data, 'preset') ?? {};
    return {
      'channel': preset['channel'] ?? 'default',
      'precondition': preset['precondition'] ?? 'true',
      'weight': preset['weight'] ?? 0,
      'currentScript': mapOf(data, 'provision')?['script'],
    };
  },
  header: (context, s) =>
      s['currentScript'] == null ? null : DetailSection(title: 'Script aktif', rows: [InfoRow('Script', '${s['currentScript']}', copyable: true)]),
  fields: (_) => const [
    FieldSpec('channel', 'Channel', initial: 'default'),
    FieldSpec('precondition', 'Precondition', initial: 'true', helper: 'Filter perangkat, mis. DeviceID.ProductClass = "F660"'),
    FieldSpec('weight', 'Weight', type: FieldType.integer, initial: 0),
    FieldSpec(
      'setParameters',
      'Parameter yang diset',
      type: FieldType.multiline,
      hint: 'InternetGatewayDevice.ManagementServer.PeriodicInformInterval|300|xsd:unsignedInt',
      helper: 'Satu per baris: path|nilai|tipe (tipe opsional).',
    ),
    FieldSpec('additionalScript', 'Script tambahan', type: FieldType.multiline),
  ],
  save: (v, _) {
    final params = [
      for (final line in ('${v['setParameters'] ?? ''}').split('\n'))
        if (line.trim().isNotEmpty)
          () {
            final p = line.split('|');
            return {'path': p[0].trim(), 'value': p.length > 1 ? p[1].trim() : '', 'type': p.length > 2 ? p[2].trim() : 'xsd:string'};
          }(),
    ];
    return _api.post('/api/genieacs/auto-provision', data: {...v, 'setParameters': params});
  },
  secondary: [
    FormAction('Hapus', Icons.delete_outline_rounded, (_) async {
      await _api.delete('/api/genieacs/auto-provision');
      return 'Auto provision dihapus.';
    }),
  ],
);

CrudConfig acsPresetsConfig() => CrudConfig(
  title: 'Preset',
  noun: 'Preset',
  icon: Icons.rule_rounded,
  fetch: (_) => _api.get('/api/genieacs/presets'),
  idKey: '_id',
  titleOf: (p) => str(p, '_id') ?? '-',
  subtitleOf: (p) => 'Channel ${p['channel'] ?? '-'} · weight ${p['weight'] ?? 0}',
  metaOf: (p) => str(p, 'precondition'),
  sectionsOf: (context, p) => [
    DetailSection(rows: [InfoRow('JSON', const JsonEncoder.withIndent('  ').convert(p), copyable: true)]),
  ],
  fields: (p) => const [
    FieldSpec('json', 'Preset (JSON)', type: FieldType.multiline, required: true, helper: 'Wajib ada _id. Format sama dengan GenieACS NBI.'),
  ],
  initialOf: (p) => {'json': const JsonEncoder.withIndent('  ').convert(p)},
  create: (v) async {
    final body = _parseJson(v['json']);
    await _api.post('/api/genieacs/presets', data: body);
  },
  update: (p, v) => _api.put('/api/genieacs/presets/${_enc(p['_id'])}', data: _parseJson(v['json'])),
  delete: (p) => _api.delete('/api/genieacs/presets/${_enc(p['_id'])}'),
  toolbar: [CommonActions.showResult('Sinkron ke GenieACS', Icons.sync_rounded, (_) => '/api/genieacs/sync')],
);

Json _parseJson(Object? raw) {
  try {
    final v = jsonDecode('$raw');
    if (v is! Map || v['_id'] == null) throw ApiException('JSON harus objek dengan _id.');
    return v.cast<String, dynamic>();
  } on FormatException {
    throw ApiException('JSON tidak valid.');
  }
}

/// Provisions and virtual-parameter scripts share one shape: _id + script.
CrudConfig acsScriptsConfig(String resource, String noun) => CrudConfig(
  title: noun,
  noun: noun,
  icon: Icons.code_rounded,
  fetch: (_) => _api.get('/api/genieacs/$resource'),
  idKey: '_id',
  titleOf: (p) => str(p, '_id') ?? '-',
  subtitleOf: (p) => str(p, 'description'),
  metaOf: (p) =>
      p['syncError'] != null ? 'Gagal sinkron: ${p['syncError']}' : (p['syncedAt'] != null ? 'Sinkron ${formatDateTimeOrNull(dateOf(p, 'syncedAt'))}' : null),
  sectionsOf: (context, p) => [
    DetailSection(rows: [InfoRow('Deskripsi', str(p, 'description')), InfoRow('Script', str(p, 'script'), copyable: true)]),
  ],
  fields: (p) => [
    FieldSpec('_id', 'ID', required: true, readOnly: p != null),
    const FieldSpec('description', 'Deskripsi'),
    const FieldSpec('script', 'Script', type: FieldType.multiline, required: true),
  ],
  create: CrudRoutes.postTo('/api/genieacs/$resource'),
  update: (p, v) => _api.put('/api/genieacs/$resource/${_enc(p['_id'])}', data: {'description': v['description'], 'script': v['script']}),
  delete: (p) => _api.delete('/api/genieacs/$resource/${_enc(p['_id'])}'),
  toolbar: [
    CommonActions.showResult('Sinkron semua ke GenieACS', Icons.sync_rounded, (_) => '/api/genieacs/sync'),
    CrudAction('Lihat backup', Icons.backup_rounded, (ctx, _) async {
      final res = _map(await _api.get('/api/genieacs/backup', query: {'type': resource == 'provisions' ? 'provisions' : 'vpScripts'}));
      if (ctx.mounted) await showResultScreen(ctx, title: 'Backup $noun', data: {'output': const JsonEncoder.withIndent('  ').convert(res['data'] ?? res)});
      return false;
    }),
  ],
);

/// Virtual parameters shown on the device detail — /admin/genieacs/virtual-parameters.
CrudConfig acsDisplayVpConfig() => CrudConfig(
  title: 'Virtual Parameter',
  noun: 'Virtual Parameter',
  icon: Icons.dashboard_customize_rounded,
  fetch: (_) => _api.get('/api/settings/genieacs/virtual-parameters'),
  listKey: 'data',
  titleOf: (v) => str(v, 'name') ?? '-',
  subtitleOf: (v) => str(v, 'parameter'),
  metaOf: (v) => [str(v, 'category'), str(v, 'displayType'), str(v, 'unit')].whereType<String>().join(' · '),
  statusOf: (v) => v['isActive'] == false ? const StatusPill(label: 'Nonaktif', tone: Tone.neutral) : null,
  fields: (_) => const [
    FieldSpec('name', 'Nama', required: true),
    FieldSpec('parameter', 'Parameter', required: true, hint: 'VirtualParameters.RXPower'),
    FieldSpec('expression', 'Ekspresi'),
    FieldSpec(
      'displayType',
      'Tampilan',
      type: FieldType.select,
      initial: 'card',
      options: [('card', 'Kartu'), ('badge', 'Badge'), ('text', 'Teks'), ('gauge', 'Gauge')],
    ),
    FieldSpec('displayOrder', 'Urutan', type: FieldType.integer, initial: 0),
    FieldSpec('category', 'Kategori'),
    FieldSpec('unit', 'Satuan'),
    FieldSpec('icon', 'Ikon'),
    FieldSpec('color', 'Warna', initial: 'purple'),
    FieldSpec('description', 'Deskripsi'),
    FieldSpec('showInSummary', 'Tampil di ringkasan', type: FieldType.toggle, initial: true),
    FieldSpec('isActive', 'Aktif', type: FieldType.toggle, initial: true),
  ],
  create: CrudRoutes.postTo('/api/settings/genieacs/virtual-parameters'),
  update: CrudRoutes.putById('/api/settings/genieacs/virtual-parameters'),
  delete: CrudRoutes.deleteById('/api/settings/genieacs/virtual-parameters'),
);

CrudConfig acsParameterDisplayConfig() => CrudConfig(
  title: 'Tampilan Parameter',
  noun: 'Kolom',
  icon: Icons.view_list_rounded,
  fetch: (_) => _api.get('/api/settings/genieacs/parameter-display'),
  listKey: 'configs',
  titleOf: (c) => str(c, 'label') ?? str(c, 'parameterName') ?? '-',
  subtitleOf: (c) => [str(c, 'section'), str(c, 'format')].whereType<String>().join(' · '),
  metaOf: (c) => (c['parameterPaths'] is List) ? (c['parameterPaths'] as List).join(', ') : str(c, 'parameterPaths'),
  statusOf: (c) => c['enabled'] == false ? const StatusPill(label: 'Tersembunyi', tone: Tone.neutral) : null,
  fields: (_) => const [
    FieldSpec('label', 'Label', required: true),
    FieldSpec('parameterName', 'Nama parameter', required: true),
    FieldSpec('parameterPaths', 'Path (satu per baris)', type: FieldType.multiline, required: true),
    FieldSpec('section', 'Bagian', initial: 'general'),
    FieldSpec(
      'format',
      'Format',
      type: FieldType.select,
      initial: 'text',
      options: [
        ('text', 'Teks'),
        ('dBm', 'dBm'),
        ('celsius', 'Celsius'),
        ('voltage', 'Volt'),
        ('bytes', 'Bytes'),
        ('datetime', 'Tanggal'),
        ('uptime', 'Uptime'),
        ('status', 'Status'),
      ],
    ),
    FieldSpec('displayOrder', 'Urutan', type: FieldType.integer, initial: 0),
    FieldSpec('columnWidth', 'Lebar kolom', type: FieldType.integer),
    FieldSpec('icon', 'Ikon'),
    FieldSpec('enabled', 'Tampilkan', type: FieldType.toggle, initial: true),
  ],
  initialOf: (c) => {...c, 'parameterPaths': c['parameterPaths'] is List ? (c['parameterPaths'] as List).join('\n') : c['parameterPaths']},
  create: (v) => _api.post('/api/settings/genieacs/parameter-display', data: _paths(v)),
  update: (c, v) => _api.put('/api/settings/genieacs/parameter-display/${c['id']}', data: _paths(v)),
  delete: CrudRoutes.deleteById('/api/settings/genieacs/parameter-display'),
  toolbar: [
    CommonActions.confirmPost(
      'Kembalikan bawaan',
      Icons.settings_backup_restore_rounded,
      (_) => '/api/settings/genieacs/parameter-display/reset',
      confirm: 'Semua tampilan parameter kembali ke bawaan.',
      kind: ActionKind.danger,
    ),
  ],
);

Json _paths(Json v) => {
  ...v,
  'parameterPaths': [
    for (final l in '${v['parameterPaths'] ?? ''}'.split('\n'))
      if (l.trim().isNotEmpty) l.trim(),
  ],
};

CrudConfig acsServerConfig() => CrudConfig(
  title: 'Konfigurasi GenieACS',
  noun: 'Konfigurasi',
  icon: Icons.tune_rounded,
  fetch: (_) => _api.get('/api/genieacs/config'),
  idKey: '_id',
  titleOf: (c) => str(c, '_id') ?? '-',
  subtitleOf: (c) => str(c, 'value'),
  fields: (c) => [
    FieldSpec('_id', 'Kunci', required: true, readOnly: c != null, hint: 'cwmp.downloadTimeout'),
    const FieldSpec('value', 'Nilai', required: true),
  ],
  create: (v) => _api.put('/api/genieacs/config', data: {'id': v['_id'], 'value': v['value']}),
  update: (c, v) => _api.put('/api/genieacs/config', data: {'id': c['_id'], 'value': v['value']}),
  delete: (c) => _api.delete('/api/genieacs/config', data: {'id': c['_id']}),
);
