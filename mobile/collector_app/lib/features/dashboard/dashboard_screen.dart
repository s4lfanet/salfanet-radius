import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/state_views.dart';

/// Answers the collector's first question: "berapa yang belum tertagih
/// bulan ini" — same summary the web portal's dashboard card shows.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _summary;
  late String _period = _thisMonth();

  static String _thisMonth() {
    final d = DateTime.now();
    return '${d.year}-${d.month.toString().padLeft(2, '0')}';
  }

  String _shiftMonth(int delta) {
    final p = _period.split('-').map(int.parse).toList();
    final d = DateTime(p[0], p[1] + delta, 1);
    return '${d.year}-${d.month.toString().padLeft(2, '0')}';
  }

  String get _monthLabel {
    final p = _period.split('-').map(int.parse).toList();
    return DateFormat('MMMM yyyy', 'id_ID').format(DateTime(p[0], p[1], 1));
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/collector/dashboard', query: {'period': _period});
      setState(() => _summary = res is Map ? Map<String, dynamic>.from(res['summary'] as Map? ?? res) : null);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  num _n(String key) {
    final v = _summary?[key];
    return v is num ? v : num.tryParse('$v') ?? 0;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Dashboard Kolektor')),
      body: DataStateView(
        loading: _loading && _summary == null,
        error: _error,
        isEmpty: false,
        emptyIcon: Icons.dashboard_outlined,
        emptyMessage: '',
        onRetry: _load,
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(Gap.page),
            children: [
              // Period switcher — same prev/month/next strip as the web.
              Row(
                children: [
                  IconButton(
                    onPressed: () {
                      _period = _shiftMonth(-1);
                      _load();
                    },
                    icon: const Icon(Icons.chevron_left_rounded),
                  ),
                  Expanded(
                    child: Center(
                      child: Text(_monthLabel, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis),
                    ),
                  ),
                  IconButton(
                    onPressed: () {
                      _period = _shiftMonth(1);
                      _load();
                    },
                    icon: const Icon(Icons.chevron_right_rounded),
                  ),
                ],
              ),
              const SizedBox(height: Gap.sm),
              _HeroCard(
                title: 'Belum Tertagih',
                amount: formatCurrency(_n('unpaid_amount')),
                subtitle: '${_n('unpaid_count')} tagihan terbuka',
                icon: Icons.receipt_long_outlined,
                tone: _n('unpaid_count') > 0 ? Tone.danger : Tone.success,
              ),
              const SizedBox(height: Gap.md),
              Row(
                children: [
                  Expanded(child: _StatTile(label: 'Tertagih Bulan Ini', value: formatCurrency(_n('total_amount')), sub: '${_n('invoice_count')} transaksi')),
                  const SizedBox(width: Gap.md),
                  Expanded(child: _StatTile(label: 'Hari Ini', value: formatCurrency(_n('today_amount')), sub: '${_n('today_count')} transaksi')),
                ],
              ),
              const SizedBox(height: Gap.md),
              Row(
                children: [
                  Expanded(child: _StatTile(label: 'Tunai', value: formatCurrency(_n('cash_amount')), icon: Icons.payments_outlined)),
                  const SizedBox(width: Gap.md),
                  Expanded(child: _StatTile(label: 'Transfer', value: formatCurrency(_n('transfer_amount')), icon: Icons.account_balance_outlined)),
                ],
              ),
              const SizedBox(height: Gap.md),
              Row(
                children: [
                  Expanded(child: _StatTile(label: 'Tagihan Terbit', value: '${_n('bill_count')}', sub: formatCurrency(_n('bill_amount')))),
                  const SizedBox(width: Gap.md),
                  Expanded(child: _StatTile(label: 'Sudah Dibayar', value: '${_n('bill_paid_count')}', sub: formatCurrency(_n('bill_paid_amount')))),
                ],
              ),
              const SizedBox(height: Gap.md),
              _StatTile(
                label: 'Pelanggan Terisolir',
                value: '${_n('isolir_count')}',
                icon: Icons.wifi_off_rounded,
                tone: _n('isolir_count') > 0 ? Tone.warning : Tone.neutral,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.title, required this.amount, required this.subtitle, required this.icon, required this.tone});

  final String title;
  final String amount;
  final String subtitle;
  final IconData icon;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final c = context.tone(tone);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(Gap.lg),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)),
              child: Icon(icon, color: c, size: 24),
            ),
            const SizedBox(width: Gap.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(fontSize: 12.5, color: context.colors.onSurfaceVariant)),
                  const SizedBox(height: 2),
                  FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(amount, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, height: 1.1))),
                  const SizedBox(height: 2),
                  Text(subtitle, style: TextStyle(fontSize: 12, color: context.colors.onSurfaceVariant)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.label, required this.value, this.sub, this.icon, this.tone});

  final String label;
  final String value;
  final String? sub;
  final IconData? icon;
  final Tone? tone;

  @override
  Widget build(BuildContext context) {
    final c = tone != null ? context.tone(tone!) : context.colors.primary;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(Gap.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (icon != null) ...[Icon(icon, size: 16, color: c), const SizedBox(width: Gap.xs)],
                Expanded(child: Text(label, style: TextStyle(fontSize: 12, color: context.colors.onSurfaceVariant), maxLines: 1, overflow: TextOverflow.ellipsis)),
              ],
            ),
            const SizedBox(height: Gap.sm),
            Text(value, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800), maxLines: 1, overflow: TextOverflow.ellipsis),
            if (sub != null) ...[
              const SizedBox(height: 2),
              Text(sub!, style: TextStyle(fontSize: 11.5, color: context.colors.onSurfaceVariant), maxLines: 1, overflow: TextOverflow.ellipsis),
            ],
          ],
        ),
      ),
    );
  }
}
