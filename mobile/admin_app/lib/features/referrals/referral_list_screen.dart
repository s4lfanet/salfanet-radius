import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import '../pppoe/pppoe_detail_screen.dart';

class ReferralListScreen extends StatefulWidget {
  const ReferralListScreen({super.key});

  @override
  State<ReferralListScreen> createState() => _ReferralListScreenState();
}

class _ReferralListScreenState extends State<ReferralListScreen> {
  List<Map<String, dynamic>> _rewards = [];
  Map<String, dynamic>? _stats;
  bool _loading = true;
  String? _error;
  String _status = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _rewards.isEmpty;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/admin/referrals', query: {'limit': 100, if (_status.isNotEmpty) 'status': _status});
      if (res is Map<String, dynamic>) {
        _rewards = ((res['rewards'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
        _stats = mapOf(res, 'stats');
      }
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _openCustomer(String? id) {
    if (id == null) return;
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => PppoeDetailScreen(userId: id)));
  }

  void _open(Map<String, dynamic> r) {
    final referrer = mapOf(r, 'referrer');
    final referred = mapOf(r, 'referred');
    final status = str(r, 'status') ?? 'PENDING';
    showDetailSheet(
      context,
      header: DetailHeader(
        icon: Icons.card_giftcard_rounded,
        tone: statusTone(status),
        title: '${str(referrer, 'name') ?? '-'} → ${str(referred, 'name') ?? '-'}',
        subtitle: str(r, 'type') == 'FIRST_PAYMENT' ? 'Bonus saat pembayaran pertama' : 'Bonus saat registrasi',
        status: StatusPill.status(status),
        figureLabel: 'Bonus',
        figure: formatCurrency(numOf(r, 'amount')),
      ),
      sections: [
        DetailSection(
          title: 'Pengajak',
          rows: [
            InfoRow('Nama', str(referrer, 'name'), onTap: () => _openCustomer(str(referrer, 'id'))),
            InfoRow('Username', str(referrer, 'username')),
            InfoRow('Kode Referral', str(referrer, 'referralCode'), copyable: true),
            InfoRow('Telepon', str(referrer, 'phone'), copyable: true),
          ],
        ),
        DetailSection(
          title: 'Pelanggan Baru',
          rows: [
            InfoRow('Nama', str(referred, 'name'), onTap: () => _openCustomer(str(referred, 'id'))),
            InfoRow('Username', str(referred, 'username')),
            InfoRow('Bergabung', formatDateOrNull(dateOf(referred, 'createdAt'))),
          ],
        ),
        DetailSection(
          title: 'Bonus',
          rows: [InfoRow('Dibuat', formatDateTimeOrNull(dateOf(r, 'createdAt'))), InfoRow('Dicairkan', formatDateTimeOrNull(dateOf(r, 'creditedAt')))],
        ),
      ],
      actions: status != 'PENDING'
          ? null
          : (sheet) => [
              ActionSpec('Cairkan ke Saldo', Icons.savings_rounded, () => _act(sheet, r, 'credit'), kind: ActionKind.success),
              ActionSpec('Batalkan', Icons.block_rounded, () => _act(sheet, r, 'expire'), kind: ActionKind.danger),
            ],
    );
  }

  Future<void> _act(BuildContext sheet, Map<String, dynamic> r, String action) async {
    final credit = action == 'credit';
    final ok = await confirmAction(
      sheet,
      title: credit ? 'Cairkan Bonus?' : 'Batalkan Bonus?',
      message: credit
          ? '${formatCurrency(numOf(r, 'amount'))} ditambahkan ke saldo ${str(mapOf(r, 'referrer'), 'name') ?? 'pengajak'} dan dicatat di Keuangan.'
          : 'Bonus ini ditandai kedaluwarsa dan tidak bisa dicairkan.',
      confirmLabel: credit ? 'Cairkan' : 'Batalkan bonus',
      destructive: !credit,
    );
    if (!ok || !sheet.mounted) return;
    final done = await runAction(
      sheet,
      () => ApiClient.instance.post('/api/admin/referrals/${r['id']}', data: {'action': action}),
      success: credit ? 'Bonus dicairkan.' : 'Bonus dibatalkan.',
    );
    if (done) {
      if (sheet.mounted) Navigator.pop(sheet);
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = _stats;
    return Scaffold(
      appBar: AppBar(title: const Text('Referral')),
      body: Column(
        children: [
          if (s != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, 0),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: Gap.lg, vertical: Gap.md),
                  child: Row(
                    children: [
                      Expanded(
                        child: LabeledFigure(
                          label: 'Bonus dicairkan',
                          value: formatCurrency(numOf(s, 'totalCredited')),
                          color: context.tone(Tone.success),
                          valueSize: 16,
                        ),
                      ),
                      Container(width: 1, height: 36, color: context.colors.outline),
                      const SizedBox(width: Gap.lg),
                      Expanded(
                        child: LabeledFigure(label: 'Pelanggan dari referral', value: '${numOf(s, 'referredUsers')}', valueSize: 16),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          FilterChipRow(
            options: const [('', 'Semua'), ('PENDING', 'Menunggu'), ('CREDITED', 'Dicairkan'), ('EXPIRED', 'Kedaluwarsa')],
            selected: _status,
            onSelected: (v) {
              setState(() {
                _status = v;
                _rewards = [];
              });
              _load();
            },
          ),
          Expanded(
            child: DataStateView(
              loading: _loading,
              error: _error,
              onRetry: _load,
              isEmpty: _rewards.isEmpty,
              emptyIcon: Icons.card_giftcard_outlined,
              emptyMessage: 'Belum ada bonus referral',
              emptyHint: 'Bonus muncul saat pelanggan baru mendaftar dengan kode referral pelanggan lama.',
              child: RefreshableList(
                onRefresh: _load,
                itemCount: _rewards.length,
                itemBuilder: (context, i) {
                  final r = _rewards[i];
                  final status = str(r, 'status') ?? 'PENDING';
                  return EntityTile(
                    icon: Icons.card_giftcard_rounded,
                    tone: statusTone(status),
                    title: str(mapOf(r, 'referrer'), 'name') ?? '-',
                    subtitle: 'Mengajak ${str(mapOf(r, 'referred'), 'name') ?? '-'}',
                    meta: formatDateOrNull(dateOf(r, 'createdAt')),
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
