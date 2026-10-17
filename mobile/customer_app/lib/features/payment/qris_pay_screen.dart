import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/feature_colors.dart';

/// QRIS Mandiri payment shown in the app: the QR, the exact amount to pay
/// and a live status. The server matches the payment by that exact amount
/// (base + a unique code), so the amount is the thing made impossible to miss.
///
/// Pops with true once the payment is confirmed.
class QrisPayScreen extends StatefulWidget {
  const QrisPayScreen({super.key, required this.orderId});
  final String orderId;

  @override
  State<QrisPayScreen> createState() => _QrisPayScreenState();
}

class _QrisPayScreenState extends State<QrisPayScreen> {
  Timer? _poll;
  Timer? _tick;
  String _status = 'loading';
  Uint8List? _qr;
  int? _amount;
  int? _base;
  DateTime? _expiresAt;
  String? _error;

  @override
  void initState() {
    super.initState();
    _check();
    _poll = Timer.periodic(const Duration(seconds: 4), (_) => _check());
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _check() async {
    try {
      final res = await ApiClient.instance.get('/api/payment/qris-status', query: {'orderId': widget.orderId});
      final status = res['status']?.toString() ?? 'pending';
      final image = res['qrImage']?.toString();
      if (!mounted) return;
      setState(() {
        _status = status;
        _error = null;
        _amount = (res['uniqueAmount'] as num?)?.toInt() ?? _amount;
        _base = (res['baseAmount'] as num?)?.toInt() ?? _base;
        _expiresAt = DateTime.tryParse(res['expiresAt']?.toString() ?? '')?.toLocal() ?? _expiresAt;
        if (image != null && image.startsWith('data:image') && _qr == null) {
          _qr = base64Decode(image.substring(image.indexOf(',') + 1));
        }
      });
      if (status == 'paid' || status == 'expired' || status == 'cancelled') _poll?.cancel();
    } on ApiException catch (e) {
      if (mounted && _status == 'loading') setState(() => _error = e.message);
    } catch (_) {
      // Keep polling through a dropped connection.
    }
  }

  String get _remaining {
    final end = _expiresAt;
    if (end == null) return '';
    final left = end.difference(DateTime.now());
    if (left.isNegative) return '00:00';
    final m = left.inMinutes.toString().padLeft(2, '0');
    final s = (left.inSeconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final paid = _status == 'paid';
    final over = _status == 'expired' || _status == 'cancelled' || (_expiresAt != null && _expiresAt!.isBefore(DateTime.now()) && !paid);

    return Scaffold(
      appBar: featureAppBar(title: 'Bayar dengan QRIS', icon: Icons.qr_code_2_rounded, accent: FeatureColors.invoice),
      body: _error != null
          ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!, textAlign: TextAlign.center)))
          : _status == 'loading'
              ? const Center(child: CircularProgressIndicator())
              : ListView(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
                  children: [
                    if (paid)
                      _Result(
                        icon: Icons.check_circle_rounded,
                        color: StatusColors.success(Theme.of(context).brightness),
                        title: 'Pembayaran diterima',
                        message: 'Terima kasih. Tagihan Anda sudah lunas.',
                        action: FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Selesai')),
                      )
                    else if (over)
                      _Result(
                        icon: Icons.timer_off_rounded,
                        color: scheme.onSurfaceVariant,
                        title: 'QR sudah kedaluwarsa',
                        message: 'Kalau Anda belum membayar, kembali lalu pilih QRIS lagi untuk mendapat QR baru.',
                        action: OutlinedButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Kembali')),
                      )
                    else ...[
                      Text('Bayar tepat', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
                      const SizedBox(height: 4),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Flexible(
                            child: Text(
                              formatCurrency(_amount ?? 0),
                              style: Theme.of(context).textTheme.headlineMedium,
                              textAlign: TextAlign.center,
                            ),
                          ),
                          IconButton(
                            tooltip: 'Salin nominal',
                            icon: const Icon(Icons.copy_rounded, size: 20),
                            onPressed: () {
                              Clipboard.setData(ClipboardData(text: '${_amount ?? ''}'));
                              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Nominal disalin')));
                            },
                          ),
                        ],
                      ),
                      if (_base != null && _amount != null && _amount != _base)
                        Text(
                          'Termasuk kode unik ${formatCurrency(_amount! - _base!)} agar pembayaran Anda dikenali otomatis. Jangan dibulatkan.',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                        ),
                      const SizedBox(height: 20),
                      Center(
                        child: Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            // QR codes need a white quiet zone to scan in dark mode too.
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(AppRadius.card),
                            border: Border.all(color: scheme.outlineVariant),
                          ),
                          child: _qr == null
                              ? const SizedBox(width: 240, height: 240, child: Center(child: CircularProgressIndicator()))
                              : Image.memory(_qr!, width: 240, height: 240, filterQuality: FilterQuality.none),
                        ),
                      ),
                      const SizedBox(height: 8),
                      // Paying from this same phone: hand the QR to DANA or
                      // m-banking (both scan from the gallery) without a screenshot.
                      Center(
                        child: TextButton.icon(
                          onPressed: _qr == null
                              ? null
                              : () => Share.shareXFiles(
                                    [XFile.fromData(_qr!, mimeType: 'image/png', name: 'qris-${widget.orderId}.png')],
                                    text: 'QRIS ${formatCurrency(_amount ?? 0)}',
                                  ),
                          icon: const Icon(Icons.ios_share_rounded),
                          label: const Text('Simpan / bagikan QR'),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
                          const SizedBox(width: 10),
                          Text('Menunggu pembayaran · $_remaining', style: Theme.of(context).textTheme.bodyMedium),
                        ],
                      ),
                      const SizedBox(height: 20),
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Cara bayar', style: Theme.of(context).textTheme.titleSmall),
                              const SizedBox(height: 8),
                              for (final (i, step) in const [
                                'Buka DANA, GoPay, OVO, ShopeePay atau m-banking yang mendukung QRIS.',
                                'Pindai QR di atas. Kalau membayar dari HP ini, tekan Simpan / bagikan QR, lalu pilih gambar QR dari galeri di aplikasi pembayaran.',
                                'Pastikan nominal sama persis, lalu bayar. Halaman ini berubah sendiri setelah pembayaran masuk.',
                              ].indexed)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 6),
                                  child: Row(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      SizedBox(width: 20, child: Text('${i + 1}.', style: Theme.of(context).textTheme.bodyMedium)),
                                      Expanded(child: Text(step, style: Theme.of(context).textTheme.bodyMedium)),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
    );
  }
}

class _Result extends StatelessWidget {
  const _Result({required this.icon, required this.color, required this.title, required this.message, required this.action});
  final IconData icon;
  final Color color;
  final String title;
  final String message;
  final Widget action;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 48),
      child: Column(
        children: [
          Icon(icon, size: 64, color: color),
          const SizedBox(height: 16),
          Text(title, style: Theme.of(context).textTheme.titleLarge, textAlign: TextAlign.center),
          const SizedBox(height: 8),
          Text(message, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 24),
          SizedBox(width: double.infinity, child: action),
        ],
      ),
    );
  }
}
