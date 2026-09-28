import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import '../pppoe/pppoe_detail_screen.dart';
import 'suspend_request_provider.dart';

/// Customer-initiated temporary suspensions (e.g. holiday hold). Approving
/// sets the account to "stopped" from the start date; the existing cron
/// restores it at the end date.
class SuspendRequestListScreen extends StatelessWidget {
  const SuspendRequestListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(create: (_) => SuspendRequestProvider()..load(), child: const _View());
  }
}

class _View extends StatelessWidget {
  const _View();

  Future<void> _decide(BuildContext context, SuspendRequestProvider provider, Map<String, dynamic> r, String action, {bool fromSheet = false}) async {
    final approve = action == 'APPROVE';
    final notes = await askReason(
      context,
      title: approve ? 'Setujui Suspend' : 'Tolak Suspend',
      label: 'Catatan admin',
      confirmLabel: approve ? 'Setujui' : 'Tolak',
      required: !approve,
      destructive: !approve,
    );
    if (notes == null || !context.mounted) return;
    final done = await runAction(context, () => provider.decide(r['id'].toString(), action, adminNotes: notes), success: approve ? 'Permintaan disetujui.' : 'Permintaan ditolak.');
    if (done && fromSheet && context.mounted) Navigator.pop(context);
  }

  String _period(Map<String, dynamic> r) {
    final s = dateOf(r, 'startDate');
    final e = dateOf(r, 'endDate');
    if (s == null || e == null) return '-';
    return '${formatDate(s)} – ${formatDate(e)} (${e.difference(s).inDays + 1} hari)';
  }

  void _open(BuildContext context, Map<String, dynamic> r) {
    final provider = context.read<SuspendRequestProvider>();
    final user = mapOf(r, 'user');
    final status = str(r, 'status') ?? 'PENDING';
    showDetailSheet(
      context,
      header: DetailHeader(
        icon: Icons.pause_circle_outline_rounded,
        tone: statusTone(status),
        title: str(user, 'name') ?? '-',
        subtitle: [str(user, 'customerId'), str(user, 'username')].whereType<String>().join(' · '),
        status: StatusPill.status(status),
      ),
      sections: [
        DetailSection(title: 'Permintaan', rows: [
          InfoRow('Periode', _period(r)),
          InfoRow('Alasan', str(r, 'reason')),
          InfoRow('Diajukan', formatDateTimeOrNull(dateOf(r, 'requestedAt'))),
        ]),
        DetailSection(title: 'Keputusan', rows: [
          InfoRow('Oleh', str(r, 'approvedBy')),
          InfoRow('Pada', formatDateTimeOrNull(dateOf(r, 'approvedAt'))),
          InfoRow('Catatan Admin', str(r, 'adminNotes')),
        ]),
        DetailSection(title: 'Pelanggan', rows: [
          InfoRow('Telepon', str(user, 'phone'), copyable: true),
          InfoRow('Status Akun', statusLabel(str(user, 'status') ?? '')),
          InfoRow('Buka Detail Pelanggan', user?['id'] == null ? null : 'Lihat',
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PppoeDetailScreen(userId: user!['id'].toString())))),
        ]),
      ],
      actions: status != 'PENDING'
          ? null
          : (sheet) => [
                ActionSpec('Setujui', Icons.check_rounded, () => _decide(sheet, provider, r, 'APPROVE', fromSheet: true), kind: ActionKind.success),
                ActionSpec('Tolak', Icons.close_rounded, () => _decide(sheet, provider, r, 'REJECT', fromSheet: true), kind: ActionKind.danger),
              ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<SuspendRequestProvider>();
    return Scaffold(
      appBar: AppBar(title: const Text('Permintaan Suspend')),
      body: Column(
        children: [
          FilterChipRow(
            options: const [('PENDING', 'Menunggu'), ('APPROVED', 'Disetujui'), ('REJECTED', 'Ditolak'), ('all', 'Semua')],
            selected: p.status,
            onSelected: p.setStatus,
          ),
          Expanded(
            child: DataStateView(
              loading: p.loading,
              error: p.error,
              onRetry: p.load,
              isEmpty: p.requests.isEmpty,
              emptyIcon: Icons.pause_circle_outline_rounded,
              emptyMessage: 'Tidak ada permintaan di status ini',
              emptyHint: 'Pelanggan mengajukan suspend sementara dari aplikasi pelanggan.',
              child: RefreshableList(
                onRefresh: p.load,
                itemCount: p.requests.length,
                itemBuilder: (context, i) {
                  final r = p.requests[i];
                  final user = mapOf(r, 'user');
                  final status = str(r, 'status') ?? 'PENDING';
                  return EntityTile(
                    icon: Icons.pause_circle_outline_rounded,
                    tone: statusTone(status),
                    title: str(user, 'name') ?? '-',
                    subtitle: _period(r),
                    meta: str(r, 'reason'),
                    trailing: StatusPill.status(status),
                    onTap: () => _open(context, r),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
