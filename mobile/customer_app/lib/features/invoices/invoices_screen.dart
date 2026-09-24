import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/feature_colors.dart';
import '../../core/widgets/state_views.dart';
import '../../models/invoice.dart';
import 'invoice_detail_screen.dart';
import 'invoice_provider.dart';

class InvoicesScreen extends StatefulWidget {
  const InvoicesScreen({super.key});

  @override
  State<InvoicesScreen> createState() => _InvoicesScreenState();
}

class _InvoicesScreenState extends State<InvoicesScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<InvoiceProvider>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<InvoiceProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text('Tagihan')),
      body: RefreshIndicator(
        onRefresh: () => provider.load(force: true),
        child: _buildBody(provider),
      ),
    );
  }

  Widget _buildBody(InvoiceProvider provider) {
    if (provider.loading && provider.invoices.isEmpty) {
      return const ScrollableCenter(child: AppLoadingState(label: 'Memuat tagihan...'));
    }
    if (provider.error != null && provider.invoices.isEmpty) {
      return ScrollableCenter(
        child: AppErrorState(
          message: provider.error!,
          onRetry: () => provider.load(force: true),
        ),
      );
    }
    if (provider.invoices.isEmpty) {
      return const ScrollableCenter(
        child: AppEmptyState(
          icon: Icons.receipt_long_rounded,
          accent: FeatureColors.invoice,
          title: 'Belum ada tagihan',
          message: 'Tagihan baru muncul di sini menjelang masa aktif paket Anda berakhir, '
              'dan Anda akan diberi tahu lewat notifikasi.',
        ),
      );
    }

    final unpaid = provider.invoices.where((i) => i.isPayable).toList();
    final settled = provider.invoices.where((i) => !i.isPayable).toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
      children: [
        // Unpaid first, because that is the only part of this list a customer
        // has to act on; history below is for looking up, not deciding.
        if (unpaid.isNotEmpty) ...[
          _ListHeading('Perlu dibayar', count: unpaid.length),
          const SizedBox(height: 10),
          ...unpaid.map((invoice) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _InvoiceTile(invoice: invoice),
              )),
          const SizedBox(height: 18),
        ],
        if (settled.isNotEmpty) ...[
          _ListHeading('Riwayat', count: settled.length),
          const SizedBox(height: 10),
          ...settled.map((invoice) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _InvoiceTile(invoice: invoice),
              )),
        ],
      ],
    );
  }
}

class _ListHeading extends StatelessWidget {
  const _ListHeading(this.text, {required this.count});
  final String text;
  final int count;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      children: [
        Text(text, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(width: 8),
        Text(
          '$count',
          style: Theme.of(context).textTheme.labelSmall?.copyWith(color: scheme.onSurfaceVariant),
        ),
      ],
    );
  }
}

class _InvoiceTile extends StatelessWidget {
  const _InvoiceTile({required this.invoice});
  final Invoice invoice;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final brightness = Theme.of(context).brightness;
    final status = _statusOf(invoice, brightness);

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => InvoiceDetailScreen(invoice: invoice)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // The amount leads: it is what a customer scans for.
                    Text(formatCurrency(invoice.amount), style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 4),
                    Text(
                      invoice.invoiceNumber,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      invoice.isPaid && invoice.paidAt != null
                          ? 'Dibayar ${formatDate(invoice.paidAt!)}'
                          : 'Jatuh tempo ${formatDate(invoice.dueDate)}',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              _StatusBadge(label: status.$1, color: status.$2, icon: status.$3),
            ],
          ),
        ),
      ),
    );
  }

  /// Status is carried by an icon and a word as well as a hue, so it still
  /// reads for a customer who cannot tell the greens from the reds.
  (String, Color, IconData) _statusOf(Invoice invoice, Brightness brightness) {
    if (invoice.isPaid) {
      return ('Lunas', StatusColors.success(brightness), Icons.check_circle_rounded);
    }
    if (invoice.isPendingReview) {
      return ('Diperiksa', StatusColors.warning(brightness), Icons.hourglass_top_rounded);
    }
    if (invoice.isOverdue) {
      return ('Terlambat', StatusColors.danger(brightness), Icons.warning_amber_rounded);
    }
    return ('Belum bayar', StatusColors.warning(brightness), Icons.schedule_rounded);
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.label, required this.color, required this.icon});
  final String label;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: Theme.of(context).brightness == Brightness.dark ? 0.2 : 0.12),
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 5),
          Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 11.5)),
        ],
      ),
    );
  }
}
