import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import 'auth_provider.dart';

class OtpScreen extends StatefulWidget {
  const OtpScreen({super.key});

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final _otpController = TextEditingController();
  String? _errorText;
  bool _submitting = false;
  bool _resending = false;

  @override
  void dispose() {
    _otpController.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    final code = _otpController.text.trim();
    if (code.length < 4) {
      setState(() => _errorText = 'Masukkan kode OTP yang valid');
      return;
    }
    setState(() {
      _submitting = true;
      _errorText = null;
    });
    try {
      await context.read<AuthProvider>().verifyOtp(code);
    } on ApiException catch (e) {
      setState(() => _errorText = e.message);
    } catch (_) {
      setState(() => _errorText = 'Terjadi kesalahan. Coba lagi.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _resend() async {
    setState(() => _resending = true);
    try {
      await context.read<AuthProvider>().resendOtp();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Kode OTP baru telah dikirim')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Gagal mengirim ulang OTP')));
      }
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.read<AuthProvider>().cancelOtp(),
        ),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Icon(Icons.sms_outlined, size: 48, color: scheme.primary),
                const SizedBox(height: 20),
                Text('Verifikasi OTP', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Text(
                  'Kode OTP telah dikirim via WhatsApp ke ${auth.pendingPhone ?? "-"}',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                ),
                const SizedBox(height: 28),
                TextField(
                  controller: _otpController,
                  keyboardType: TextInputType.number,
                  textAlign: TextAlign.center,
                  maxLength: 6,
                  style: const TextStyle(fontSize: 24, letterSpacing: 8),
                  decoration: const InputDecoration(counterText: '', hintText: '——————'),
                ),
                if (_errorText != null) ...[
                  const SizedBox(height: 8),
                  Text(_errorText!, style: TextStyle(color: scheme.error)),
                ],
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _submitting ? null : _verify,
                  child: _submitting
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Verifikasi'),
                ),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: _resending ? null : _resend,
                  child: Text(_resending ? 'Mengirim...' : 'Kirim ulang kode'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
