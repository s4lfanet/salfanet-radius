import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import '../notifications/notifications_screen.dart';

/// Ringkasan agen: saldo, penjualan dan komisi (hari ini / bulan ini / total),
/// stok voucher, dan riwayat deposit terakhir — sama dengan dashboard portal web.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;

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
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Widget _statCard(BuildContext context, String title, Map<String, dynamic>? m) {
    final muted = context.colors.onSurfaceVariant;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(Gap.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: muted)),
            const SizedBox(height: Gap.sm),
            Row(
              children: [
                Expanded(child: LabeledFigure(label: 'Terjual', value: '${numOf(m, 'count').toInt()} voucher')),
                Expanded(child: LabeledFigure(label: 'Penjualan', value: formatCurrency(numOf(m, 'income')))),
                Expanded(child: LabeledFigure(label: 'Komisi', value: formatCurrency(numOf(m, 'total')), color: context.tone(Tone.success))),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final agent = mapOf(_data, 'agent');
    final stats = mapOf(_data, 'stats');
    final deposits = (_data?['deposits'] as List?)?.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() ?? const [];
    final balance = numOf(agent, 'balance');
    final minBalance = numOf(agent, 'minBalance');

    return Scaffold(
      appBar: AppBar(
        title: const Text('Ringkasan Agen'),
        actions: [
          IconButton(
            tooltip: 'Notifikasi',
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const NotificationsScreen())),
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
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(Gap.lg),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Halo, ${str(agent, 'name') ?? 'Agen'}', style: TextStyle(fontSize: 13, color: context.colors.onSurfaceVariant)),
                      const SizedBox(height: Gap.xs),
                      Text('Saldo', style: TextStyle(fontSize: 12.5, color: context.colors.onSurfaceVariant)),
                      Text(formatCurrency(balance), style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
                      if (minBalance > 0) ...[
                        const SizedBox(height: Gap.xs),
                        Text(
                          'Saldo minimum ${formatCurrency(minBalance)}',
                          style: TextStyle(fontSize: 12, color: balance < minBalance ? context.tone(Tone.danger) : context.colors.onSurfaceVariant),
                        ),
                      ],
                      const SizedBox(height: Gap.md),
                      Row(
                        children: [
                          Expanded(child: LabeledFigure(label: 'Stok voucher', value: '${numOf(stats, 'waiting').toInt()}')),
                          Expanded(child: LabeledFigure(label: 'Dibuat', value: '${numOf(stats, 'generated').toInt()}')),
                          Expanded(child: LabeledFigure(label: 'Terpakai', value: '${numOf(stats, 'used').toInt()}')),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: Gap.sm),
              _statCard(context, 'Hari ini', mapOf(stats, 'today')),
              const SizedBox(height: Gap.sm),
              _statCard(context, 'Bulan ini', mapOf(stats, 'currentMonth')),
              const SizedBox(height: Gap.sm),
              _statCard(context, 'Sepanjang waktu', mapOf(stats, 'allTime')),
              const SizedBox(height: Gap.lg),
              const SectionHeader('Deposit terakhir'),
              if (deposits.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: Gap.lg),
                  child: Center(child: Text('Belum ada deposit.', style: TextStyle(color: context.colors.onSurfaceVariant))),
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
