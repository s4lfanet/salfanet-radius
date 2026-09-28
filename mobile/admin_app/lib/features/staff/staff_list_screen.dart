import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

const staffRoleLabels = <String, String>{
  'SUPER_ADMIN': 'Super Admin',
  'FINANCE': 'Finance',
  'CUSTOMER_SERVICE': 'Customer Service',
  'TECHNICIAN': 'Teknisi',
  'MARKETING': 'Marketing',
  'COLLECTOR': 'Kolektor',
};

/// Admin-panel accounts. Creating accounts and editing permissions stays on
/// the web (sensitive, infrequent); this shows who's on the team, their
/// role, access and last login.
class StaffListScreen extends StatefulWidget {
  const StaffListScreen({super.key});

  @override
  State<StaffListScreen> createState() => _StaffListScreenState();
}

class _StaffListScreenState extends State<StaffListScreen> {
  List<Map<String, dynamic>> _users = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _users.isEmpty;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/admin/users');
      if (res is Map<String, dynamic>) {
        _users = ((res['users'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
      }
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _open(Map<String, dynamic> u) {
    final active = u['isActive'] == true;
    final role = str(u, 'role') ?? '';
    final perms = (u['permissions'] as List?)?.map((e) => e.toString()).toList() ?? const [];
    final phone = str(u, 'phone');
    // Group "customers.view", "customers.edit" → "customers (view, edit)".
    final grouped = <String, List<String>>{};
    for (final p in perms) {
      final parts = p.split('.');
      grouped.putIfAbsent(parts.first, () => []).add(parts.length > 1 ? parts.sublist(1).join('.') : '');
    }
    showDetailSheet(
      context,
      header: DetailHeader(
        icon: Icons.badge_rounded,
        tone: active ? Tone.primary : Tone.neutral,
        title: str(u, 'name') ?? '-',
        subtitle: '@${str(u, 'username') ?? '-'}',
        status: StatusPill(label: staffRoleLabels[role] ?? role, tone: role == 'SUPER_ADMIN' ? Tone.accent : Tone.primary),
      ),
      sections: [
        DetailSection(title: 'Akun', rows: [
          InfoRow('Status', active ? 'Aktif' : 'Nonaktif', valueColor: context.tone(active ? Tone.success : Tone.danger)),
          InfoRow('Email', str(u, 'email'), copyable: true),
          InfoRow('Telepon', phone, copyable: true),
          InfoRow('Login terakhir', formatDateTimeOrNull(dateOf(u, 'lastLogin')) ?? 'Belum pernah'),
          InfoRow('Dibuat', formatDateOrNull(dateOf(u, 'createdAt'))),
        ]),
        DetailSection(
          title: 'Hak Akses',
          rows: role == 'SUPER_ADMIN'
              ? const [InfoRow('Cakupan', 'Semua menu (Super Admin)')]
              : grouped.isEmpty
                  ? const [InfoRow('Cakupan', 'Belum ada izin')]
                  : grouped.entries.map((e) => InfoRow(e.key, e.value.where((x) => x.isNotEmpty).join(', '))).toList(),
        ),
      ],
      actions: phone == null
          ? null
          : (_) => [
                ActionSpec('Telepon', Icons.call_rounded, () => launchUrl(Uri(scheme: 'tel', path: phone))),
              ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Staf & Tim')),
      body: DataStateView(
        loading: _loading,
        error: _error,
        onRetry: _load,
        isEmpty: _users.isEmpty,
        emptyIcon: Icons.groups_outlined,
        emptyMessage: 'Belum ada akun staf',
        child: RefreshableList(
          onRefresh: _load,
          itemCount: _users.length,
          itemBuilder: (context, i) {
            final u = _users[i];
            final active = u['isActive'] == true;
            final role = str(u, 'role') ?? '';
            final last = dateOf(u, 'lastLogin');
            return EntityTile(
              icon: Icons.badge_rounded,
              tone: active ? Tone.primary : Tone.neutral,
              title: str(u, 'name') ?? '-',
              subtitle: '@${str(u, 'username') ?? '-'}',
              meta: last != null ? 'Login ${formatRelativeTime(last)}' : 'Belum pernah login',
              trailing: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: [
                  StatusPill(label: staffRoleLabels[role] ?? role, tone: role == 'SUPER_ADMIN' ? Tone.accent : Tone.primary),
                  if (!active) ...[const SizedBox(height: 6), const StatusPill(label: 'Nonaktif', tone: Tone.danger)],
                ],
              ),
              onTap: () => _open(u),
            );
          },
        ),
      ),
    );
  }
}
