import 'dart:io';

import 'package:dio/dio.dart' as dio;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/company/company_provider.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/feature_colors.dart';

/// Manual bank transfer for one invoice: the operator's accounts to send to,
/// then the sender's details and a photo of the receipt. An admin checks it
/// and marks the invoice paid. Pops with true once submitted.
class ManualTransferScreen extends StatefulWidget {
  const ManualTransferScreen({super.key, required this.invoiceId, required this.amount});
  final String invoiceId;
  final num amount;

  @override
  State<ManualTransferScreen> createState() => _ManualTransferScreenState();
}

class _ManualTransferScreenState extends State<ManualTransferScreen> {
  final _form = GlobalKey<FormState>();
  final _bank = TextEditingController();
  final _sender = TextEditingController();
  final _notes = TextEditingController();
  File? _proof;
  bool _sending = false;

  @override
  void dispose() {
    _bank.dispose();
    _sender.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _pick(ImageSource source) async {
    final file = await ImagePicker().pickImage(source: source, imageQuality: 80, maxWidth: 1600);
    if (file != null) setState(() => _proof = File(file.path));
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _sending = true);
    try {
      final data = dio.FormData.fromMap({
        'bankName': _bank.text.trim(),
        'accountName': _sender.text.trim(),
        if (_notes.text.trim().isNotEmpty) 'notes': _notes.text.trim(),
        if (_proof != null) 'file': await dio.MultipartFile.fromFile(_proof!.path, filename: _proof!.path.split(Platform.pathSeparator).last),
      });
      final res = await ApiClient.instance.postForm('/api/customer/invoices/${widget.invoiceId}/manual-payment', data);
      if (res['success'] != true) throw ApiException(res['error']?.toString() ?? 'Bukti transfer gagal dikirim.');
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Bukti terkirim'),
          content: const Text('Admin akan memeriksa transfer Anda. Status tagihan berubah menjadi lunas setelah disetujui.'),
          actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK'))],
        ),
      );
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Bukti transfer gagal dikirim. Coba lagi.')));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final accounts = context.watch<CompanyProvider>().info?.bankAccounts ?? const [];

    return Scaffold(
      appBar: featureAppBar(title: 'Transfer Bank', icon: Icons.account_balance_rounded, accent: FeatureColors.invoice),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            Text('Transfer tepat ${formatCurrency(widget.amount)} ke salah satu rekening:', style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 10),
            if (accounts.isEmpty)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text('Operator belum mencantumkan rekening. Hubungi admin untuk nomor rekening tujuan.',
                      style: TextStyle(color: scheme.onSurfaceVariant)),
                ),
              )
            else
              for (final a in accounts)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Card(
                    child: ListTile(
                      title: Text('${a.bankName} · ${a.accountNumber}', style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text('a.n. ${a.accountName}'),
                      trailing: IconButton(
                        tooltip: 'Salin nomor rekening',
                        icon: const Icon(Icons.copy_rounded),
                        onPressed: () {
                          Clipboard.setData(ClipboardData(text: a.accountNumber));
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Nomor rekening disalin')));
                        },
                      ),
                    ),
                  ),
                ),
            const SizedBox(height: 16),
            Text('Setelah transfer, isi data pengirim', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 10),
            TextFormField(
              controller: _bank,
              decoration: const InputDecoration(labelText: 'Bank / e-wallet pengirim', hintText: 'BCA, BRI, DANA...'),
              textInputAction: TextInputAction.next,
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Wajib diisi' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _sender,
              decoration: const InputDecoration(labelText: 'Nama pemilik rekening pengirim'),
              textInputAction: TextInputAction.next,
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Wajib diisi' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(controller: _notes, decoration: const InputDecoration(labelText: 'Catatan (opsional)'), maxLines: 2),
            const SizedBox(height: 16),
            Text('Foto bukti transfer', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            if (_proof != null)
              ClipRRect(
                borderRadius: BorderRadius.circular(AppRadius.control),
                child: Image.file(_proof!, height: 200, width: double.infinity, fit: BoxFit.cover),
              ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(onPressed: () => _pick(ImageSource.camera), icon: const Icon(Icons.photo_camera_rounded), label: const Text('Kamera')),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(onPressed: () => _pick(ImageSource.gallery), icon: const Icon(Icons.photo_library_rounded), label: const Text('Galeri')),
                ),
              ],
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _sending ? null : _submit,
              child: _sending
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Kirim Bukti Transfer'),
            ),
          ],
        ),
      ),
    );
  }
}
