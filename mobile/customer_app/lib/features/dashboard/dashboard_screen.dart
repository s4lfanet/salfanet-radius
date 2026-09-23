import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/company/company_logo.dart';
import '../../core/company/company_provider.dart';
import '../../core/formatters.dart';
import '../../models/customer.dart';
import '../../models/dashboard_data.dart';
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
    final auth = context.watch<AuthProvider>();
    final customer = auth.customer;
    final invoiceProvider = context.watch<InvoiceProvider>();
    final dashboardProvider = context.watch<DashboardProvider>();
    final unreadCount = context.watch<NotificationsProvider>().unreadCount;
    final company = context.watch<CompanyProvider>().info;
    final banners = context.watch<PromoProvider>().banners;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 12,
        title: Row(
          children: [
            CompanyLogo(company: company, size: 32, radius: 9),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                company?.name ?? 'Salfanet',
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 16),
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: Badge(
              label: Text('$unreadCount'),
              isLabelVisible: unreadCount > 0,
              child: const Icon(Icons.notifications_outlined),
            ),
            tooltip: 'Notifikasi',
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const NotificationsScreen())),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            if (customer != null) _StatusHeroCard(customer: customer),
            const SizedBox(height: 18),
            PromoCarousel(banners: banners),
            if (banners.isNotEmpty) const SizedBox(height: 18),
            _QuickMenu(onNavigateToTab: widget.onNavigateToTab),
            const SizedBox(height: 18),
            if (invoiceProvider.nextUnpaid != null) ...[
              _UnpaidInvoiceCard(invoiceId: invoiceProvider.nextUnpaid!.id),
              const SizedBox(height: 18),
            ],
            if (dashboardProvider.data != null) _UsageCard(data: dashboardProvider.data!),
          ],
        ),
      ),
    );
  }
}

/// Account status at a glance: package, speed, and an explicit days-left
/// countdown — the one number a billing-app user actually needs on open
/// (C-3: content-driven, not a generic profile card).
class _StatusHeroCard extends StatelessWidget {
  const _StatusHeroCard({required this.customer});
  final CustomerProfile customer;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final profile = customer.profile;
    final daysLeft = customer.expiredAt?.difference(DateTime.now()).inDays;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: scheme.primaryContainer,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: scheme.onPrimaryContainer.withValues(alpha: 0.12),
                child: Text(
                  customer.name.isNotEmpty ? customer.name[0].toUpperCase() : '?',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: scheme.onPrimaryContainer),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(customer.name, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: scheme.onPrimaryContainer)),
                    Text(profile?.name ?? '-', style: TextStyle(color: scheme.onPrimaryContainer.withValues(alpha: 0.75), fontSize: 13)),
                  ],
                ),
              ),
              _StatusChip(status: customer.status),
            ],
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              if (profile?.downloadSpeed != null)
                Expanded(
                  child: _heroStat(scheme, 'Kecepatan', '${profile!.downloadSpeed}/${profile.uploadSpeed} Mbps'),
                ),
              Expanded(
                child: _heroStat(
                  scheme,
                  'Masa Aktif',
                  daysLeft == null ? '-' : (daysLeft >= 0 ? '$daysLeft hari lagi' : 'Kedaluwarsa'),
                  emphasize: daysLeft != null && daysLeft <= 3,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _heroStat(ColorScheme scheme, String label, String value, {bool emphasize = false}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 11, color: scheme.onPrimaryContainer.withValues(alpha: 0.65))),
        const SizedBox(height: 2),
        Text(
          value,
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 14,
            color: emphasize ? const Color(0xFFF04438) : scheme.onPrimaryContainer,
          ),
        ),
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final active = status.toUpperCase() == 'ACTIVE';
    final color = active ? const Color(0xFF12B76A) : const Color(0xFFF04438);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.85), borderRadius: BorderRadius.circular(999)),
      child: Text(
        active ? 'Aktif' : status,
        style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 11),
      ),
    );
  }
}

class _QuickMenuItem {
  const _QuickMenuItem(this.icon, this.label, this.onTap);
  final IconData icon;
  final String label;
  final VoidCallback onTap;
}

class _QuickMenu extends StatelessWidget {
  const _QuickMenu({required this.onNavigateToTab});
  final void Function(int) onNavigateToTab;

  @override
  Widget build(BuildContext context) {
    final items = [
      _QuickMenuItem(Icons.receipt_long_outlined, 'Tagihan', () => onNavigateToTab(1)),
      _QuickMenuItem(Icons.wifi_outlined, 'WiFi', () => onNavigateToTab(2)),
      _QuickMenuItem(Icons.support_agent_outlined, 'Tiket', () => onNavigateToTab(3)),
      _QuickMenuItem(Icons.account_balance_wallet_outlined, 'Top Up', () => _push(context, const TopupScreen())),
      _QuickMenuItem(Icons.upgrade_outlined, 'Upgrade', () => _push(context, const UpgradeScreen())),
      _QuickMenuItem(Icons.autorenew, 'Perpanjang', () => _push(context, const RenewalScreen())),
      _QuickMenuItem(Icons.card_giftcard_outlined, 'Referral', () => _push(context, const ReferralScreen())),
      _QuickMenuItem(Icons.speed_outlined, 'Speed Test', () => _push(context, const SpeedtestScreen())),
    ];

    return GridView.count(
      crossAxisCount: 4,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 8,
      childAspectRatio: 0.8,
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
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: item.onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 52,
            height: 52,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: scheme.surfaceContainerHigh, borderRadius: BorderRadius.circular(16)),
            child: Icon(item.icon, color: scheme.primary),
          ),
          const SizedBox(height: 6),
          Text(item.label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11.5)),
        ],
      ),
    );
  }
}

class _UnpaidInvoiceCard extends StatelessWidget {
  const _UnpaidInvoiceCard({required this.invoiceId});
  final String invoiceId;

  @override
  Widget build(BuildContext context) {
    final invoiceProvider = context.watch<InvoiceProvider>();
    final invoice = invoiceProvider.invoices.firstWhere((i) => i.id == invoiceId);
    final scheme = Theme.of(context).colorScheme;

    return Card(
      color: scheme.errorContainer.withValues(alpha: 0.5),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => InvoiceDetailScreen(invoice: invoice))),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Row(
            children: [
              Icon(Icons.warning_amber_rounded, color: scheme.error),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      invoice.isOverdue ? 'Tagihan Terlambat' : 'Tagihan Belum Dibayar',
                      style: TextStyle(fontWeight: FontWeight.bold, color: scheme.onErrorContainer),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${formatCurrency(invoice.amount)} · jatuh tempo ${formatDate(invoice.dueDate)}',
                      style: TextStyle(color: scheme.onErrorContainer),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: scheme.onErrorContainer),
            ],
          ),
        ),
      ),
    );
  }
}

class _UsageCard extends StatelessWidget {
  const _UsageCard({required this.data});
  final DashboardData data;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final onlineColor = data.isOnline ? const Color(0xFF12B76A) : scheme.error;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(width: 8, height: 8, decoration: BoxDecoration(color: onlineColor, shape: BoxShape.circle)),
                const SizedBox(width: 8),
                Text(data.isOnline ? 'Online' : 'Offline', style: TextStyle(color: onlineColor, fontWeight: FontWeight.w600)),
                if (data.ipAddress != null) ...[
                  const Spacer(),
                  Text(data.ipAddress!, style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12)),
                ],
              ],
            ),
            const Divider(height: 28),
            Text('Pemakaian Bulan Ini', style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12)),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Row(
                    children: [
                      Icon(Icons.arrow_downward, size: 16, color: scheme.primary),
                      const SizedBox(width: 4),
                      Text(formatBytes(data.downloadBytes), style: const TextStyle(fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
                Expanded(
                  child: Row(
                    children: [
                      Icon(Icons.arrow_upward, size: 16, color: scheme.secondary),
                      const SizedBox(width: 4),
                      Text(formatBytes(data.uploadBytes), style: const TextStyle(fontWeight: FontWeight.w600)),
                    ],
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
