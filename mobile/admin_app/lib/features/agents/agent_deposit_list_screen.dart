import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

/// Manual agent balance top-ups awaiting verification. Approving credits
/// the agent's balance, so the transfer receipt is shown before the button.
class AgentDepositListScreen extends StatefulWidget {
  const AgentDepositListScreen({super.key});

  @override
  State<AgentDepositListScreen> createState() => _AgentDepositListScreenState();
}

class _AgentDepositListScreenState extends State<AgentDepositListScreen> {
  List<Map<String, dynamic>> _deposits = [];
  bool _loading = true;
  String? _error;
  // Reject writes CANCELLED (admin/agent-deposits PATCH), not FAILED —
  // filtering on FAILED left the "Ditolak" tab permanently empty.
  String _status = 'PENDING';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _deposits.isEmpty;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/admin/agent-deposits', query: {'status': _status});
      if (res is Map<String, dynamic>) {
        _deposits = ((res['deposits'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
      }
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _decide(BuildContext ctx, Map<String, dynamic> d, bool approve, {bool fromSheet = false}) async {
    final agent = str(mapOf(d, 'agent'), 'name') ?? 'agent';
    final amount = formatCurrency(numOf(d, 'amount'));
    final ok = await confirmAction(
      ctx,
      title: approve ? 'Setujui Deposit' : 'Tolak Deposit',
      message: approve ? 'Saldo $agent bertambah $amount. Pastikan transfer sudah masuk.' : 'Permintaan deposit $amount dari $agent ditolak.',
      confirmLabel: approve ? 'Setujui' : 'Tolak',
      destructive: !approve,
    );
    if (!ok || !ctx.mounted) return;
    final done = await runAction(
      ctx,
      () => ApiClient.instance.patch('/api/admin/agent-deposits', data: {'depositId': d['id'], 'action': approve ? 'approve' : 'reject'}),
      success: approve ? 'Deposit disetujui.' : 'Deposit ditolak.',
    );
    if (done) {
      if (fromSheet && ctx.mounted) Navigator.pop(ctx);
      _load();
    }
  }

  void _open(Map<String, dynamic> d) {
    final agent = mapOf(d, 'agent');
    final status = str(d, 'status') ?? 'PENDING';
    showDetailSheet(
      context,
      header: DetailHeader(
        icon: Icons.account_balance_wallet_rounded,
        tone: statusTone(status),
        title: str(agent, 'name') ?? '-',
        subtitle: str(agent, 'phone'),
        status: StatusPill.status(status),
        figureLabel: 'Jumlah deposit',
        figure: formatCurrency(numOf(d, 'amount')),
      ),
      sections: [
        DetailSection(title: 'Pengirim', rows: [
          InfoRow('Atas Nama', str(d, 'senderAccountName')),
          InfoRow('No. Rekening', str(d, 'senderAccountNumber'), copyable: true),
        ]),
        DetailSection(title: 'Rekening Tujuan', rows: [
          InfoRow('Bank', str(d, 'targetBankName')),
          InfoRow('No. Rekening', str(d, 'targetBankAccountNumber')),
          InfoRow('Atas Nama', str(d, 'targetBankAccountName')),
        ]),
        DetailSection(title: 'Waktu', rows: [
          InfoRow('Diajukan', formatDateTimeOrNull(dateOf(d, 'createdAt'))),
          InfoRow('Disetujui', formatDateTimeOrNull(dateOf(d, 'paidAt'))),
          InfoRow('Catatan', str(d, 'note')),
        ]),
        ProofImage(source: str(d, 'receiptImage'), baseUrl: ApiClient.instance.baseUrl),
      ],
      actions: status != 'PENDING'
          ? null
          : (sheet) => [
                ActionSpec('Setujui', Icons.check_rounded, () => _decide(sheet, d, true, fromSheet: true), kind: ActionKind.success),
                ActionSpec('Tolak', Icons.close_rounded, () => _decide(sheet, d, false, fromSheet: true), kind: ActionKind.danger),
              ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Deposit Agent')),
      body: Column(
        children: [
          FilterChipRow(
            options: const [('PENDING', 'Menunggu'), ('PAID', 'Disetujui'), ('CANCELLED', 'Ditolak'), ('ALL', 'Semua')],
            selected: _status,
            onSelected: (v) {
              setState(() {
                _status = v;
                _deposits = [];
              });
              _load();
            },
          ),
          Expanded(
            child: DataStateView(
              loading: _loading,
              error: _error,
              onRetry: _load,
              isEmpty: _deposits.isEmpty,
              emptyIcon: Icons.account_balance_wallet_outlined,
              emptyMessage: _status == 'PENDING' ? 'Tidak ada deposit yang menunggu' : 'Tidak ada deposit di status ini',
              emptyHint: _status == 'PENDING' ? 'Top up saldo manual yang diajukan agent akan muncul di sini.' : null,
              child: RefreshableList(
                onRefresh: _load,
                itemCount: _deposits.length,
                itemBuilder: (context, i) {
                  final d = _deposits[i];
                  final status = str(d, 'status') ?? 'PENDING';
                  return EntityTile(
                    icon: Icons.account_balance_wallet_rounded,
                    tone: statusTone(status),
                    title: str(mapOf(d, 'agent'), 'name') ?? '-',
                    subtitle: [str(d, 'targetBankName'), if (str(d, 'senderAccountName') != null) 'a.n. ${str(d, 'senderAccountName')}'].whereType<String>().join(' · '),
                    meta: formatDateTimeOrNull(dateOf(d, 'createdAt')),
                    trailing: AmountTrailing(amount: formatCurrency(numOf(d, 'amount')), pill: StatusPill.status(status)),
                    onTap: () => _open(d),
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
