import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../models/invoice.dart';
import 'invoice_provider.dart';

Future<void> showInvoiceDetailSheet(BuildContext context, Invoice invoice) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (_) => _InvoiceDetailSheet(invoice: invoice),
  );
}

class _InvoiceDetailSheet extends StatefulWidget {
  const _InvoiceDetailSheet({required this.invoice});
  final Invoice invoice;

  @override
  State<_InvoiceDetailSheet> createState() => _InvoiceDetailSheetState();
}

class _InvoiceDetailSheetState extends State<_InvoiceDetailSheet> {
  bool _payingNow = false;
  String? _error;

  Future<void> _pay() async {
    setState(() {
      _payingNow = true;
      _error = null;
    });
    try {
      final link = await context.read<InvoiceProvider>().requestPaymentLink(widget.invoice.id);
      final uri = Uri.tryParse(link);
      if (uri == null || !await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        throw ApiException('Tidak dapat membuka halaman pembayaran.');
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Gagal memproses pembayaran. Coba lagi.');
    } finally {
      if (mounted) setState(() => _payingNow = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final invoice = widget.invoice;
    final scheme = Theme.of(context).colorScheme;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(color: scheme.outlineVariant, borderRadius: BorderRadius.circular(999)),
              ),
            ),
            const SizedBox(height: 20),
            Text(invoice.invoiceNumber, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text(invoice.profileName ?? 'Tagihan Internet', style: TextStyle(color: scheme.onSurfaceVariant)),
            const SizedBox(height: 20),
            Text(formatCurrency(invoice.amount), style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 20),
            _row(context, 'Status', _statusLabel(invoice)),
            _row(context, 'Jatuh Tempo', formatDate(invoice.dueDate)),
            if (invoice.paidAt != null) _row(context, 'Dibayar', formatDateTime(invoice.paidAt!)),
            if (invoice.isPendingReview) _row(context, 'Info', 'Bukti transfer sedang diverifikasi admin'),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: scheme.error)),
            ],
            if (invoice.isPayable && !invoice.isPendingReview) ...[
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: _payingNow ? null : _pay,
                icon: _payingNow
                    ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.payment),
                label: Text(_payingNow ? 'Memproses...' : 'Bayar Sekarang'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _statusLabel(Invoice invoice) {
    if (invoice.isPaid) return 'Lunas';
    if (invoice.isPendingReview) return 'Menunggu Verifikasi';
    if (invoice.isOverdue) return 'Terlambat';
    return 'Belum Dibayar';
  }

  Widget _row(BuildContext context, String label, String value) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: scheme.onSurfaceVariant)),
          Flexible(child: Text(value, textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }
}
