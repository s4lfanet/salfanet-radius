import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

/// Customer prepaid-balance top-ups paid by manual transfer. Approving
/// credits the customer's balance, so the transfer proof is shown first.
/// The API returns every status; filtering happens here.
class TopupRequestListScreen extends StatefulWidget {
  const TopupRequestListScreen({super.key});

  @override
  State<TopupRequestListScreen> createState() => _TopupRequestListScreenState();
}

class _TopupRequestListScreenState extends State<TopupRequestListScreen> {
  List<Map<String, dynamic>> _all = [];
  bool _loading = true;
  String? _error;
  String _status = 'PENDING';

  List<Map<String, dynamic>> get _visible => _status == 'all' ? _all : _all.where((r) => r['status'] == _status).toList();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _all.isEmpty;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/admin/topup-requests');
      if (res is Map<String, dynamic>) {
        _all = ((res['requests'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
      }
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _decide(BuildContext ctx, Map<String, dynamic> r, bool approve, {bool fromSheet = false}) async {
    final who = str(mapOf(r, 'user'), 'username') ?? '-';
    final amount = formatCurrency(numOf(r, 'amount'));
    final ok = await confirmAction(
      ctx,
      title: approve ? 'Setujui Top Up' : 'Tolak Top Up',
      message: approve ? 'Saldo $who bertambah $amount. Pastikan transfer sudah masuk.' : 'Top up $amount untuk $who ditolak.',
      confirmLabel: approve ? 'Setujui' : 'Tolak',
      destructive: !approve,
    );
    if (!ok || !ctx.mounted) return;
    final done = await runAction(
      ctx,
      () => ApiClient.instance.post('/api/admin/topup-requests/${r['id']}/${approve ? 'approve' : 'reject'}'),
      success: approve ? 'Top up disetujui.' : 'Top up ditolak.',
    );
    if (done) {
      if (fromSheet && ctx.mounted) Navigator.pop(ctx);
      _load();
    }
  }

  void _open(Map<String, dynamic> r) {
    final meta = mapOf(r, 'metadata');
    final user = mapOf(r, 'user');
    final status = str(r, 'status') ?? 'PENDING';
    showDetailSheet(
      context,
      header: DetailHeader(
        icon: Icons.savings_rounded,
        tone: statusTone(status),
        title: str(meta, 'requestedBy') ?? str(user, 'username') ?? '-',
        subtitle: str(user, 'username'),
        status: StatusPill.status(status),
        figureLabel: 'Jumlah top up',
        figure: formatCurrency(numOf(r, 'amount')),
      ),
      sections: [
        DetailSection(title: 'Permintaan', rows: [
          InfoRow('Metode', str(r, 'paymentMethod')),
          InfoRow('Referensi', str(r, 'reference'), copyable: true),
          InfoRow('Catatan', str(meta, 'note')),
          InfoRow('Diajukan', formatDateTimeOrNull(dateOf(meta, 'requestedAt') ?? dateOf(r, 'createdAt'))),
          InfoRow('Disetujui', formatDateTimeOrNull(dateOf(meta, 'approvedAt'))),
          InfoRow('Ditolak', formatDateTimeOrNull(dateOf(meta, 'rejectedAt'))),
        ]),
        ProofImage(source: str(meta, 'proofPath'), baseUrl: ApiClient.instance.baseUrl),
      ],
      actions: status != 'PENDING'
          ? null
          : (sheet) => [
                ActionSpec('Setujui', Icons.check_rounded, () => _decide(sheet, r, true, fromSheet: true), kind: ActionKind.success),
                ActionSpec('Tolak', Icons.close_rounded, () => _decide(sheet, r, false, fromSheet: true), kind: ActionKind.danger),
              ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final items = _visible;
    return Scaffold(
      appBar: AppBar(title: const Text('Top Up Saldo')),
      body: Column(
        children: [
          FilterChipRow(
            options: const [('PENDING', 'Menunggu'), ('SUCCESS', 'Disetujui'), ('FAILED', 'Ditolak'), ('all', 'Semua')],
            selected: _status,
            onSelected: (v) => setState(() => _status = v),
          ),
          Expanded(
            child: DataStateView(
              loading: _loading,
              error: _error,
              onRetry: _load,
              isEmpty: items.isEmpty,
              emptyIcon: Icons.savings_outlined,
              emptyMessage: _status == 'PENDING' ? 'Tidak ada top up yang menunggu' : 'Tidak ada top up di status ini',
              emptyHint: _status == 'PENDING' ? 'Top up saldo prabayar dari pelanggan akan muncul di sini.' : null,
              child: RefreshableList(
                onRefresh: _load,
                itemCount: items.length,
                itemBuilder: (context, i) {
                  final r = items[i];
                  final status = str(r, 'status') ?? 'PENDING';
                  final meta = mapOf(r, 'metadata');
                  return EntityTile(
                    icon: Icons.savings_rounded,
                    tone: statusTone(status),
                    title: str(meta, 'requestedBy') ?? str(mapOf(r, 'user'), 'username') ?? '-',
                    subtitle: '${str(mapOf(r, 'user'), 'username') ?? '-'} · ${str(r, 'paymentMethod') ?? '-'}',
                    meta: [formatDateTimeOrNull(dateOf(r, 'createdAt')), if (str(meta, 'proofPath') != null) 'ada bukti'].whereType<String>().join(' · '),
                    trailing: AmountTrailing(amount: formatCurrency(numOf(r, 'amount')), pill: StatusPill.status(status)),
                    onTap: () => _open(r),
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
