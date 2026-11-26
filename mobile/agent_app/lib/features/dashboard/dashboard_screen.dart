import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import '../../core/widgets/underline_tabs.dart';
import '../notifications/notifications_screen.dart';

/// Ringkasan agen: saldo, penjualan dan komisi per periode, stok voucher,
/// akses cepat, dan deposit terakhir — sama dengan dashboard portal web agen.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key, this.onOpenTab});

  /// Pindah tab di shell: 1 Voucher, 2 Sesi, 3 Tiket.
  final void Function(int index, {bool generate})? onOpenTab;

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;
  String _period = 'today';
  int _unread = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _data == null;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/agent/dashboard', query: {'limit': 1});
      if (!mounted) return;
      setState(() => _data = res is Map ? Map<String, dynamic>.from(res) : null);
      try {
        final n = await ApiClient.instance.get('/api/agent/notifications');
        if (mounted && n is Map) setState(() => _unread = numOf(Map<String, dynamic>.from(n), 'unreadCount').toInt());
      } on ApiException catch (_) {}
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Widget _hero(BuildContext context, Map<String, dynamic>? agent, Map<String, dynamic>? stats) {
    final balance = numOf(agent, 'balance');
    final minBalance = numOf(agent, 'minBalance');
    final low = minBalance > 0 && balance < minBalance;
    final soft = Colors.white.withValues(alpha: 0.7);
    Widget stat(String label, num v) => Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${v.toInt()}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white, height: 1.1)),
              const SizedBox(height: 2),
              Text(label, style: TextStyle(fontSize: 12, color: soft)),
            ],
          ),
        );
    Widget gap() => Container(width: 1, height: 34, margin: const EdgeInsets.symmetric(horizontal: Gap.md), color: Colors.white.withValues(alpha: 0.18));
    return Container(
      padding: const EdgeInsets.all(Gap.lg),
      decoration: BoxDecoration(color: AppTheme.brandDeep, borderRadius: BorderRadius.circular(AppTheme.radiusBrand)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(str(agent, 'name') ?? 'Agen', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: soft)),
          const SizedBox(height: Gap.xs),
          Text('Saldo', style: TextStyle(fontSize: 12, color: soft)),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(formatCurrency(balance), style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w800, color: AppTheme.signal, height: 1.15)),
          ),
          if (low)
            Padding(
              padding: const EdgeInsets.only(top: Gap.sm),
              child: Text('Di bawah saldo minimum ${formatCurrency(minBalance)}', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: Color(0xFFFFB4A8))),
            ),
          const SizedBox(height: Gap.lg),
          Divider(height: 1, color: Colors.white.withValues(alpha: 0.18)),
          const SizedBox(height: Gap.md),
          Row(children: [stat('Stok', numOf(stats, 'waiting')), gap(), stat('Dibuat', numOf(stats, 'generated')), gap(), stat('Terpakai', numOf(stats, 'used'))]),
        ],
      ),
    );
  }

  Widget _row(BuildContext context, String label, String value, {bool big = false, Color? color}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          Expanded(child: Text(label, style: TextStyle(fontSize: 14, color: context.colors.onSurfaceVariant))),
          Text(value, style: TextStyle(fontSize: big ? 22 : 16, fontWeight: FontWeight.w800, color: color)),
        ],
      ),
    );
  }

  Widget _periodCard(BuildContext context, Map<String, dynamic>? stats) {
    final key = _period == 'today' ? 'today' : _period == 'month' ? 'currentMonth' : 'allTime';
    final m = mapOf(stats, key);
    final line = Divider(height: 1, color: context.colors.outlineVariant);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        UnderlineTabs(
          padding: EdgeInsets.zero,
          options: const [('today', 'Hari ini'), ('month', 'Bulan ini'), ('all', 'Semua')],
          selected: _period,
          onSelected: (v) => setState(() => _period = v),
        ),
        _row(context, 'Penjualan', formatCurrency(numOf(m, 'income')), big: true),
        line,
        _row(context, 'Komisi', formatCurrency(numOf(m, 'total')), color: context.tone(Tone.success)),
        line,
        _row(context, 'Voucher terjual', '${numOf(m, 'count').toInt()}'),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final agent = mapOf(_data, 'agent');
    final stats = mapOf(_data, 'stats');
    final deposits = (_data?['deposits'] as List?)?.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() ?? const [];
    final open = widget.onOpenTab;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Ringkasan'),
        actions: [
          IconButton(
            tooltip: 'Notifikasi',
            icon: Badge(
              isLabelVisible: _unread > 0,
              label: Text(_unread > 99 ? '99+' : '${_unread}'),
              child: const Icon(Icons.notifications_outlined),
            ),
            onPressed: () async {
              await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const NotificationsScreen()));
              _load();
            },
          ),
        ],
      ),
      body: DataStateView(
        loading: _loading,
        error: _error,
        isEmpty: false,
        emptyIcon: Icons.dashboard_outlined,
        emptyMessage: '',
        onRetry: _load,
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, listBottomPadding(context)),
            children: [
              _hero(context, agent, stats),
              const SizedBox(height: Gap.md),
              FilledButton.icon(
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                onPressed: () => open?.call(1, generate: true),
                icon: const Icon(Icons.add_rounded),
                label: const Text('Buat voucher'),
              ),
              const SizedBox(height: Gap.lg),
              _periodCard(context, stats),
              const SizedBox(height: Gap.lg),
              const SectionHeader('Deposit terakhir'),
              if (deposits.isEmpty)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(Gap.lg),
                    child: Center(child: Text('Belum ada deposit.', style: TextStyle(color: context.colors.onSurfaceVariant))),
                  ),
                )
              else
                for (final d in deposits) ...[
                  EntityTile(
                    icon: Icons.account_balance_wallet_outlined,
                    tone: Tone.primary,
                    title: formatCurrency(numOf(d, 'amount')),
                    subtitle: formatDateTimeOrNull(dateOf(d, 'createdAt')),
                    trailing: StatusPill.status(str(d, 'status') ?? '-'),
                  ),
                  const SizedBox(height: Gap.sm),
                ],
              const SizedBox(height: Gap.sm),
              Text(
                'Isi saldo (deposit) dilakukan lewat portal web agen.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: context.colors.outline),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
