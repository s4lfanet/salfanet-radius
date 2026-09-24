import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/feature_colors.dart';
import '../auth/auth_provider.dart';
import 'renewal_provider.dart';

class RenewalScreen extends StatefulWidget {
  const RenewalScreen({super.key});

  @override
  State<RenewalScreen> createState() => _RenewalScreenState();
}

class _RenewalScreenState extends State<RenewalScreen> {
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<RenewalProvider>().checkStatus();
    });
  }

  Future<void> _renew() async {
    setState(() => _error = null);
    try {
      final link = await context.read<RenewalProvider>().renew();
      if (link != null) {
        final uri = Uri.tryParse(link);
        if (uri != null) await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Invoice perpanjangan dibuat')));
        Navigator.pop(context);
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Gagal memproses perpanjangan');
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<RenewalProvider>();
    final customer = context.watch<AuthProvider>().customer;
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: featureAppBar(title: 'Perpanjang Langganan', icon: Icons.event_repeat_rounded, accent: FeatureColors.renewal),
      body: provider.loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Paket Saat Ini', style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12)),
                        const SizedBox(height: 4),
                        Text(customer?.profile?.name ?? '-', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                        const SizedBox(height: 8),
                        if (customer?.profile?.price != null) Text(formatCurrency(customer!.profile!.price!)),
                        const SizedBox(height: 8),
                        Text(
                          'Aktif hingga ${customer?.expiredAt != null ? formatDate(customer!.expiredAt!) : '-'}',
                          style: TextStyle(color: scheme.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                if (!provider.canRenew && provider.blockingInvoice != null) ...[
                  Card(
                    color: scheme.errorContainer.withValues(alpha: 0.4),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Anda memiliki tagihan yang belum dibayar', style: TextStyle(color: scheme.onErrorContainer, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 4),
                          Text(
                            '${provider.blockingInvoice!['invoiceNumber']} · ${formatCurrency((provider.blockingInvoice!['amount'] as num?)?.toDouble() ?? 0)}',
                            style: TextStyle(color: scheme.onErrorContainer),
                          ),
                        ],
                      ),
                    ),
                  ),
                ] else if (!provider.canRenew) ...[
                  Text(provider.blockedReason ?? 'Perpanjangan belum tersedia', style: TextStyle(color: scheme.onSurfaceVariant)),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: TextStyle(color: scheme.error)),
                ],
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: (provider.canRenew && !provider.submitting) ? _renew : null,
                  child: provider.submitting
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Perpanjang Sekarang'),
                ),
              ],
            ),
    );
  }
}
