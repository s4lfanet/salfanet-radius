import 'package:flutter/material.dart';
import 'package:printing/printing.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/feature_colors.dart';
import '../../models/invoice.dart';
import '../../models/invoice_detail.dart';
import 'invoice_pdf.dart';
import 'invoice_provider.dart';

class InvoiceDetailScreen extends StatefulWidget {
  const InvoiceDetailScreen({super.key, required this.invoice});
  final Invoice invoice;

  @override
  State<InvoiceDetailScreen> createState() => _InvoiceDetailScreenState();
}

class _InvoiceDetailScreenState extends State<InvoiceDetailScreen> {
  InvoiceDetailData? _detail;
  bool _loading = true;
  String? _error;
  bool _payingNow = false;
  String? _payError;

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
      final res = await ApiClient.instance.get('/api/invoices/${widget.invoice.id}/pdf');
      if (res['success'] == true && res['data'] is Map<String, dynamic>) {
        setState(() => _detail = InvoiceDetailData.fromJson(res['data']));
      } else {
        setState(() => _error = 'Detail tagihan tidak ditemukan');
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Gagal memuat detail tagihan');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pay() async {
    setState(() {
      _payingNow = true;
      _payError = null;
    });
    try {
      final link = await context.read<InvoiceProvider>().requestPaymentLink(widget.invoice.id);
      final uri = Uri.tryParse(link);
      if (uri == null || !await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        throw ApiException('Tidak dapat membuka halaman pembayaran.');
      }
    } on ApiException catch (e) {
      setState(() => _payError = e.message);
    } catch (_) {
      setState(() => _payError = 'Gagal memproses pembayaran.');
    } finally {
      if (mounted) setState(() => _payingNow = false);
    }
  }

  Future<void> _printOrSave() async {
    final detail = _detail;
    if (detail == null) return;
    await Printing.layoutPdf(onLayout: (_) => buildInvoicePdf(detail));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.invoice.invoiceNumber),
        actions: [
          if (_detail?.isPaid ?? false)
            IconButton(icon: const Icon(Icons.print_outlined), tooltip: 'Cetak / Unduh', onPressed: _printOrSave),
        ],
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!, textAlign: TextAlign.center)))
                : _buildDetail(_detail!),
      ),
    );
  }

  Widget _buildDetail(InvoiceDetailData inv) {
    final scheme = Theme.of(context).colorScheme;
    final brightness = Theme.of(context).brightness;
    final overdue = inv.status.toUpperCase() == 'OVERDUE';
    final statusColor = inv.isPaid
        ? StatusColors.success(brightness)
        : (overdue ? StatusColors.danger(brightness) : StatusColors.warning(brightness));

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        Center(
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: brightness == Brightness.dark ? 0.2 : 0.12),
                  borderRadius: BorderRadius.circular(AppRadius.pill),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      inv.isPaid
                          ? Icons.check_circle_rounded
                          : (overdue ? Icons.warning_amber_rounded : Icons.schedule_rounded),
                      size: 15,
                      color: statusColor,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      inv.isPaid ? 'Lunas' : (overdue ? 'Terlambat' : 'Belum dibayar'),
                      style: TextStyle(fontWeight: FontWeight.w700, color: statusColor, fontSize: 13),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Text(inv.amountFormatted, style: Theme.of(context).textTheme.headlineMedium),
              Text(inv.number, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
            ],
          ),
        ),
        const SizedBox(height: 24),
        _sectionCard(context, 'Dari', [
          _kv(inv.company.name, bold: true),
          if (inv.company.address?.isNotEmpty ?? false) _kv(inv.company.address!),
          if (inv.company.phone?.isNotEmpty ?? false) _kv('Telp: ${inv.company.phone}'),
        ]),
        const SizedBox(height: 12),
        _sectionCard(context, 'Kepada', [
          _kv(inv.customer.name, bold: true),
          if (inv.customer.customerId?.isNotEmpty ?? false) _labelRow(context, 'ID Pelanggan', inv.customer.customerId!),
          if (inv.customer.username?.isNotEmpty ?? false) _labelRow(context, 'Username', inv.customer.username!),
          if (inv.customer.area?.isNotEmpty ?? false) _labelRow(context, 'Area', inv.customer.area!),
        ]),
        const SizedBox(height: 12),
        _sectionCard(context, 'Detail Invoice', [
          _labelRow(context, 'No Invoice', inv.number),
          _labelRow(context, 'Tanggal', inv.date),
          _labelRow(context, 'Jatuh Tempo', inv.dueDate),
          if (inv.paidAt != null) _labelRow(context, 'Tanggal Bayar', inv.paidAt!),
          if (inv.paidVia != null) _labelRow(context, 'Metode', inv.paidVia == 'gateway' ? 'Payment Gateway' : 'Transfer Manual'),
        ]),
        const SizedBox(height: 20),
        Text('Rincian Layanan', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        _itemsTable(context, inv),
        if (!inv.isPaid && inv.company.bankAccounts.isNotEmpty) ...[
          const SizedBox(height: 20),
          Text('Pembayaran Manual', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          ...inv.company.bankAccounts.map((ba) => Card(
                child: ListTile(
                  leading: const Icon(Icons.account_balance_outlined),
                  title: Text(ba.bankName, style: const TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: Text('${ba.accountNumber}\na/n ${ba.accountName}'),
                  isThreeLine: true,
                ),
              )),
        ],
        if (_payError != null) ...[
          const SizedBox(height: 12),
          Text(_payError!, style: TextStyle(color: scheme.error)),
        ],
        const SizedBox(height: 24),
        if (!inv.isPaid)
          FilledButton.icon(
            onPressed: _payingNow ? null : _pay,
            icon: _payingNow
                ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.payment),
            label: Text(_payingNow ? 'Memproses...' : 'Bayar Sekarang'),
          )
        else
          FilledButton.icon(
            onPressed: _printOrSave,
            icon: const Icon(Icons.print_outlined),
            label: const Text('Cetak / Unduh PDF'),
          ),
      ],
    );
  }

  Widget _sectionCard(BuildContext context, String title, List<Widget> children) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title.toUpperCase(), style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant, letterSpacing: 0.6)),
            const SizedBox(height: 6),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _kv(String value, {bool bold = false}) =>
      Padding(padding: const EdgeInsets.only(top: 2), child: Text(value, style: TextStyle(fontWeight: bold ? FontWeight.bold : FontWeight.normal)));

  Widget _labelRow(BuildContext context, String label, String value) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: RichText(
        text: TextSpan(
          style: DefaultTextStyle.of(context).style,
          children: [
            TextSpan(text: '$label: ', style: TextStyle(color: scheme.onSurfaceVariant)),
            TextSpan(text: value, style: const TextStyle(fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }

  Widget _itemsTable(BuildContext context, InvoiceDetailData inv) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            for (final item in inv.items) _itemRow(item.description, item.quantity, item.total),
            for (final fee in inv.additionalFees) _itemRow(fee.name, 1, fee.amount),
            if (inv.tax.hasTax) ...[
              const Divider(),
              _totalRow('Subtotal', formatCurrency(inv.tax.baseAmount), scheme.onSurfaceVariant),
              _totalRow('PPN ${inv.tax.taxRate.toStringAsFixed(0)}%', formatCurrency(inv.tax.taxAmount),
                  scheme.onSurfaceVariant),
            ],
            const Divider(),
            _totalRow('TOTAL', inv.amountFormatted, scheme.onSurface, bold: true),
          ],
        ),
      ),
    );
  }

  Widget _itemRow(String description, int qty, double total) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(description)),
          if (qty != 1) Text('x$qty  ', style: const TextStyle(color: Colors.grey)),
          Text(formatCurrency(total), style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }

  Widget _totalRow(String label, String value, Color color, {bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: color, fontWeight: bold ? FontWeight.bold : FontWeight.normal, fontSize: bold ? 16 : 13)),
          Text(value, style: TextStyle(color: color, fontWeight: bold ? FontWeight.bold : FontWeight.w600, fontSize: bold ? 16 : 13)),
        ],
      ),
    );
  }
}
