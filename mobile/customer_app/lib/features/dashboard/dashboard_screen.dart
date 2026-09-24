import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/company/company_logo.dart';
import '../../core/company/company_provider.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/feature_colors.dart';
import '../../core/widgets/state_views.dart';
import '../../models/customer.dart';
import '../../models/dashboard_data.dart';
import '../../models/invoice.dart';
import '../auth/auth_provider.dart';
import '../invoices/invoice_detail_screen.dart';
import '../invoices/invoice_provider.dart';
import '../notifications/notifications_provider.dart';
import '../notifications/notifications_screen.dart';
import '../referral/referral_screen.dart';
import '../renewal/renewal_screen.dart';
import '../speedtest/speedtest_screen.dart';
import '../topup/topup_screen.dart';
import '../upgrade/upgrade_screen.dart';
import 'dashboard_provider.dart';
import 'promo_carousel.dart';
import 'promo_provider.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key, required this.onNavigateToTab});
  final void Function(int tabIndex) onNavigateToTab;

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<InvoiceProvider>().load();
      context.read<DashboardProvider>().load();
      context.read<NotificationsProvider>().load();
      context.read<CompanyProvider>().load();
      context.read<PromoProvider>().load();
    });
  }

  Future<void> _refresh() async {
    await Future.wait([
      context.read<AuthProvider>().fetchMe(),
      context.read<InvoiceProvider>().load(force: true),
      context.read<DashboardProvider>().load(),
      context.read<NotificationsProvider>().load(),
      context.read<PromoProvider>().load(),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final customer = context.watch<AuthProvider>().customer;
    final invoiceProvider = context.watch<InvoiceProvider>();
    final dashboardProvider = context.watch<DashboardProvider>();
    final unreadCount = context.watch<NotificationsProvider>().unreadCount;
    final company = context.watch<CompanyProvider>().info;
    final banners = context.watch<PromoProvider>().banners;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        toolbarHeight: 64,
        title: Row(
          children: [
            CompanyLogo(company: company, size: 34, radius: 10),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    company?.name ?? 'Salfanet',
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  if (customer != null)
                    Text(
                      customer.name,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                    ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: Badge(
              label: Text('$unreadCount'),
              isLabelVisible: unreadCount > 0,
              child: const Icon(Icons.notifications_none_rounded),
            ),
            tooltip: 'Notifikasi',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const NotificationsScreen()),
            ),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: customer == null
            ? const ScrollableCenter(child: AppLoadingState(label: 'Memuat data akun...'))
            : ListView(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
                children: [
                  _StatusHeroCard(customer: customer),
                  if (banners.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    PromoCarousel(banners: banners),
                  ],
                  if (invoiceProvider.nextUnpaid != null) ...[
                    const SizedBox(height: 20),
                    _UnpaidInvoiceCard(invoice: invoiceProvider.nextUnpaid!),
                  ],
                  const SizedBox(height: 24),
                  _SectionLabel('Menu Cepat'),
                  const SizedBox(height: 12),
                  _QuickMenu(onNavigateToTab: widget.onNavigateToTab),
                  if (dashboardProvider.data != null) ...[
                    const SizedBox(height: 24),
                    _SectionLabel('Koneksi Anda'),
                    const SizedBox(height: 12),
                    _ConnectionCard(data: dashboardProvider.data!),
                  ],
                ],
              ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(text, style: Theme.of(context).textTheme.titleMedium);
  }
}

/// The focal point of the screen: the one figure a customer opens this app to
/// check is how much time is left on their package, so it is the largest thing
/// on the page and everything else defers to it.
class _StatusHeroCard extends StatelessWidget {
  const _StatusHeroCard({required this.customer});
  final CustomerProfile customer;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final brightness = Theme.of(context).brightness;
    final profile = customer.profile;
    final daysLeft = customer.expiredAt?.difference(DateTime.now()).inDays;
    final expiringSoon = daysLeft != null && daysLeft <= 3;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: scheme.primaryContainer,
        borderRadius: BorderRadius.circular(AppRadius.hero),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Paket Anda',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: scheme.onPrimaryContainer.withValues(alpha: 0.7),
                          ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      profile?.name ?? 'Tanpa paket',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(color: scheme.onPrimaryContainer),
                    ),
                  ],
                ),
              ),
              _StatusChip(status: customer.status),
            ],
          ),
          const SizedBox(height: 22),
          Text(
            _daysLabel(daysLeft),
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(color: scheme.onPrimaryContainer),
          ),
          const SizedBox(height: 2),
          Row(
            children: [
              if (expiringSoon) ...[
                Icon(Icons.error_outline_rounded, size: 15, color: StatusColors.danger(brightness)),
                const SizedBox(width: 5),
              ],
              Expanded(
                child: Text(
                  customer.expiredAt == null
                      ? 'Tanggal berakhir belum diatur'
                      : 'Berlaku sampai ${formatDate(customer.expiredAt!)}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: expiringSoon
                            ? StatusColors.danger(brightness)
                            : scheme.onPrimaryContainer.withValues(alpha: 0.75),
                        fontWeight: expiringSoon ? FontWeight.w600 : null,
                      ),
                ),
              ),
            ],
          ),
          if (profile?.downloadSpeed != null) ...[
            const SizedBox(height: 18),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
              decoration: BoxDecoration(
                color: scheme.onPrimaryContainer.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(AppRadius.control),
              ),
              child: Row(
                children: [
                  Icon(Icons.speed_rounded, size: 16, color: scheme.onPrimaryContainer),
                  const SizedBox(width: 8),
                  Text(
                    '${profile!.downloadSpeed} Mbps unduh · ${profile.uploadSpeed} Mbps unggah',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: scheme.onPrimaryContainer,
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _daysLabel(int? daysLeft) {
    if (daysLeft == null) return '-';
    if (daysLeft < 0) return 'Masa aktif habis';
    if (daysLeft == 0) return 'Berakhir hari ini';
    return '$daysLeft hari lagi';
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final brightness = Theme.of(context).brightness;
    final scheme = Theme.of(context).colorScheme;
    final active = status.toUpperCase() == 'ACTIVE';
    final color = active ? StatusColors.success(brightness) : StatusColors.danger(brightness);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
      decoration: BoxDecoration(color: scheme.surface, borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(active ? Icons.check_circle_rounded : Icons.pause_circle_rounded, size: 13, color: color),
          const SizedBox(width: 5),
          Text(
            active ? 'Aktif' : status,
            style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 11.5),
          ),
        ],
      ),
    );
  }
}

class _QuickMenuItem {
  const _QuickMenuItem(this.icon, this.label, this.accent, this.onTap);
  final IconData icon;
  final String label;
  final FeatureAccent accent;
  final VoidCallback onTap;
}

/// Each destination keeps its own hue here and everywhere else it appears, so
/// the grid becomes something a customer navigates by color instead of
/// re-reading eight labels every time.
class _QuickMenu extends StatelessWidget {
  const _QuickMenu({required this.onNavigateToTab});
  final void Function(int) onNavigateToTab;

  @override
  Widget build(BuildContext context) {
    final items = [
      _QuickMenuItem(Icons.receipt_long_rounded, 'Tagihan', FeatureColors.invoice, () => onNavigateToTab(1)),
      _QuickMenuItem(Icons.router_rounded, 'WiFi', FeatureColors.wifi, () => onNavigateToTab(2)),
      _QuickMenuItem(Icons.support_agent_rounded, 'Tiket', FeatureColors.ticket, () => onNavigateToTab(3)),
      _QuickMenuItem(Icons.account_balance_wallet_rounded, 'Top Up', FeatureColors.topup,
          () => _push(context, const TopupScreen())),
      _QuickMenuItem(Icons.event_repeat_rounded, 'Perpanjang', FeatureColors.renewal,
          () => _push(context, const RenewalScreen())),
      _QuickMenuItem(Icons.trending_up_rounded, 'Upgrade', FeatureColors.upgrade,
          () => _push(context, const UpgradeScreen())),
      _QuickMenuItem(Icons.volunteer_activism_rounded, 'Referral', FeatureColors.referral,
          () => _push(context, const ReferralScreen())),
      _QuickMenuItem(Icons.network_check_rounded, 'Speed Test', FeatureColors.speedtest,
          () => _push(context, const SpeedtestScreen())),
    ];

    return GridView.count(
      crossAxisCount: 4,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 6,
      crossAxisSpacing: 4,
      childAspectRatio: 0.76,
      children: items.map((item) => _QuickMenuTile(item: item)).toList(),
    );
  }

  void _push(BuildContext context, Widget screen) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
  }
}

class _QuickMenuTile extends StatelessWidget {
  const _QuickMenuTile({required this.item});
  final _QuickMenuItem item;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(AppRadius.card),
      onTap: item.onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            FeatureIconTile(icon: item.icon, accent: item.accent),
            const SizedBox(height: 8),
            Text(
              item.label,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.labelSmall,
            ),
          ],
        ),
      ),
    );
  }
}

/// The one card allowed to break the calm: an unpaid bill is the only thing on
/// this screen that costs the customer something if they scroll past it, so it
/// carries the amount at title size and its own action button.
class _UnpaidInvoiceCard extends StatelessWidget {
  const _UnpaidInvoiceCard({required this.invoice});
  final Invoice invoice;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final brightness = Theme.of(context).brightness;
    final overdue = invoice.isOverdue;
    final accentColor = overdue ? StatusColors.danger(brightness) : StatusColors.warning(brightness);

    return Container(
      decoration: BoxDecoration(
        color: accentColor.withValues(alpha: brightness == Brightness.dark ? 0.16 : 0.09),
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: accentColor.withValues(alpha: 0.35)),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                overdue ? Icons.warning_amber_rounded : Icons.schedule_rounded,
                size: 18,
                color: accentColor,
              ),
              const SizedBox(width: 7),
              Text(
                overdue ? 'Tagihan terlambat' : 'Tagihan belum dibayar',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(color: accentColor),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            formatCurrency(invoice.amount),
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: scheme.onSurface),
          ),
          const SizedBox(height: 3),
          Text(
            'Jatuh tempo ${formatDate(invoice.dueDate)} · ${invoice.invoiceNumber}',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 14),
          FilledButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => InvoiceDetailScreen(invoice: invoice)),
            ),
            child: const Text('Lihat & Bayar'),
          ),
        ],
      ),
    );
  }
}

/// Usage is reported as plain figures with no progress bar: these packages
/// have no quota, and a bar would invent a limit the customer does not have.
class _ConnectionCard extends StatelessWidget {
  const _ConnectionCard({required this.data});
  final DashboardData data;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final brightness = Theme.of(context).brightness;
    final onlineColor = data.isOnline ? StatusColors.success(brightness) : scheme.onSurfaceVariant;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  data.isOnline ? Icons.cloud_done_rounded : Icons.cloud_off_rounded,
                  size: 18,
                  color: onlineColor,
                ),
                const SizedBox(width: 8),
                Text(
                  data.isOnline ? 'Terhubung' : 'Tidak terhubung',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(color: onlineColor),
                ),
                if (data.ipAddress != null) ...[
                  const Spacer(),
                  Text(
                    data.ipAddress!,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                ],
              ],
            ),
            const Divider(height: 26),
            Text(
              'Pemakaian bulan ini',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: StatBlock(
                    label: 'Unduh',
                    value: formatBytes(data.downloadBytes),
                    icon: Icons.south_rounded,
                    valueColor: FeatureColors.invoice.of(brightness),
                  ),
                ),
                Expanded(
                  child: StatBlock(
                    label: 'Unggah',
                    value: formatBytes(data.uploadBytes),
                    icon: Icons.north_rounded,
                    valueColor: FeatureColors.renewal.of(brightness),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
