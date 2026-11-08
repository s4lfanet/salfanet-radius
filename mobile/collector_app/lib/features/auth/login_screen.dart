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
      final res = await dio_pkg.Dio(
        dio_pkg.BaseOptions(connectTimeout: const Duration(seconds: 6), receiveTimeout: const Duration(seconds: 6)),
      ).get('$base/api/public/company');
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
    final compact = MediaQuery.of(context).viewInsets.bottom > 0;
    const onBrand = Colors.white;

    return Scaffold(
      backgroundColor: AppTheme.brand,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(Gap.xl, compact ? Gap.lg : 40, Gap.xl, compact ? Gap.lg : 40),
              child: Row(
                children: [
                  Container(
                    width: compact ? 48 : 60,
                    height: compact ? 48 : 60,
                    padding: const EdgeInsets.all(Gap.sm),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(AppTheme.radiusCard)),
                    child: _companyLogo != null
                        ? Image.network(_companyLogo!, fit: BoxFit.contain, errorBuilder: (_, __, ___) => const _BrandMark())
                        : const _BrandMark(),
                  ),
                  const SizedBox(width: Gap.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _companyName ?? 'Portal Kolektor',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: onBrand, fontSize: 19, fontWeight: FontWeight.w800, height: 1.2),
                        ),
                        const SizedBox(height: 2),
                        Text('Aplikasi Kolektor', style: TextStyle(color: onBrand.withValues(alpha: 0.9), fontSize: 13)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                ),
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(Gap.xl, 32, Gap.xl, Gap.xl),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text('Masuk', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 6),
                      Text('Gunakan akun kolektor yang diberikan admin.', style: TextStyle(color: muted, fontSize: 14)),
                      const SizedBox(height: Gap.xl),
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
                              Expanded(
                                child: Text(
                                  _error!,
                                  style: TextStyle(color: context.tone(Tone.danger), fontSize: 13, fontWeight: FontWeight.w600),
                                ),
                              ),
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
          ],
        ),
      ),
    );
  }
}

/// Fallback mark when the operator has no logo set: brand shield on the
/// white tile that holds the logo.
class _BrandMark extends StatelessWidget {
  const _BrandMark();

  @override
  Widget build(BuildContext context) {
    return const Center(child: Icon(Icons.shield_rounded, color: AppTheme.brand, size: 30));
  }
}
