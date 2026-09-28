import 'package:dio/dio.dart' as dio_pkg;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import 'auth_provider.dart';
import 'server_settings_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _username = TextEditingController();
  final _password = TextEditingController();
  bool _showPassword = false;
  String? _error;
  String? _companyName;
  String? _companyLogo;

  @override
  void initState() {
    super.initState();
    _loadBranding();
  }

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  /// Same public endpoint the web login uses for the operator's name/logo.
  /// Plain Dio (no session needed) and silent on failure — the login form
  /// works without it.
  Future<void> _loadBranding() async {
    try {
      final base = ApiClient.instance.baseUrl;
      final res = await dio_pkg.Dio(dio_pkg.BaseOptions(connectTimeout: const Duration(seconds: 6), receiveTimeout: const Duration(seconds: 6)))
          .get('$base/api/public/company');
      final company = (res.data is Map) ? (res.data['company'] as Map?) : null;
      if (!mounted || company == null) return;
      setState(() {
        _companyName = company['name']?.toString();
        final logo = company['logo']?.toString();
        _companyLogo = logo == null || logo.isEmpty ? null : (logo.startsWith('http') ? logo : '$base${logo.startsWith('/') ? '' : '/'}$logo');
      });
    } catch (_) {}
  }

  Future<void> _submit() async {
    final auth = context.read<AuthProvider>();
    if (_username.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'Isi username dan password.');
      return;
    }
    setState(() => _error = null);
    try {
      // If 2FA is required, AuthProvider sets pendingTfaToken and the auth
      // gate in main.dart switches to the 2FA screen by itself.
      await auth.login(_username.text.trim(), _password.text);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final muted = context.colors.onSurfaceVariant;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: Gap.xl, vertical: Gap.xl),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: _companyLogo != null
                        ? Container(
                            width: 84,
                            height: 84,
                            padding: const EdgeInsets.all(Gap.sm),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(AppTheme.radiusBrand),
                              border: Border.all(color: context.colors.outline),
                            ),
                            child: Image.network(_companyLogo!, fit: BoxFit.contain, errorBuilder: (_, __, ___) => const _BrandMark()),
                          )
                        : const _BrandMark(),
                  ),
                  const SizedBox(height: Gap.xl),
                  Text(
                    _companyName ?? 'Panel Admin',
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, height: 1.2),
                  ),
                  const SizedBox(height: Gap.xs),
                  Text(
                    _companyName != null ? 'Masuk ke panel admin' : 'Masuk dengan akun staf Anda',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: muted, fontSize: 14),
                  ),
                  const SizedBox(height: Gap.xl + Gap.sm),
                  if (_error != null) ...[
                    Container(
                      padding: const EdgeInsets.all(Gap.md),
                      decoration: BoxDecoration(
                        color: context.tone(Tone.danger).withValues(alpha: 0.10),
                        borderRadius: BorderRadius.circular(AppTheme.radiusControl),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.error_outline_rounded, size: 18, color: context.tone(Tone.danger)),
                          const SizedBox(width: Gap.sm),
                          Expanded(child: Text(_error!, style: TextStyle(color: context.tone(Tone.danger), fontSize: 13, fontWeight: FontWeight.w600))),
                        ],
                      ),
                    ),
                    const SizedBox(height: Gap.lg),
                  ],
                  TextField(
                    controller: _username,
                    autocorrect: false,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.username],
                    decoration: const InputDecoration(labelText: 'Username', prefixIcon: Icon(Icons.person_outline_rounded)),
                  ),
                  const SizedBox(height: Gap.md),
                  TextField(
                    controller: _password,
                    obscureText: !_showPassword,
                    textInputAction: TextInputAction.done,
                    autofillHints: const [AutofillHints.password],
                    onSubmitted: (_) => auth.loading ? null : _submit(),
                    decoration: InputDecoration(
                      labelText: 'Password',
                      prefixIcon: const Icon(Icons.lock_outline_rounded),
                      suffixIcon: IconButton(
                        tooltip: _showPassword ? 'Sembunyikan' : 'Tampilkan',
                        icon: Icon(_showPassword ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                        onPressed: () => setState(() => _showPassword = !_showPassword),
                      ),
                    ),
                  ),
                  const SizedBox(height: Gap.xl),
                  FilledButton(
                    onPressed: auth.loading ? null : _submit,
                    child: auth.loading ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Masuk'),
                  ),
                  const SizedBox(height: Gap.lg),
                  Center(
                    child: TextButton.icon(
                      onPressed: () async {
                        await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ServerSettingsScreen()));
                        _loadBranding();
                      },
                      style: TextButton.styleFrom(foregroundColor: muted),
                      icon: const Icon(Icons.dns_outlined, size: 18),
                      label: Text(Uri.tryParse(ApiClient.instance.baseUrl)?.host ?? 'Pengaturan Server'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Fallback mark when the operator has no logo set. The only gradient in
/// the app (DESIGN.md) — same blue→indigo as the web login panel.
class _BrandMark extends StatelessWidget {
  const _BrandMark();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 72,
      height: 72,
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [AppTheme.brand, AppTheme.brandDeep], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(AppTheme.radiusBrand),
      ),
      child: const Icon(Icons.shield_rounded, color: Colors.white, size: 34),
    );
  }
}
