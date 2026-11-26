import 'dart:io';

import 'package:dio/dio.dart' as dio;
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/filter_grid.dart';
import '../auth/auth_provider.dart';

/// Isi saldo agen: bayar lewat payment gateway (QRIS/VA/e-wallet) atau transfer
/// manual ke rekening admin dengan bukti transfer — sama dengan portal web agen.
class DepositScreen extends StatefulWidget {
  const DepositScreen({super.key, required this.gateways});

  /// `paymentGateways` dari /api/agent/dashboard: [{provider, name}].
  final List<Map<String, dynamic>> gateways;

  @override
  State<DepositScreen> createState() => _DepositScreenState();
}

class _DepositScreenState extends State<DepositScreen> {
  static const _quick = [50000, 100000, 200000, 500000];

  String _mode = 'gateway';
  final _amount = TextEditingController();
  String? _gateway;
  String? _method;
  List<Map<String, dynamic>> _methods = [];
  bool _loadingMethods = false;
  String? _methodsError;

  List<Map<String, dynamic>> _banks = [];
  String? _bankKey;
  final _senderName = TextEditingController();
  final _senderNumber = TextEditingController();
  final _note = TextEditingController();
  File? _proof;

  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.gateways.isNotEmpty) _gateway = str(widget.gateways.first, 'provider');
    _loadBanks();
  }

  @override
  void dispose() {
    _amount.dispose();
    _senderName.dispose();
    _senderNumber.dispose();
    _note.dispose();
    super.dispose();
  }

  int get _value => int.tryParse(_amount.text.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;

  Future<void> _loadBanks() async {
    try {
      final res = await ApiClient.instance.get('/api/company/info');
      final list = (res is Map && res['data'] is Map ? (res['data'] as Map)['bankAccounts'] : null) as List?;
      if (!mounted) return;
      setState(() {
        _banks = list?.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() ?? [];
        if (_banks.isNotEmpty) _bankKey = _keyOf(_banks.first);
      });
    } on ApiException catch (_) {}
  }

  String _keyOf(Map<String, dynamic> b) => '${str(b, 'bankName')}|${str(b, 'accountNumber')}|${str(b, 'accountName')}';

  Future<void> _loadMethods() async {
    final g = _gateway;
    if (g == null || _value < 10000 || g == 'qris_own' || g == 'midtrans' || g == 'xendit') {
      setState(() {
        _methods = [];
        _method = null;
        _methodsError = null;
      });
      return;
    }
    setState(() {
      _loadingMethods = true;
      _methodsError = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/agent/deposit/payment-methods', query: {'gateway': g, 'amount': _value});
      final list = (res is Map ? res['methods'] : null) as List?;
      if (!mounted) return;
      setState(() {
        _methods = list?.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() ?? [];
        _method = _methods.isNotEmpty ? str(_methods.first, 'code') : null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _methodsError = e.message);
    } finally {
      if (mounted) setState(() => _loadingMethods = false);
    }
  }

  Future<void> _pickProof(ImageSource source) async {
    try {
      final x = await ImagePicker().pickImage(source: source, imageQuality: 80);
      if (x != null) setState(() => _proof = File(x.path));
    } catch (_) {
      if (mounted) showToast(context, 'Tidak bisa membuka ${source == ImageSource.camera ? 'kamera' : 'galeri'}.');
    }
  }

  Future<void> _submitGateway() async {
    if (_value < 10000) return setState(() => _error = 'Minimal deposit Rp 10.000.');
    if (_gateway == null) return setState(() => _error = 'Pilih metode pembayaran.');
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final agentId = context.read<AuthProvider>().user?.id ?? '';
      final res = await ApiClient.instance.post('/api/agent/deposit/create', data: {
        'agentId': agentId,
        'amount': _value,
        'gateway': _gateway,
        if (_method != null) 'paymentMethod': _method,
      });
      final url = (res is Map && res['deposit'] is Map) ? (res['deposit'] as Map)['paymentUrl']?.toString() : null;
      if (url == null || url.isEmpty) throw ApiException('Link pembayaran tidak diterima. Coba lagi.');
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      if (!mounted) return;
      showToast(context, 'Selesaikan pembayaran di browser. Saldo bertambah otomatis setelah lunas.');
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submitManual() async {
    if (_value < 10000) return setState(() => _error = 'Minimal deposit Rp 10.000.');
    if (_bankKey == null) return setState(() => _error = 'Rekening admin belum tersedia. Hubungi admin.');
    if (_senderName.text.trim().isEmpty) return setState(() => _error = 'Isi nama pemilik rekening pengirim.');
    if (_proof == null) return setState(() => _error = 'Unggah bukti transfer.');
    if (await _proof!.length() > 5 * 1024 * 1024) return setState(() => _error = 'Ukuran bukti transfer maksimal 5 MB.');
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final form = dio.FormData.fromMap({
        'file': await dio.MultipartFile.fromFile(_proof!.path, filename: _proof!.path.split(Platform.pathSeparator).last),
      });
      final up = await ApiClient.instance.postForm('/api/upload/payment-proof', form);
      final url = up is Map ? up['url']?.toString() : null;
      if (url == null || url.isEmpty) throw ApiException(up is Map ? (up['error']?.toString() ?? 'Gagal mengunggah bukti.') : 'Gagal mengunggah bukti.');
      final bank = _banks.firstWhere((b) => _keyOf(b) == _bankKey);
      await ApiClient.instance.post('/api/agent/deposit/manual-request', data: {
        'amount': _value,
        'targetBankName': str(bank, 'bankName'),
        'targetBankAccountNumber': str(bank, 'accountNumber'),
        'targetBankAccountName': str(bank, 'accountName'),
        'senderAccountName': _senderName.text.trim(),
        if (_senderNumber.text.trim().isNotEmpty) 'senderAccountNumber': _senderNumber.text.trim(),
        'receiptImage': url,
        if (_note.text.trim().isNotEmpty) 'note': _note.text.trim(),
      });
      if (!mounted) return;
      showToast(context, 'Permintaan dikirim. Saldo bertambah setelah admin menyetujui.');
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _label(String t) => Padding(padding: const EdgeInsets.only(top: Gap.lg, bottom: Gap.xs), child: Text(t, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)));

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final manual = _mode == 'manual';
    return Scaffold(
      appBar: AppBar(title: const Text('Isi Saldo')),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, Gap.sm),
          child: FilledButton(
            onPressed: _busy ? null : (manual ? _submitManual : _submitGateway),
            child: _busy
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : Text(manual ? 'Kirim permintaan' : (_value >= 10000 ? 'Bayar ${formatCurrency(_value)}' : 'Bayar')),
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Gap.page, Gap.md, Gap.page, Gap.xl),
        children: [
          FilterGrid(
            padding: EdgeInsets.zero,
            columns: 2,
            options: const [('gateway', 'Bayar online'), ('manual', 'Transfer manual')],
            selected: _mode,
            onSelected: (v) => setState(() {
              _mode = v;
              _error = null;
            }),
          ),
          _label('Jumlah deposit'),
          TextField(
            controller: _amount,
            keyboardType: TextInputType.number,
            onChanged: (_) {
              setState(() {});
              if (!manual) _loadMethods();
            },
            decoration: const InputDecoration(prefixText: 'Rp ', hintText: 'Minimal 10.000'),
          ),
          const SizedBox(height: Gap.sm),
          Wrap(
            spacing: Gap.sm,
            runSpacing: Gap.sm,
            children: [
              for (final q in _quick)
                ActionChip(
                  label: Text(formatCurrency(q)),
                  onPressed: () {
                    _amount.text = '$q';
                    setState(() {});
                    if (!manual) _loadMethods();
                  },
                ),
            ],
          ),
          if (!manual) ...[
            _label('Metode pembayaran'),
            if (widget.gateways.isEmpty)
              Text('Belum ada payment gateway aktif. Gunakan transfer manual atau hubungi admin.', style: TextStyle(color: context.tone(Tone.danger)))
            else
              DropdownButtonFormField<String>(
                value: _gateway,
                isExpanded: true,
                decoration: const InputDecoration(),
                items: [for (final g in widget.gateways) DropdownMenuItem(value: str(g, 'provider'), child: Text(str(g, 'name') ?? str(g, 'provider') ?? '-'))],
                onChanged: (v) {
                  setState(() => _gateway = v);
                  _loadMethods();
                },
              ),
            if (_loadingMethods) const Padding(padding: EdgeInsets.only(top: Gap.md), child: LinearProgressIndicator()),
            if (_methodsError != null) Padding(padding: const EdgeInsets.only(top: Gap.sm), child: Text(_methodsError!, style: TextStyle(color: context.tone(Tone.danger)))),
            if (_methods.length > 1) ...[
              _label('Pilih channel'),
              DropdownButtonFormField<String>(
                value: _method,
                isExpanded: true,
                decoration: const InputDecoration(),
                items: [
                  for (final m in _methods)
                    DropdownMenuItem(
                      value: str(m, 'code'),
                      child: Text('${str(m, 'name') ?? '-'}${numOf(m, 'totalFee') > 0 ? ' · biaya ${formatCurrency(numOf(m, 'totalFee'))}' : ''}', overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (v) => setState(() => _method = v),
              ),
            ],
          ] else ...[
            _label('Transfer ke rekening admin'),
            if (_banks.isEmpty)
              Text('Rekening admin belum diisi. Hubungi admin.', style: TextStyle(color: context.tone(Tone.danger)))
            else
              DropdownButtonFormField<String>(
                value: _bankKey,
                isExpanded: true,
                decoration: const InputDecoration(),
                items: [for (final b in _banks) DropdownMenuItem(value: _keyOf(b), child: Text('${str(b, 'bankName')} · ${str(b, 'accountNumber')} (a/n ${str(b, 'accountName')})', overflow: TextOverflow.ellipsis))],
                onChanged: (v) => setState(() => _bankKey = v),
              ),
            _label('Rekening pengirim'),
            TextField(controller: _senderName, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'Nama pemilik rekening')),
            const SizedBox(height: Gap.md),
            TextField(controller: _senderNumber, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Nomor rekening (opsional)')),
            const SizedBox(height: Gap.md),
            TextField(controller: _note, decoration: const InputDecoration(labelText: 'Catatan (opsional)')),
            _label('Bukti transfer'),
            if (_proof != null)
              Padding(
                padding: const EdgeInsets.only(bottom: Gap.sm),
                child: ClipRRect(borderRadius: BorderRadius.circular(8), child: Image.file(_proof!, height: 160, fit: BoxFit.cover)),
              ),
            Row(children: [
              Expanded(child: OutlinedButton.icon(onPressed: () => _pickProof(ImageSource.camera), icon: const Icon(Icons.photo_camera_outlined, size: 18), label: const Text('Kamera'))),
              const SizedBox(width: Gap.sm),
              Expanded(child: OutlinedButton.icon(onPressed: () => _pickProof(ImageSource.gallery), icon: const Icon(Icons.photo_library_outlined, size: 18), label: const Text('Galeri'))),
            ]),
            const SizedBox(height: Gap.sm),
            Text('Admin akan memeriksa bukti lalu menambah saldo Anda.', style: TextStyle(fontSize: 12.5, color: c.onSurfaceVariant)),
          ],
          if (_error != null) ...[
            const SizedBox(height: Gap.md),
            Text(_error!, style: TextStyle(color: context.tone(Tone.danger), fontWeight: FontWeight.w600)),
          ],
        ],
      ),
    );
  }
}
