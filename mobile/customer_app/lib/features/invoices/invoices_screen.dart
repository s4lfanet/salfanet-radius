import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/formatters.dart';
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
      return const Center(child: CircularProgressIndicator());
    }
    if (provider.error != null && provider.invoices.isEmpty) {
      return _ErrorState(message: provider.error!, onRetry: () => provider.load(force: true));
    }
    if (provider.invoices.isEmpty) {
      return ListView(
        children: const [
          SizedBox(height: 120),
          Center(child: Icon(Icons.receipt_long_outlined, size: 56, color: Colors.grey)),
          SizedBox(height: 12),
          Center(child: Text('Belum ada tagihan')),
        ],
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: provider.invoices.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, index) => _InvoiceTile(invoice: provider.invoices[index]),
    );
  }
}

class _InvoiceTile extends StatelessWidget {
  const _InvoiceTile({required this.invoice});
  final Invoice invoice;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (label, color) = _statusVisual(invoice, scheme);

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => InvoiceDetailScreen(invoice: invoice))),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(invoice.invoiceNumber, style: const TextStyle(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 4),
                    Text(formatCurrency(invoice.amount), style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 4),
                    Text('Jatuh tempo ${formatDate(invoice.dueDate)}', style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(999)),
                child: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 12)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  (String, Color) _statusVisual(Invoice invoice, ColorScheme scheme) {
    if (invoice.isPaid) return ('Lunas', const Color(0xFF12B76A));
    if (invoice.isPendingReview) return ('Diverifikasi', const Color(0xFFF79009));
    if (invoice.isOverdue) return ('Terlambat', scheme.error);
    return ('Belum Dibayar', const Color(0xFFF79009));
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        const SizedBox(height: 100),
        const Icon(Icons.error_outline, size: 48, color: Colors.grey),
        const SizedBox(height: 12),
        Center(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 24), child: Text(message, textAlign: TextAlign.center))),
        const SizedBox(height: 16),
        Center(child: OutlinedButton(onPressed: onRetry, child: const Text('Coba Lagi'))),
      ],
    );
  }
}
