import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import 'approval_provider.dart';

/// Self-registered PPPoE accounts (approvalStatus = pending) that need a
/// staff check before they can connect.
class ApprovalListScreen extends StatelessWidget {
  const ApprovalListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(create: (_) => ApprovalProvider()..load(), child: const _View());
  }
}

class _View extends StatelessWidget {
  const _View();

  Future<void> _approve(BuildContext context, ApprovalProvider provider, Map<String, dynamic> u, {bool fromSheet = false}) async {
    final ok = await confirmAction(
      context,
      title: 'Setujui Pendaftaran',
      message: '${str(u, 'name')} (${str(u, 'username')}) diaktifkan dan disinkronkan ke RADIUS/MikroTik.',
      confirmLabel: 'Setujui',
    );
    if (!ok || !context.mounted) return;
    final done = await runAction(context, () => provider.approve(u['id'].toString()), success: 'Pendaftaran disetujui.');
    if (done && fromSheet && context.mounted) Navigator.pop(context);
  }

  Future<void> _reject(BuildContext context, ApprovalProvider provider, Map<String, dynamic> u, {bool fromSheet = false}) async {
    final reason = await askReason(context, title: 'Tolak Pendaftaran', label: 'Alasan penolakan');
    if (reason == null || !context.mounted) return;
    final done = await runAction(context, () => provider.reject(u['id'].toString(), reason), success: 'Pendaftaran ditolak.');
    if (done && fromSheet && context.mounted) Navigator.pop(context);
  }

  void _open(BuildContext context, Map<String, dynamic> u) {
    // The sheet is a separate route and can't see this page's provider.
    final provider = context.read<ApprovalProvider>();
    final profile = mapOf(u, 'profile');
    final lat = u['latitude'];
    final lng = u['longitude'];
    showDetailSheet(
      context,
      header: DetailHeader(
        icon: Icons.how_to_reg_rounded,
        tone: Tone.warning,
        title: str(u, 'name') ?? '-',
        subtitle: str(u, 'username'),
        status: const StatusPill(label: 'Menunggu', tone: Tone.warning),
      ),
      sections: [
        DetailSection(
          title: 'Pelanggan',
          rows: [
            InfoRow('Telepon', str(u, 'phone'), copyable: true),
            InfoRow('Email', str(u, 'email')),
            InfoRow('NIK', str(u, 'idCardNumber'), copyable: true),
            InfoRow('Alamat', str(u, 'address')),
            InfoRow('Koordinat', lat != null && lng != null ? '$lat, $lng' : null, copyable: true),
            InfoRow('Didaftarkan', formatDateTimeOrNull(dateOf(u, 'createdAt'))),
            InfoRow('Oleh Teknisi', str(mapOf(u, 'registeredByTechnician'), 'name')),
          ],
        ),
        DetailSection(
          title: 'Layanan',
          rows: [
            InfoRow('Paket', profile == null ? null : '${str(profile, 'name')} · ${formatCurrency(numOf(profile, 'price'))}'),
            InfoRow('Area', str(mapOf(u, 'area'), 'name')),
            InfoRow('Router', str(mapOf(u, 'router'), 'name')),
            InfoRow('ODP', str(u, 'odp')),
          ],
        ),
        ProofImage(source: str(u, 'idCardPhoto'), baseUrl: ApiClient.instance.baseUrl, title: 'Foto KTP'),
      ],
      actions: (sheet) => [
        ActionSpec('Setujui', Icons.check_rounded, () => _approve(sheet, provider, u, fromSheet: true), kind: ActionKind.success),
        ActionSpec('Tolak', Icons.close_rounded, () => _reject(sheet, provider, u, fromSheet: true), kind: ActionKind.danger),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<ApprovalProvider>();
    return Scaffold(
      appBar: AppBar(title: const Text('Persetujuan Pendaftaran')),
      body: DataStateView(
        loading: p.loading,
        error: p.error,
        onRetry: p.load,
        isEmpty: p.users.isEmpty,
        emptyIcon: Icons.how_to_reg_outlined,
        emptyMessage: 'Tidak ada pendaftaran yang menunggu',
        emptyHint: 'Akun yang didaftarkan teknisi atau lewat referral dan butuh pengecekan akan muncul di sini.',
        child: RefreshableList(
          onRefresh: p.load,
          itemCount: p.users.length,
          itemBuilder: (context, i) {
            final u = p.users[i];
            return EntityTile(
              icon: Icons.how_to_reg_rounded,
              tone: Tone.warning,
              title: str(u, 'name') ?? '-',
              subtitle: '${str(mapOf(u, 'profile'), 'name') ?? '-'} · ${str(mapOf(u, 'area'), 'name') ?? 'Tanpa area'}',
              meta: [str(u, 'username'), str(mapOf(u, 'registeredByTechnician'), 'name')].whereType<String>().join(' · '),
              onTap: () => _open(context, u),
              footer: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _reject(context, p, u),
                      style: OutlinedButton.styleFrom(foregroundColor: context.tone(Tone.danger), minimumSize: const Size(0, 40)),
                      child: const Text('Tolak'),
                    ),
                  ),
                  const SizedBox(width: Gap.sm),
                  Expanded(
                    child: FilledButton(
                      onPressed: () => _approve(context, p, u),
                      style: FilledButton.styleFrom(
                        backgroundColor: context.tone(Tone.success),
                        foregroundColor: onColor(context.tone(Tone.success)),
                        minimumSize: const Size(0, 40),
                      ),
                      child: const Text('Setujui'),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}
