import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import 'auth_provider.dart';

/// Shown by the auth gate (main.dart) as the home route while a 2FA login
/// is pending — so "back" cancels the pending login rather than popping.
class TwoFactorScreen extends StatefulWidget {
  const TwoFactorScreen({super.key});

  @override
  State<TwoFactorScreen> createState() => _TwoFactorScreenState();
}

class _TwoFactorScreenState extends State<TwoFactorScreen> {
  final _code = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final code = _code.text.replaceAll(RegExp(r'\s'), '');
    if (code.length < 6) {
      setState(() => _error = 'Masukkan 6 digit kode dari aplikasi autentikator.');
      return;
    }
    setState(() => _error = null);
    try {
      await context.read<AuthProvider>().verifyTwoFactor(code);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _error = e.message);
        _code.clear();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) auth.cancelTwoFactor();
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(tooltip: 'Kembali ke login', icon: const Icon(Icons.arrow_back_rounded), onPressed: auth.cancelTwoFactor),
          title: const Text('Verifikasi 2 Langkah'),
        ),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(Gap.xl),
            children: [
              RoleIconTile(icon: Icons.phonelink_lock_rounded, color: context.colors.primary, size: 56),
              const SizedBox(height: Gap.lg),
              const Text('Masukkan kode autentikator', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
              const SizedBox(height: Gap.xs),
              Text(
                'Buka Google Authenticator (atau aplikasi sejenis) dan masukkan 6 digit kode untuk akun ini. Sesi ini berlaku 10 menit.',
                style: TextStyle(color: context.colors.onSurfaceVariant, height: 1.45),
              ),
              const SizedBox(height: Gap.xl),
              TextField(
                controller: _code,
                autofocus: true,
                keyboardType: TextInputType.number,
                textAlign: TextAlign.center,
                maxLength: 6,
                autofillHints: const [AutofillHints.oneTimeCode],
                onChanged: (v) {
                  if (v.length == 6 && !auth.loading) _submit();
                },
                style: const TextStyle(fontSize: 28, letterSpacing: 10, fontWeight: FontWeight.w700),
                decoration: InputDecoration(counterText: '', hintText: '000000', errorText: _error),
              ),
              const SizedBox(height: Gap.lg),
              FilledButton(
                onPressed: auth.loading ? null : _submit,
                child: auth.loading ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Verifikasi'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
