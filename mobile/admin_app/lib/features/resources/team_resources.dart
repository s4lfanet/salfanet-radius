import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/api/api_client.dart';
import '../../core/crud/crud_list_screen.dart';
import '../../core/crud/lookups.dart';
import '../../core/formatters.dart';
import '../../core/forms/field_spec.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/entity_tile.dart';

final _api = ApiClient.instance;

const staffRoles = <(String, String)>[
  ('SUPER_ADMIN', 'Super Admin'),
  ('FINANCE', 'Finance'),
  ('CUSTOMER_SERVICE', 'Customer Service'),
  ('TECHNICIAN', 'Teknisi'),
  ('MARKETING', 'Marketing'),
  ('VIEWER', 'Viewer'),
  ('COLLECTOR', 'Kolektor'),
];
String roleLabel(String? r) => staffRoles.firstWhere((x) => x.$1 == r, orElse: () => (r ?? '', r ?? '-')).$2;

/// Roles given in Staf & Tim. Technicians are created in Teknisi Lapangan
/// (the account work orders belong to) and collectors in Kolektor, as on
/// the web; a technician admin account made earlier keeps its role.
const officeRoles = <(String, String)>[
  ('SUPER_ADMIN', 'Super Admin'),
  ('FINANCE', 'Finance'),
  ('CUSTOMER_SERVICE', 'Customer Service'),
  ('MARKETING', 'Marketing'),
  ('VIEWER', 'Viewer'),
];

Widget _activePill(Json i) =>
    i['isActive'] == false ? const StatusPill(label: 'Nonaktif', tone: Tone.neutral) : const StatusPill(label: 'Aktif', tone: Tone.success);

Future<FieldOptions> _permissionOptions() async {
  final res = await _api.get('/api/permissions');
  final grouped = res is Map ? res['permissions'] : null;
  if (grouped is! Map) return const [];
  return [
    for (final entry in grouped.entries)
      for (final p in (entry.value as List).whereType<Map>()) (p['key'].toString(), '${entry.key} · ${p['name'] ?? p['key']}'),
  ];
}

/// The web fills a new account's permissions from its role template; do
/// the same when the admin leaves the list empty.
Future<List<String>> _roleTemplate(String role) async {
  final res = await _api.get('/api/permissions/role-templates');
  final t = res is Map ? res['templates'] : null;
  return t is Map ? ((t[role] as List?) ?? const []).map((e) => e.toString()).toList() : const [];
}

/// Staf & Tim — mirrors /admin/management.
CrudConfig staffConfig() => CrudConfig(
  title: 'Staf & Tim',
  noun: 'Akun Staf',
  icon: Icons.badge_rounded,
  fetch: (_) => _api.get('/api/admin/users'),
  // Collectors are managed in Kolektor.
  parse: (res) => extractList(res, listKey: 'users').where((u) => u['role'] != 'COLLECTOR').toList(),
  header: (context, _) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Padding(
        padding: const EdgeInsets.only(bottom: Gap.sm),
        child: Text(
          'Untuk staf kantor. Teknisi dibuat di menu Teknisi Lapangan, kolektor di menu Kolektor.',
          style: TextStyle(fontSize: 12.5, height: 1.4, color: context.colors.onSurfaceVariant),
        ),
      ),
      const LoginLinks(
        title: 'Alamat login tiap portal',
        links: [
          ('Admin & staf kantor', '/admin/login'),
          ('Teknisi', '/technician/login'),
          ('Kolektor', '/collector/login'),
          ('Agen voucher', '/agent'),
          ('Pelanggan', '/customer/login'),
        ],
      ),
    ],
  ),
  titleOf: (u) => str(u, 'name') ?? str(u, 'username') ?? '-',
  subtitleOf: (u) => '@${u['username']} · ${roleLabel(str(u, 'role'))}',
  metaOf: (u) =>
      [str(u, 'email'), str(u, 'phone'), if (u['lastLogin'] != null) 'Login ${formatDateTimeOrNull(dateOf(u, 'lastLogin'))}'].whereType<String>().join(' · '),
  toneOf: (u) => u['isActive'] == false ? Tone.neutral : (u['role'] == 'SUPER_ADMIN' ? Tone.accent : Tone.primary),
  statusOf: _activePill,
  filters: const [('all', 'Semua'), ...officeRoles],
  filterOf: (u) => str(u, 'role'),
  initialFilter: 'all',
  sectionsOf: (context, u) {
    final perms = (u['permissions'] as List?)?.map((e) => e.toString()).toList() ?? const [];
    final grouped = <String, List<String>>{};
    for (final p in perms) {
      final parts = p.split('.');
      grouped.putIfAbsent(parts.first, () => []).add(parts.length > 1 ? parts.sublist(1).join('.') : '');
    }
    return [
      DetailSection(
        title: 'Akun',
        rows: [
          InfoRow('Username', str(u, 'username'), copyable: true),
          InfoRow('Peran', roleLabel(str(u, 'role'))),
          InfoRow('Email', str(u, 'email'), copyable: true),
          InfoRow('Telepon', str(u, 'phone'), copyable: true),
          InfoRow('Area', str(mapOf(u, 'area'), 'name')),
          InfoRow('Login terakhir', formatDateTimeOrNull(dateOf(u, 'lastLogin'))),
          InfoRow('Status', u['isActive'] == false ? 'Nonaktif' : 'Aktif'),
        ],
      ),
      DetailSection(
        title: 'Hak akses (${perms.length})',
        rows: [for (final e in grouped.entries) InfoRow(e.key, e.value.join(', ')), if (perms.isEmpty) const InfoRow('Hak akses', 'Bawaan peran')],
      ),
    ];
  },
  fields: (u) => [
    FieldSpec('username', 'Username', required: true, readOnly: u != null, helper: u != null ? 'Username tidak bisa diubah.' : null),
    const FieldSpec('name', 'Nama'),
    const FieldSpec('email', 'Email', type: FieldType.email),
    const FieldSpec('phone', 'Telepon', type: FieldType.phone),
    FieldSpec(
      'password',
      u == null ? 'Password' : 'Password baru',
      type: FieldType.password,
      required: u == null,
      omitWhenEmpty: u != null,
      helper: u != null ? 'Kosongkan jika tidak diganti.' : null,
    ),
    FieldSpec(
      'role',
      'Peran',
      type: FieldType.select,
      required: true,
      initial: 'CUSTOMER_SERVICE',
      options: u?['role'] == 'TECHNICIAN' ? const [...officeRoles, ('TECHNICIAN', 'Teknisi (akun lama)')] : officeRoles,
    ),
    if (u != null) const FieldSpec('isActive', 'Akun aktif', type: FieldType.toggle, initial: true),
    FieldSpec(
      'permissions',
      'Hak akses',
      type: FieldType.multiSelect,
      loadOptions: _permissionOptions,
      helper: 'Kosongkan untuk memakai hak akses bawaan peran.',
    ),
  ],
  initialOf: (u) => {...u, 'areaId': mapOf(u, 'area')?['id'] ?? u['areaId'], 'password': null},
  create: (v) async {
    final perms = (v['permissions'] as List?) ?? const [];
    await _api.post('/api/admin/users', data: {...v, 'permissions': perms.isEmpty ? await _roleTemplate(v['role'] as String) : perms});
  },
  update: (u, v) async {
    final perms = (v['permissions'] as List?) ?? const [];
    await _api.put('/api/admin/users/${u['id']}', data: {...v, 'permissions': perms.isEmpty ? await _roleTemplate(v['role'] as String) : perms});
  },
  delete: CrudRoutes.deleteById('/api/admin/users'),
  deleteMessage: (u) => 'Akun @${u['username']} dihapus dan tidak bisa login lagi.',
);

/// Kolektor — mirrors /admin/collectors (admin accounts with role COLLECTOR).
CrudConfig collectorsConfig() => CrudConfig(
  title: 'Kolektor',
  noun: 'Kolektor',
  icon: Icons.badge_rounded,
  tone: Tone.warning,
  fetch: (_) => _api.get('/api/admin/users'),
  parse: (res) => extractList(res, listKey: 'users').where((u) => u['role'] == 'COLLECTOR').toList(),
  header: (context, _) => const LoginLinks(title: 'Alamat login kolektor', links: [('Kolektor', '/collector/login')]),
  titleOf: (u) => str(u, 'name') ?? str(u, 'username') ?? '-',
  subtitleOf: (u) => '@${u['username']}${mapOf(u, 'area') != null ? ' · ${mapOf(u, 'area')!['name']}' : ''}',
  metaOf: (u) => str(u, 'phone'),
  statusOf: _activePill,
  fields: (u) => [
    FieldSpec('username', 'Username', required: true, readOnly: u != null),
    const FieldSpec('name', 'Nama', required: true),
    const FieldSpec('phone', 'Telepon', type: FieldType.phone),
    const FieldSpec('email', 'Email', type: FieldType.email),
    FieldSpec('areaId', 'Area tagih', type: FieldType.select, required: true, loadOptions: Lookups.areas),
    FieldSpec('password', u == null ? 'Password' : 'Password baru', type: FieldType.password, required: u == null, omitWhenEmpty: true),
    if (u != null) const FieldSpec('isActive', 'Aktif', type: FieldType.toggle, initial: true),
  ],
  initialOf: (u) => {...u, 'areaId': mapOf(u, 'area')?['id'] ?? u['areaId'], 'password': null},
  create: (v) => _api.post('/api/admin/users', data: {...v, 'role': 'COLLECTOR'}),
  update: (u, v) => _api.put('/api/admin/users/${u['id']}', data: {...v, 'username': u['username'], 'role': 'COLLECTOR'}),
  delete: CrudRoutes.deleteById('/api/admin/users'),
);

/// Teknisi lapangan — mirrors /admin/technicians.
CrudConfig techniciansConfig() => CrudConfig(
  title: 'Teknisi Lapangan',
  noun: 'Teknisi',
  icon: Icons.engineering_rounded,
  tone: Tone.accent,
  fetch: (_) => _api.get('/api/admin/technicians'),
  listKey: 'technicians',
  header: (context, _) => const LoginLinks(title: 'Alamat login teknisi', links: [('Teknisi', '/technician/login')]),
  titleOf: (t) => str(t, 'name') ?? '-',
  subtitleOf: (t) => str(t, 'phoneNumber'),
  metaOf: (t) => [
    str(t, 'email'),
    t['requireOtp'] == true ? 'Login OTP' : null,
    if (t['lastLoginAt'] != null) 'Login ${formatDateTimeOrNull(dateOf(t, 'lastLoginAt'))}',
  ].whereType<String>().join(' · '),
  statusOf: _activePill,
  fields: (t) => [
    const FieldSpec('name', 'Nama', required: true),
    FieldSpec(
      'phoneNumber',
      'No. HP (untuk login)',
      type: FieldType.phone,
      required: t == null,
      readOnly: t != null,
      helper: t != null ? 'Nomor login tidak bisa diubah.' : null,
    ),
    const FieldSpec('email', 'Email', type: FieldType.email),
    const FieldSpec('requireOtp', 'Wajib OTP WhatsApp saat login', type: FieldType.toggle, initial: true),
  ],
  create: CrudRoutes.postTo('/api/admin/technicians'),
  update: (t, v) => _api.patch('/api/admin/technicians/${t['id']}', data: {'name': v['name'], 'email': v['email'], 'requireOtp': v['requireOtp']}),
  delete: CrudRoutes.deleteById('/api/admin/technicians'),
  itemActions: [
    CrudAction(
      'Aktifkan',
      Icons.play_circle_outline_rounded,
      (ctx, t) async {
        await _api.patch('/api/admin/technicians/${t['id']}', data: {'isActive': true});
        return true;
      },
      visible: (t) => t['isActive'] == false,
      kind: ActionKind.success,
    ),
    CrudAction(
      'Nonaktifkan',
      Icons.pause_circle_outline_rounded,
      (ctx, t) async {
        await _api.patch('/api/admin/technicians/${t['id']}', data: {'isActive': false});
        return true;
      },
      visible: (t) => t['isActive'] != false,
      kind: ActionKind.warning,
    ),
  ],
);

/// Login addresses to hand to new staff, technicians or collectors, built
/// from the server this app is connected to (every install has its own
/// domain).
class LoginLinks extends StatelessWidget {
  const LoginLinks({super.key, required this.title, required this.links});
  final String title;
  final List<(String, String)> links;

  @override
  Widget build(BuildContext context) {
    final base = ApiClient.instance.baseUrl.replaceFirst(RegExp(r'/+$'), '');
    if (base.isEmpty) return const SizedBox.shrink();
    final colors = context.colors;
    return Card(
      margin: const EdgeInsets.only(bottom: Gap.sm),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 4, 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.labelLarge),
            for (final (label, path) in links)
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 6),
                        Text(label, style: TextStyle(fontSize: 11.5, color: colors.onSurfaceVariant)),
                        SelectableText('$base$path', style: const TextStyle(fontSize: 12.5, fontFamily: 'monospace')),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Salin alamat login $label',
                    icon: const Icon(Icons.copy_rounded, size: 18),
                    onPressed: () {
                      Clipboard.setData(ClipboardData(text: '$base$path'));
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Alamat login $label disalin')));
                    },
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}
