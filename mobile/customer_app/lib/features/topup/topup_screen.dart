import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/feature_colors.dart';
import '../../core/widgets/state_views.dart';
import 'topup_provider.dart';

class TopupScreen extends StatelessWidget {
  const TopupScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: featureAppBar(
          title: 'Top Up Saldo',
          icon: Icons.account_balance_wallet_rounded,
          accent: FeatureColors.topup,
          bottom: const TabBar(tabs: [Tab(text: 'Otomatis'), Tab(text: 'Transfer Manual')]),
        ),
        body: const TabBarView(children: [_DirectTopupTab(), _ManualTopupTab()]),
      ),
    );
  }
}

class _DirectTopupTab extends StatefulWidget {
  const _DirectTopupTab();

  @override
  State<_DirectTopupTab> createState() => _DirectTopupTabState();
}

class _DirectTopupTabState extends State<_DirectTopupTab> {
  final _amountController = TextEditingController();
  String? _selectedGateway;
  String? _error;

  static const _quickAmounts = [25000, 50000, 100000, 200000];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<TopupProvider>().loadGateways();
    });
  }

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final amount = int.tryParse(_amountController.text.replaceAll(RegExp(r'[^0-9]'), ''));
    if (amount == null || amount < 10000) {
      setState(() => _error = 'Minimal top-up Rp 10.000');
      return;
    }
    if (_selectedGateway == null) {
      setState(() => _error = 'Pilih metode pembayaran');
      return;
    }
    setState(() => _error = null);
    try {
      final url = await context.read<TopupProvider>().topupDirect(amount: amount, gateway: _selectedGateway!);
      final uri = Uri.tryParse(url);
      if (uri != null) await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (mounted) Navigator.pop(context);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Gagal memproses top up');
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<TopupProvider>();
    final scheme = Theme.of(context).colorScheme;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(
          controller: _amountController,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Jumlah Top Up', prefixText: 'Rp '),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          children: _quickAmounts
              .map((amount) => ActionChip(
                    label: Text('Rp ${amount ~/ 1000}rb'),
                    onPressed: () => setState(() => _amountController.text = amount.toString()),
                  ))
              .toList(),
        ),
        const SizedBox(height: 22),
        Text('Metode Pembayaran', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        if (provider.loadingGateways)
          const Padding(padding: EdgeInsets.all(20), child: AppLoadingState(label: 'Memuat metode pembayaran...')),
        if (provider.gateways.isNotEmpty)
          Card(
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                for (var i = 0; i < provider.gateways.length; i++) ...[
                  RadioListTile<String>(
                    value: provider.gateways[i].provider,
                    groupValue: _selectedGateway,
                    title: Text(provider.gateways[i].name),
                    onChanged: (value) => setState(() => _selectedGateway = value),
                  ),
                  if (i != provider.gateways.length - 1)
                    Divider(height: 1, color: scheme.outlineVariant.withValues(alpha: 0.5)),
                ],
              ],
            ),
          ),
        if (!provider.loadingGateways && provider.gateways.isEmpty)
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: scheme.surfaceContainerHigh,
              borderRadius: BorderRadius.circular(AppRadius.control),
            ),
            child: Row(
              children: [
                Icon(Icons.info_outline_rounded, size: 18, color: scheme.onSurfaceVariant),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Belum ada pembayaran otomatis. Gunakan tab Transfer Manual.',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                ),
              ],
            ),
          ),
        if (_error != null) ...[
          const SizedBox(height: 14),
          _ErrorNotice(message: _error!),
        ],
        const SizedBox(height: 20),
        FilledButton(
          onPressed: provider.submitting ? null : _submit,
          child: provider.submitting
              ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Bayar Sekarang'),
        ),
      ],
    );
  }
}

/// Failure messages get an icon and a container rather than bare red text:
/// colour alone is not a signal for anyone who cannot separate red from the
/// body text around it.
class _ErrorNotice extends StatelessWidget {
  const _ErrorNotice({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: scheme.errorContainer,
        borderRadius: BorderRadius.circular(AppRadius.control),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline_rounded, size: 18, color: scheme.onErrorContainer),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onErrorContainer),
            ),
          ),
        ],
      ),
    );
  }
}

class _ManualTopupTab extends StatefulWidget {
  const _ManualTopupTab();

  @override
  State<_ManualTopupTab> createState() => _ManualTopupTabState();
}

class _ManualTopupTabState extends State<_ManualTopupTab> {
  final _amountController = TextEditingController();
  final _noteController = TextEditingController();
  final _methodController = TextEditingController(text: 'Transfer Bank');
  File? _proof;
  String? _error;

  @override
  void dispose() {
    _amountController.dispose();
    _noteController.dispose();
    _methodController.dispose();
    super.dispose();
  }

  Future<void> _pickImage() async {
    final picked = await showModalBottomSheet<XFile?>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: const Text('Ambil Foto'),
              onTap: () async {
                final file = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 80);
                if (sheetContext.mounted) Navigator.pop(sheetContext, file);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Pilih dari Galeri'),
              onTap: () async {
                final file = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 80);
                if (sheetContext.mounted) Navigator.pop(sheetContext, file);
              },
            ),
          ],
        ),
      ),
    );
    if (picked != null) setState(() => _proof = File(picked.path));
  }

  Future<void> _submit() async {
    final amount = int.tryParse(_amountController.text.replaceAll(RegExp(r'[^0-9]'), ''));
    if (amount == null || amount < 10000) {
      setState(() => _error = 'Minimal top-up Rp 10.000');
      return;
    }
    setState(() => _error = null);
    try {
      await context.read<TopupProvider>().topupManual(
            amount: amount,
            paymentMethod: _methodController.text.trim(),
            note: _noteController.text.trim(),
            proof: _proof,
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Permintaan top up terkirim, menunggu verifikasi admin')));
        Navigator.pop(context);
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Gagal mengirim permintaan');
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<TopupProvider>();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(
          controller: _amountController,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Jumlah Top Up', prefixText: 'Rp '),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _methodController,
          decoration: const InputDecoration(labelText: 'Metode Pembayaran', hintText: 'mis. Transfer BCA'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _noteController,
          decoration: const InputDecoration(labelText: 'Catatan (opsional)'),
          maxLines: 2,
        ),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: _pickImage,
          icon: const Icon(Icons.attach_file),
          label: Text(_proof == null ? 'Lampirkan Bukti Transfer' : 'Bukti terlampir ✓'),
        ),
        if (_proof != null) ...[
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.control),
            child: Image.file(_proof!, height: 160, width: double.infinity, fit: BoxFit.cover),
          ),
        ],
        if (_error != null) ...[
          const SizedBox(height: 14),
          _ErrorNotice(message: _error!),
        ],
        const SizedBox(height: 20),
        FilledButton(
          onPressed: provider.submitting ? null : _submit,
          child: provider.submitting
              ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Kirim Permintaan'),
        ),
      ],
    );
  }
}
