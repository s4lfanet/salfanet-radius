import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import '../../models/dashboard_stats.dart';
import '../activity_log/activity_log_screen.dart';
import '../auth/auth_provider.dart';
import '../invoices/invoice_list_screen.dart';
import '../invoices/invoice_provider.dart';
import '../keuangan/keuangan_screen.dart';
import '../notifications/notifications_provider.dart';
import '../notifications/notifications_screen.dart';
import '../pppoe/pppoe_list_screen.dart';
import '../pppoe/pppoe_provider.dart';
import '../registrations/registration_list_screen.dart';
import '../sessions/session_list_screen.dart';
import 'dashboard_provider.dart';

/// The dashboard's job is "what needs me today": the "Perlu Tindakan"
/// block is the page; revenue is the one headline figure; the network
/// numbers and activity feed are supporting context. Every figure opens the
/// list behind it, like the web panel's cards do.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<DashboardProvider>().load();
      context.read<NotificationsProvider>().load();
    });
  }

  Future<void> _refresh() async {
    await Future.wait([
      context.read<DashboardProvider>().load(),
      context.read<NotificationsProvider>().load(),
    ]);
  }

  void _open(Widget screen) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));

  // Lists opened from here get their own provider so a filter set from the
  // dashboard doesn't leak into the Pelanggan / Tagihan tabs.
  void _openCustomers({String? status}) => _open(ChangeNotifierProvider(create: (_) => PppoeProvider(), child: PppoeListScreen(initialStatus: status)));
  void _openInvoices() => _open(ChangeNotifierProvider(create: (_) => InvoiceProvider(), child: const InvoiceListScreen()));

  @override
  Widget build(BuildContext context) {
    final dash = context.watch<DashboardProvider>();
    final unread = context.watch<NotificationsProvider>().unreadCount;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          IconButton(
            tooltip: 'Notifikasi',
            onPressed: () => _open(const NotificationsScreen()),
            icon: Badge(isLabelVisible: unread > 0, label: Text(unread > 99 ? '99+' : '$unread'), child: const Icon(Icons.notifications_outlined)),
          ),
          const SizedBox(width: Gap.xs),
        ],
      ),
      body: DataStateView(
        loading: dash.loading && dash.stats == null,
        error: dash.stats == null ? dash.error : null,
        onRetry: _refresh,
        isEmpty: false,
        emptyIcon: Icons.dashboard_outlined,
        emptyMessage: '',
        child: dash.stats == null ? const SizedBox.shrink() : RefreshIndicator(onRefresh: _refresh, child: _content(context, dash)),
      ),
    );
  }

  Widget _content(BuildContext context, DashboardProvider dash) {
    final s = dash.stats!;
    final user = context.watch<AuthProvider>().user;
    final muted = context.colors.onSurfaceVariant;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(Gap.page, Gap.xs, Gap.page, Gap.xl),
      children: [
        Text('Halo, ${user?.name.split(' ').first ?? ''}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, height: 1.2)),
        const SizedBox(height: 2),
        Text(s.periodLabel, style: TextStyle(color: muted, fontSize: 13)),
        const SizedBox(height: Gap.lg),

        _RevenueHero(stats: s, onTap: () => _open(const KeuanganScreen())),
        const SizedBox(height: Gap.xl),

        const SectionHeader('Perlu Tindakan'),
        Card(
          child: Column(
            children: [
              _ActionRow(
                icon: Icons.person_add_alt_1_rounded,
                tone: Tone.accent,
                label: 'Registrasi baru',
                hint: 'Menunggu disetujui',
                count: s.newRegistrations,
                onTap: () => _open(const RegistrationListScreen()),
              ),
              const Divider(indent: 68),
              _ActionRow(
                icon: Icons.receipt_long_rounded,
                tone: Tone.warning,
                label: 'Tagihan belum dibayar',
                hint: '${s.upcomingInvoices} jatuh tempo dalam waktu dekat',
                count: s.unpaidInvoicesCount,
                onTap: _openInvoices,
              ),
              const Divider(indent: 68),
              _ActionRow(
                icon: Icons.pause_circle_rounded,
                tone: Tone.danger,
                label: 'Pelanggan terisolir',
                hint: s.suspendedCount > 0 ? '${s.suspendedCount} lainnya suspend' : 'Koneksi dibatasi karena tagihan',
                count: s.isolatedCount,
                onTap: () => _openCustomers(status: 'isolated'),
              ),
            ],
          ),
        ),
        const SizedBox(height: Gap.xl),

        const SectionHeader('Jaringan'),
        Row(
          children: [
            Expanded(
              child: _MetricCard(
                icon: Icons.people_alt_rounded,
                tone: Tone.primary,
                value: '${s.totalPppoeUsers}',
                label: 'Pelanggan',
                detail: '${s.activePppoeUsers} aktif',
                onTap: () => _openCustomers(),
              ),
            ),
            const SizedBox(width: Gap.md),
            Expanded(
              child: _MetricCard(
                icon: Icons.wifi_tethering_rounded,
                tone: Tone.success,
                value: '${s.activeSessionsPPPoE + s.activeSessionsHotspot}',
                label: 'Sesi online',
                detail: 'PPPoE ${s.activeSessionsPPPoE} · Hotspot ${s.activeSessionsHotspot}',
                onTap: () => _open(const SessionListScreen()),
              ),
            ),
          ],
        ),
        const SizedBox(height: Gap.md),
        Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: Gap.md),
            child: Row(
              children: [
                Expanded(child: _ServiceStatus(label: 'RADIUS', online: s.radiusOnline)),
                Container(width: 1, height: 34, color: context.colors.outline),
                Expanded(child: _ServiceStatus(label: 'Database', online: s.databaseOnline)),
                Container(width: 1, height: 34, color: context.colors.outline),
                Expanded(child: _ServiceStatus(label: 'API', online: s.apiOnline)),
              ],
            ),
          ),
        ),
        if (s.activities.isNotEmpty) ...[
          const SizedBox(height: Gap.xl),
          SectionHeader('Aktivitas Terbaru', action: 'Lihat semua', onAction: () => _open(const ActivityLogScreen())),
          Card(
            child: Column(
              children: [
                for (var i = 0; i < s.activities.length && i < 5; i++) ...[
                  if (i > 0) const Divider(indent: Gap.lg, endIndent: Gap.lg),
                  _ActivityRow(activity: (s.activities[i] as Map).cast<String, dynamic>()),
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }
}

/// The single focal figure (DESIGN.md: one accent at the key moment). Solid
/// brand fill, not a gradient — gradients are reserved for the login mark.
class _RevenueHero extends StatelessWidget {
  const _RevenueHero({required this.stats, required this.onTap});
  final DashboardStats stats;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    const onBrand = Colors.white;
    final soft = Colors.white.withValues(alpha: 0.92);
    return Material(
      color: AppTheme.brand,
      borderRadius: BorderRadius.circular(AppTheme.radiusCard),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Gap.xl, Gap.xl, Gap.xl, Gap.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text('Pendapatan invoice bulan ini', style: TextStyle(color: soft, fontSize: 12.5, fontWeight: FontWeight.w600)),
                  const Spacer(),
                  Icon(Icons.chevron_right_rounded, color: soft, size: 20),
                ],
              ),
              const SizedBox(height: Gap.xs),
              Text(stats.invoiceRevenueFormatted, style: const TextStyle(color: onBrand, fontSize: 28, fontWeight: FontWeight.w800, height: 1.15)),
              const SizedBox(height: Gap.lg),
              Container(height: 1, color: Colors.white.withValues(alpha: 0.18)),
              const SizedBox(height: Gap.md),
              Row(
                children: [
                  Expanded(child: _HeroStat(label: 'Invoice hari ini', value: stats.invoiceRevenueTodayFormatted)),
                  Expanded(child: _HeroStat(label: 'Voucher hari ini', value: stats.voucherRevenueTodayFormatted)),
                  Expanded(child: _HeroStat(label: 'Invoice terbit', value: '${stats.invoiceCountMonth}')),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeroStat extends StatelessWidget {
  const _HeroStat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: Colors.white.withValues(alpha: 0.92), fontSize: 11)),
        const SizedBox(height: 2),
        Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 13.5, fontWeight: FontWeight.w700)),
      ],
    );
  }
}

class _ActionRow extends StatelessWidget {
  const _ActionRow({required this.icon, required this.tone, required this.label, required this.hint, required this.count, required this.onTap});
  final IconData icon;
  final Tone tone;
  final String label;
  final String hint;
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.tone(tone);
    final idle = count == 0;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.md, Gap.md, Gap.md),
        child: Row(
          children: [
            RoleIconTile(icon: icon, color: idle ? context.tone(Tone.neutral) : c, size: 40),
            const SizedBox(width: Gap.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(hint, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: context.colors.onSurfaceVariant)),
                ],
              ),
            ),
            Text('$count', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: idle ? context.colors.onSurfaceVariant : c)),
            const SizedBox(width: Gap.xs),
            Icon(Icons.chevron_right_rounded, color: context.colors.onSurfaceVariant, size: 20),
          ],
        ),
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.icon, required this.tone, required this.value, required this.label, required this.detail, required this.onTap});
  final IconData icon;
  final Tone tone;
  final String value;
  final String label;
  final String detail;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(Gap.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RoleIconTile(icon: icon, color: context.tone(tone), size: 36),
              const SizedBox(height: Gap.md),
              Text(value, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, height: 1.1)),
              const SizedBox(height: 2),
              Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              const SizedBox(height: 2),
              Text(detail, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: context.colors.onSurfaceVariant)),
            ],
          ),
        ),
      ),
    );
  }
}

class _ServiceStatus extends StatelessWidget {
  const _ServiceStatus({required this.label, required this.online});
  final String label;
  final bool online;

  @override
  Widget build(BuildContext context) {
    final c = context.tone(online ? Tone.success : Tone.danger);
    return Column(
      children: [
        Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: context.colors.onSurfaceVariant)),
        const SizedBox(height: 4),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(online ? Icons.check_circle_rounded : Icons.error_rounded, size: 15, color: c),
            const SizedBox(width: 4),
            Text(online ? 'Online' : 'Offline', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c)),
          ],
        ),
      ],
    );
  }
}

class _ActivityRow extends StatelessWidget {
  const _ActivityRow({required this.activity});
  final Map<String, dynamic> activity;

  @override
  Widget build(BuildContext context) {
    final time = dateOf(activity, 'time');
    final failed = activity['status'] == 'error' || activity['status'] == 'failed';
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Gap.lg, vertical: Gap.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 5),
            child: Icon(Icons.circle, size: 7, color: context.tone(failed ? Tone.danger : Tone.primary)),
          ),
          const SizedBox(width: Gap.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(str(activity, 'action') ?? '-', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, height: 1.35)),
                const SizedBox(height: 2),
                Text(
                  [str(activity, 'user'), if (time != null) formatRelativeTime(time)].whereType<String>().join(' · '),
                  style: TextStyle(fontSize: 11.5, color: context.colors.onSurfaceVariant),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
