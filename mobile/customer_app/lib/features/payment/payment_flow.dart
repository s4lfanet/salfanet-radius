import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/feature_colors.dart';
import '../../models/package_option.dart';
import '../invoices/invoice_provider.dart';
import 'manual_transfer_screen.dart';
import 'payment_webview_screen.dart';
import 'qris_pay_screen.dart';

/// Opens a payment URL the server returned without leaving the app: a QRIS
/// Mandiri link (/pay/qris/{orderId}) as the native QR screen, anything
/// else (a gateway checkout) in the in-app payment view.
/// Returns true when the customer came back from the payment step.
Future<bool> openPaymentUrl(BuildContext context, String url, {String title = 'Pembayaran'}) async {
  final uri = Uri.tryParse(url);
  if (uri == null || url.isEmpty) throw ApiException('Tautan pembayaran tidak tersedia.');
  final segs = uri.pathSegments;
  final qris = segs.length >= 3 && segs[segs.length - 3] == 'pay' && segs[segs.length - 2] == 'qris';
  final absolute = uri.hasScheme ? url : '${ApiClient.instance.baseUrl.replaceFirst(RegExp(r'/+$'), '')}$url';
  final done = await Navigator.of(context).push<bool>(
    MaterialPageRoute(
      builder: (_) => qris ? QrisPayScreen(orderId: segs.last) : PaymentWebViewScreen(url: absolute, title: title),
    ),
  );
  return done ?? false;
}

/// Pays one invoice from inside the app: choose QRIS, a payment gateway
/// (with its channel when the gateway offers several) or a manual bank
/// transfer. Returns true once something was paid or submitted, so the
/// caller can reload the invoice.
Future<bool> payInvoice(BuildContext context, {required String invoiceId, required num amount, String? invoiceNumber}) async {
  final done = await Navigator.of(context).push<bool>(
    MaterialPageRoute(builder: (_) => InvoicePaymentScreen(invoiceId: invoiceId, amount: amount, invoiceNumber: invoiceNumber)),
  );
  return done ?? false;
}

class InvoicePaymentScreen extends StatefulWidget {
  const InvoicePaymentScreen({super.key, required this.invoiceId, required this.amount, this.invoiceNumber});
  final String invoiceId;
  final num amount;
  final String? invoiceNumber;

  @override
  State<InvoicePaymentScreen> createState() => _InvoicePaymentScreenState();
}

class _InvoicePaymentScreenState extends State<InvoicePaymentScreen> {
  List<PaymentGatewayOption> _gateways = [];
  bool _loading = true;
  String? _error;
  String? _busy;

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
      final res = await ApiClient.instance.get('/api/public/payment-gateways');
      final list = (res['gateways'] as List? ?? const []).map((e) => PaymentGatewayOption.fromJson(e as Map<String, dynamic>)).toList();
      // QRIS first: no admin fee and confirmed automatically.
      list.sort((a, b) => (a.provider == 'qris_own' ? 0 : 1).compareTo(b.provider == 'qris_own' ? 0 : 1));
      setState(() => _gateways = list);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Metode pembayaran gagal dimuat.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// The invoice's payment token proves the request is for this customer's
  /// own invoice.
  Future<String> _paymentToken() => context.read<InvoiceProvider>().requestPaymentToken(widget.invoiceId);

  Future<void> _pay(PaymentGatewayOption gw) async {
    setState(() => _busy = gw.provider);
    try {
      String? channel;
      // Only Duitku and Tripay take the channel up front; Midtrans and
      // Xendit let the customer choose on their own checkout page.
      if (gw.provider == 'duitku' || gw.provider == 'tripay') {
        List<PaymentChannel> channels = const [];
        try {
          final res = await ApiClient.instance.get('/api/customer/payment-methods', query: {'gateway': gw.provider, 'amount': widget.amount.round()});
          channels = (res['methods'] as List? ?? const []).map((e) => PaymentChannel.fromJson(e as Map<String, dynamic>)).toList();
        } catch (_) {
          // No list: the gateway's own page still offers its channels.
        }
        if (channels.isNotEmpty) {
          if (!mounted) return;
          channel = await _pickChannel(gw, channels);
          if (channel == null) return;
        }
      }
      final token = await _paymentToken();
      final res = await ApiClient.instance.post('/api/payment/create', data: {
        'invoiceId': widget.invoiceId,
        'gateway': gw.provider,
        'paymentToken': token,
        if (channel != null) 'paymentMethod': channel,
      });
      final url = (res['paymentUrl'] ?? '').toString();
      if (!mounted) return;
      if (url.isEmpty) throw ApiException(res['error']?.toString() ?? 'Gateway tidak memberi halaman pembayaran.');
      final done = await openPaymentUrl(context, url, title: gw.name);
      if (done && mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Pembayaran gagal diproses. Coba lagi.')));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<String?> _pickChannel(PaymentGatewayOption gw, List<PaymentChannel> channels) {
    return showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.7),
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            children: [
              Text('Pilih cara bayar ${gw.name}', style: Theme.of(ctx).textTheme.titleMedium),
              const SizedBox(height: 8),
              for (final c in channels)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(c.name),
                  subtitle: c.totalFee != null && c.totalFee! > 0 ? Text('Biaya admin ${formatCurrency(c.totalFee!)}') : null,
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => Navigator.pop(ctx, c.code),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _manual() async {
    final done = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => ManualTransferScreen(invoiceId: widget.invoiceId, amount: widget.amount)),
    );
    if ((done ?? false) && mounted) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: featureAppBar(title: 'Pilih Pembayaran', icon: Icons.payments_rounded, accent: FeatureColors.invoice),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Total tagihan', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                          const SizedBox(height: 2),
                          Text(formatCurrency(widget.amount), style: Theme.of(context).textTheme.headlineSmall),
                          if (widget.invoiceNumber != null)
                            Text(widget.invoiceNumber!, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  if (_error != null) ...[
                    Text(_error!, style: TextStyle(color: scheme.error)),
                    const SizedBox(height: 12),
                  ],
                  if (_gateways.isNotEmpty) ...[
                    Text('Bayar online', style: Theme.of(context).textTheme.titleSmall),
                    const SizedBox(height: 8),
                    for (final gw in _gateways)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: _MethodTile(
                          icon: gw.provider == 'qris_own' ? Icons.qr_code_2_rounded : Icons.account_balance_wallet_rounded,
                          title: gw.provider == 'qris_own' ? 'QRIS' : gw.name,
                          subtitle: gw.provider == 'qris_own'
                              ? 'DANA, GoPay, OVO, ShopeePay, m-banking. Lunas otomatis.'
                              : 'Virtual account, e-wallet atau gerai, sesuai pilihan di ${gw.name}.',
                          busy: _busy == gw.provider,
                          enabled: _busy == null,
                          onTap: () => _pay(gw),
                        ),
                      ),
                    const SizedBox(height: 12),
                  ],
                  Text('Bayar manual', style: Theme.of(context).textTheme.titleSmall),
                  const SizedBox(height: 8),
                  _MethodTile(
                    icon: Icons.account_balance_rounded,
                    title: 'Transfer bank',
                    subtitle: 'Transfer ke rekening operator, lalu kirim bukti. Dicek oleh admin.',
                    busy: false,
                    enabled: _busy == null,
                    onTap: _manual,
                  ),
                ],
              ),
            ),
    );
  }
}

class _MethodTile extends StatelessWidget {
  const _MethodTile({required this.icon, required this.title, required this.subtitle, required this.busy, required this.enabled, required this.onTap});
  final IconData icon;
  final String title;
  final String subtitle;
  final bool busy;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: enabled ? onTap : null,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              FeatureIconTile(icon: icon, accent: FeatureColors.invoice, size: 42, radius: AppRadius.control),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: Theme.of(context).textTheme.titleSmall),
                    const SizedBox(height: 2),
                    Text(subtitle, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              busy
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.chevron_right_rounded),
            ],
          ),
        ),
      ),
    );
  }
}
