import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

/// Proof photos collectors upload after collecting in the field — distinct
/// from Pembayaran Manual (customer self-submitted transfers). The API only
/// allows SUPER_ADMIN / FINANCE.
class PaymentProofListScreen extends StatefulWidget {
  const PaymentProofListScreen({super.key});

  @override
  State<PaymentProofListScreen> createState() => _PaymentProofListScreenState();
}

class _PaymentProofListScreenState extends State<PaymentProofListScreen> {
  List<Map<String, dynamic>> _proofs = [];
  bool _loading = true;
  String? _error;
  String _filter = 'pending';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _proofs.isEmpty;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/admin/payment-proofs', query: {'filter': _filter});
      if (res is Map<String, dynamic>) {
        _proofs = ((res['proofs'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
      }
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _decide(BuildContext ctx, Map<String, dynamic> p, bool approve, {bool fromSheet = false}) async {
    String? reason;
    if (approve) {
      final ok = await confirmAction(
        ctx,
        title: 'Setujui Bukti',
        message: 'Bukti ${formatCurrency(numOf(p, 'amount'))} dari ${str(p, 'collector_name') ?? 'kolektor'} untuk ${str(p, 'fullname')} diterima.',
        confirmLabel: 'Setujui',
      );
      if (!ok) return;
    } else {
      reason = await askReason(ctx, title: 'Tolak Bukti', label: 'Alasan penolakan');
      if (reason == null) return;
    }
    if (!ctx.mounted) return;
    // PUT, not PATCH: admin/payment-proofs/[id]/verify only exports PUT —
    // the earlier PATCH call failed with 405 on every approve/reject.
    final done = await runAction(
      ctx,
      () => ApiClient.instance.put(
        '/api/admin/payment-proofs/${p['id']}/verify',
        data: {'action': approve ? 'approve' : 'reject', if (reason != null) 'rejectReason': reason},
      ),
      success: approve ? 'Bukti disetujui.' : 'Bukti ditolak.',
    );
    if (done) {
      if (fromSheet && ctx.mounted) Navigator.pop(ctx);
      _load();
    }
  }

  void _open(Map<String, dynamic> p) {
    final status = str(p, 'status') ?? 'pending';
    showDetailSheet(
      context,
      header: DetailHeader(
        icon: Icons.image_search_rounded,
        tone: statusTone(status),
        title: str(p, 'fullname') ?? '-',
        subtitle: str(p, 'username'),
        status: StatusPill.status(status),
        figureLabel: 'Jumlah',
        figure: formatCurrency(numOf(p, 'amount')),
      ),
      sections: [
        DetailSection(
          title: 'Tagihan',
          rows: [InfoRow('Invoice', str(p, 'invoice_number'), copyable: true), InfoRow('Telepon', str(p, 'phone'), copyable: true)],
        ),
        DetailSection(
          title: 'Kolektor',
          rows: [
            InfoRow('Nama', str(p, 'collector_name')),
            InfoRow('Username', str(p, 'collector_username')),
            InfoRow('Dikirim', formatDateTimeOrNull(dateOf(p, 'submitted_at'))),
            InfoRow('Diverifikasi', formatDateTimeOrNull(dateOf(p, 'reviewed_at'))),
            InfoRow('Alasan Ditolak', str(p, 'reject_reason'), valueColor: context.tone(Tone.danger)),
          ],
        ),
        ProofImage(source: str(p, 'proof_image'), baseUrl: ApiClient.instance.baseUrl),
      ],
      actions: status != 'pending'
          ? null
          : (sheet) => [
              ActionSpec('Setujui', Icons.check_rounded, () => _decide(sheet, p, true, fromSheet: true), kind: ActionKind.success),
              ActionSpec('Tolak', Icons.close_rounded, () => _decide(sheet, p, false, fromSheet: true), kind: ActionKind.danger),
            ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Bukti Pembayaran Kolektor')),
      body: Column(
        children: [
          FilterChipRow(
            options: const [('pending', 'Menunggu'), ('approved', 'Disetujui'), ('rejected', 'Ditolak')],
            selected: _filter,
            onSelected: (v) {
              setState(() {
                _filter = v;
                _proofs = [];
              });
              _load();
            },
          ),
          Expanded(
            child: DataStateView(
              loading: _loading,
              error: _error,
              onRetry: _load,
              isEmpty: _proofs.isEmpty,
              emptyIcon: Icons.image_search_outlined,
              emptyMessage: _filter == 'pending' ? 'Tidak ada bukti yang menunggu' : 'Tidak ada bukti di status ini',
              emptyHint: _filter == 'pending' ? 'Foto bukti bayar yang diunggah kolektor dari lapangan akan muncul di sini.' : null,
              child: RefreshableList(
                onRefresh: _load,
                itemCount: _proofs.length,
                itemBuilder: (context, i) {
                  final p = _proofs[i];
                  final status = str(p, 'status') ?? 'pending';
                  return EntityTile(
                    icon: Icons.image_search_rounded,
                    tone: statusTone(status),
                    title: str(p, 'fullname') ?? '-',
                    subtitle: '${str(p, 'invoice_number') ?? '-'} · ${str(p, 'collector_name') ?? '-'}',
                    meta: formatDateTimeOrNull(dateOf(p, 'submitted_at')),
                    trailing: AmountTrailing(amount: formatCurrency(numOf(p, 'amount')), pill: StatusPill.status(status)),
                    onTap: () => _open(p),
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
