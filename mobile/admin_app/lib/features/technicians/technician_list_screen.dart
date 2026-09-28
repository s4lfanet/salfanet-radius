import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

/// Field technicians (the `technician` model — they log into their own
/// portal with OTP and have no admin-panel account). Adding technicians
/// stays on the web.
class TechnicianListScreen extends StatefulWidget {
  const TechnicianListScreen({super.key});

  @override
  State<TechnicianListScreen> createState() => _TechnicianListScreenState();
}

class _TechnicianListScreenState extends State<TechnicianListScreen> {
  List<Map<String, dynamic>> _technicians = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _technicians.isEmpty;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/admin/technicians');
      if (res is Map<String, dynamic>) {
        _technicians = ((res['technicians'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
      }
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _wa(String phone) {
    var n = phone.replaceAll(RegExp(r'[^0-9]'), '');
    if (n.startsWith('0')) n = '62${n.substring(1)}';
    return n;
  }

  void _open(Map<String, dynamic> t) {
    final active = t['isActive'] == true;
    final phone = str(t, 'phoneNumber') ?? '';
    showDetailSheet(
      context,
      header: DetailHeader(
        icon: Icons.engineering_rounded,
        tone: active ? Tone.primary : Tone.neutral,
        title: str(t, 'name') ?? '-',
        subtitle: phone,
        status: StatusPill(label: active ? 'Aktif' : 'Nonaktif', tone: active ? Tone.success : Tone.danger),
      ),
      sections: [
        DetailSection(rows: [
          InfoRow('Telepon', phone, copyable: true),
          InfoRow('Email', str(t, 'email'), copyable: true),
          InfoRow('Login OTP', t['requireOtp'] == true ? 'Wajib' : 'Tidak'),
          InfoRow('Login terakhir', formatDateTimeOrNull(dateOf(t, 'lastLoginAt')) ?? 'Belum pernah'),
          InfoRow('Terdaftar', formatDateOrNull(dateOf(t, 'createdAt'))),
        ]),
      ],
      actions: phone.isEmpty
          ? null
          : (_) => [
                ActionSpec('WhatsApp', Icons.chat_rounded, () => launchUrl(Uri.parse('https://wa.me/${_wa(phone)}'), mode: LaunchMode.externalApplication)),
                ActionSpec('Telepon', Icons.call_rounded, () => launchUrl(Uri(scheme: 'tel', path: phone)), kind: ActionKind.neutral),
              ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Teknisi Lapangan')),
      body: DataStateView(
        loading: _loading,
        error: _error,
        onRetry: _load,
        isEmpty: _technicians.isEmpty,
        emptyIcon: Icons.engineering_outlined,
        emptyMessage: 'Belum ada teknisi',
        emptyHint: 'Teknisi ditambahkan dari panel web (Teknisi).',
        child: RefreshableList(
          onRefresh: _load,
          itemCount: _technicians.length,
          itemBuilder: (context, i) {
            final t = _technicians[i];
            final active = t['isActive'] == true;
            final last = dateOf(t, 'lastLoginAt');
            return EntityTile(
              icon: Icons.engineering_rounded,
              tone: active ? Tone.primary : Tone.neutral,
              title: str(t, 'name') ?? '-',
              subtitle: str(t, 'phoneNumber') ?? '-',
              meta: last != null ? 'Login ${formatRelativeTime(last)}' : 'Belum pernah login',
              trailing: active ? null : const StatusPill(label: 'Nonaktif', tone: Tone.danger),
              onTap: () => _open(t),
            );
          },
        ),
      ),
    );
  }
}
