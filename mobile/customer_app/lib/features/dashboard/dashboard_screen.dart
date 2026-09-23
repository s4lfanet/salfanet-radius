import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/formatters.dart';
import '../../models/customer.dart';
import '../../models/dashboard_data.dart';
import '../auth/auth_provider.dart';
import '../invoices/invoice_provider.dart';
import '../invoices/invoice_detail_sheet.dart';
import '../notifications/notifications_provider.dart';
import '../notifications/notifications_screen.dart';
import 'dashboard_provider.dart';

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
      context.read<InvoiceProvider>().load();
      context.read<DashboardProvider>().load();
      context.read<NotificationsProvider>().load();
    });
  }

  Future<void> _refresh() async {
    await Future.wait([
      context.read<AuthProvider>().fetchMe(),
      context.read<InvoiceProvider>().load(force: true),
      context.read<DashboardProvider>().load(),
      context.read<NotificationsProvider>().load(),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final customer = auth.customer;
    final invoiceProvider = context.watch<InvoiceProvider>();
    final dashboardProvider = context.watch<DashboardProvider>();
    final unreadCount = context.watch<NotificationsProvider>().unreadCount;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Beranda'),
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
          padding: const EdgeInsets.all(16),
          children: [
            if (customer != null) _ProfileCard(customer: customer),
            const SizedBox(height: 16),
            if (invoiceProvider.nextUnpaid != null) ...[
              _UnpaidInvoiceCard(invoiceId: invoiceProvider.nextUnpaid!.id),
              const SizedBox(height: 16),
            ],
            if (dashboardProvider.data != null) _UsageCard(data: dashboardProvider.data!),
          ],
        ),
      ),
    );
  }
}

class _ProfileCard extends StatelessWidget {
  const _ProfileCard({required this.customer});
  final CustomerProfile customer;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final profile = customer.profile;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 26,
                  backgroundColor: scheme.primaryContainer,
                  child: Text(
                    customer.name.isNotEmpty ? customer.name[0].toUpperCase() : '?',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: scheme.onPrimaryContainer),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(customer.name, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                      Text(customer.username, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                    ],
                  ),
                ),
                _StatusChip(status: customer.status),
              ],
            ),
            const Divider(height: 32),
            _InfoRow(label: 'Paket', value: profile?.name ?? '-'),
            if (profile?.downloadSpeed != null)
              _InfoRow(label: 'Kecepatan', value: '${profile!.downloadSpeed} / ${profile.uploadSpeed} Mbps'),
            _InfoRow(
              label: 'Berlaku hingga',
              value: customer.expiredAt != null ? formatDate(customer.expiredAt!) : '-',
            ),
          ],
        ),
      ),
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
      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(999)),
      child: Text(
        active ? 'Aktif' : status,
        style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 12),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: scheme.onSurfaceVariant)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
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
        onTap: () => showInvoiceDetailSheet(context, invoice),
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
