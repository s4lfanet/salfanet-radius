import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
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
    const onBrand = Colors.white;
    Widget mini(String label, num v) => Expanded(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: Gap.md, vertical: Gap.sm + 2),
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(AppTheme.radiusControl)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: onBrand.withValues(alpha: 0.85))),
                const SizedBox(height: 2),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text('${v.toInt()}', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: onBrand)),
                ),
              ],
            ),
          ),
        );
    return Container(
      padding: const EdgeInsets.all(Gap.lg),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppTheme.radiusBrand),
        gradient: const LinearGradient(colors: [AppTheme.brand, AppTheme.brandDeep], begin: Alignment.topLeft, end: Alignment.bottomRight),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Halo, ${str(agent, 'name') ?? 'Agen'}', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: onBrand.withValues(alpha: 0.9))),
          const SizedBox(height: Gap.md),
          Text('Saldo', style: TextStyle(fontSize: 12, color: onBrand.withValues(alpha: 0.8))),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(formatCurrency(balance), style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: onBrand, height: 1.15)),
          ),
          if (low) ...[
            const SizedBox(height: Gap.sm),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(AppTheme.radiusPill)),
              child: Text('Saldo di bawah minimum ${formatCurrency(minBalance)}', style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: Color(0xFFB91C1C))),
            ),
          ],
          const SizedBox(height: Gap.lg),
          Row(
            children: [
              mini('Stok voucher', numOf(stats, 'waiting')),
              const SizedBox(width: Gap.sm),
              mini('Dibuat', numOf(stats, 'generated')),
              const SizedBox(width: Gap.sm),
              mini('Terpakai', numOf(stats, 'used')),
            ],
          ),
        ],
      ),
    );
  }

  Widget _quick(BuildContext context, IconData icon, String label, VoidCallback onTap, {bool primary = false}) {
    final c = context.colors;
    return Expanded(
      child: Material(
        color: primary ? c.primary : c.surface,
        borderRadius: BorderRadius.circular(AppTheme.radiusCard),
        child: InkWell(
          borderRadius: BorderRadius.circular(AppTheme.radiusCard),
          onTap: onTap,
          child: Container(
            width: double.infinity,
            height: 76,
            padding: const EdgeInsets.symmetric(horizontal: 4),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppTheme.radiusCard),
              border: primary ? null : Border.all(color: c.outlineVariant),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 22, color: primary ? onColor(c.primary) : c.primary),
                const SizedBox(height: 6),
                Text(
                  label,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  style: TextStyle(fontSize: 12, height: 1.15, fontWeight: FontWeight.w700, color: primary ? onColor(c.primary) : c.onSurface),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _periodCard(BuildContext context, Map<String, dynamic>? stats) {
    final key = _period == 'today' ? 'today' : _period == 'month' ? 'currentMonth' : 'allTime';
    final m = mapOf(stats, key);
    final muted = context.colors.onSurfaceVariant;
    Widget cell(String label, String value, {Color? color}) => Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: muted)),
              const SizedBox(height: 4),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color, height: 1.15)),
              ),
            ],
          ),
        );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(Gap.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: double.infinity,
              child: SegmentedButton<String>(
                showSelectedIcon: false,
                style: const ButtonStyle(visualDensity: VisualDensity.compact),
                segments: const [
                  ButtonSegment(value: 'today', label: Text('Hari ini')),
                  ButtonSegment(value: 'month', label: Text('Bulan ini')),
                  ButtonSegment(value: 'all', label: Text('Semua')),
                ],
                selected: {_period},
                onSelectionChanged: (v) => setState(() => _period = v.first),
              ),
            ),
            const SizedBox(height: Gap.lg),
            Text('Penjualan', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: muted)),
            const SizedBox(height: 2),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(formatCurrency(numOf(m, 'income')), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, height: 1.15)),
            ),
            const SizedBox(height: Gap.md),
            Divider(height: 1, color: context.colors.outlineVariant),
            const SizedBox(height: Gap.md),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                cell('Komisi', formatCurrency(numOf(m, 'total')), color: context.tone(Tone.success)),
                cell('Voucher terjual', '${numOf(m, 'count').toInt()}'),
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
              Row(
                children: [
                  _quick(context, Icons.add_rounded, 'Buat Voucher', () => open?.call(1, generate: true), primary: true),
                  const SizedBox(width: Gap.sm),
                  _quick(context, Icons.confirmation_number_outlined, 'Voucher', () => open?.call(1)),
                  const SizedBox(width: Gap.sm),
                  _quick(context, Icons.wifi_rounded, 'Sesi', () => open?.call(2)),
                  const SizedBox(width: Gap.sm),
                  _quick(context, Icons.support_agent_outlined, 'Tiket', () => open?.call(3)),
                ],
              ),
              const SizedBox(height: Gap.md),
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
