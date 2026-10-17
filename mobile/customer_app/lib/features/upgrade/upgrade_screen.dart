import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../invoices/invoice_provider.dart';
import '../payment/payment_flow.dart';
import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/feature_colors.dart';
import '../../models/package_option.dart';
import '../auth/auth_provider.dart';
import 'upgrade_provider.dart';

class UpgradeScreen extends StatefulWidget {
  const UpgradeScreen({super.key});

  @override
  State<UpgradeScreen> createState() => _UpgradeScreenState();
}

class _UpgradeScreenState extends State<UpgradeScreen> {
  String? _selectedPackageId;
  String? _selectedGateway;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<UpgradeProvider>().load();
    });
  }

  Future<void> _submit() async {
    if (_selectedPackageId == null) return;
    setState(() => _error = null);
    final provider = context.read<UpgradeProvider>();
    try {
      final invoices = context.read<InvoiceProvider>();
      if (_selectedGateway != null) {
        final url = await provider.upgradeWithGateway(packageId: _selectedPackageId!, gateway: _selectedGateway!);
        if (url != null && mounted) await openPaymentUrl(context, url, title: 'Ganti Paket');
      } else {
        // The server creates the upgrade invoice; pay it like any invoice.
        final link = await provider.upgradeManual(packageId: _selectedPackageId!);
        await invoices.load(force: true);
        final matches = invoices.invoices.where((i) => link != null && i.paymentLink == link);
        final invoice = matches.isEmpty ? null : matches.first;
        if (invoice != null && mounted) {
          await payInvoice(context, invoiceId: invoice.id, amount: invoice.amount, invoiceNumber: invoice.invoiceNumber);
        }
      }
      if (mounted) {
        await invoices.load(force: true);
        if (mounted) Navigator.pop(context);
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Gagal memproses permintaan');
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<UpgradeProvider>();
    final customer = context.watch<AuthProvider>().customer;
    final currentPrice = customer?.profile?.price ?? 0;
    final availablePackages = provider.packages.where((p) => p.price >= currentPrice).toList();

    return Scaffold(
      appBar: featureAppBar(title: 'Upgrade Paket', icon: Icons.trending_up_rounded, accent: FeatureColors.upgrade),
      body: provider.loading
          ? const Center(child: CircularProgressIndicator())
          : provider.error != null
              ? Center(child: Text(provider.error!))
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                  children: [
                    Text('Pilih Paket Baru', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    ...availablePackages.map((pkg) => _PackageTile(
                          package: pkg,
                          isCurrent: customer?.profile?.name == pkg.name,
                          selected: _selectedPackageId == pkg.id,
                          onTap: () => setState(() => _selectedPackageId = pkg.id),
                        )),
                    if (_selectedPackageId != null && provider.gateways.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      Text('Metode Pembayaran', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      ...provider.gateways.map((gw) => RadioListTile<String>(
                            value: gw.provider,
                            groupValue: _selectedGateway,
                            title: Text(gw.name),
                            onChanged: (value) => setState(() => _selectedGateway = value),
                          )),
                    ],
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                    ],
                    if (_selectedPackageId != null) ...[
                      const SizedBox(height: 20),
                      FilledButton(
                        onPressed: provider.submitting ? null : _submit,
                        child: provider.submitting
                            ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                            : Text(provider.gateways.isEmpty ? 'Buat Invoice' : 'Bayar Sekarang'),
                      ),
                    ],
                  ],
                ),
    );
  }
}

class _PackageTile extends StatelessWidget {
  const _PackageTile({required this.package, required this.isCurrent, required this.selected, required this.onTap});
  final PackageOption package;
  final bool isCurrent;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // Selection shows as a brand outline rather than a tinted fill, which
    // turned the whole row saturated blue under a vivid brand color.
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Card(
        shape: selected
            ? RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: BorderSide(color: scheme.primary, width: 2),
              )
            : null,
        child: ListTile(
        enabled: !isCurrent,
        onTap: onTap,
        title: Text(package.name, style: const TextStyle(fontWeight: FontWeight.bold)),
        subtitle: Text('${package.downloadSpeed}/${package.uploadSpeed} Mbps · ${formatCurrency(package.price)}/bulan'),
        trailing: isCurrent
            ? const Chip(label: Text('Paket Aktif'), visualDensity: VisualDensity.compact)
            : selected
                ? Icon(Icons.check_circle, color: scheme.primary)
                : null,
        ),
      ),
    );
  }
}
