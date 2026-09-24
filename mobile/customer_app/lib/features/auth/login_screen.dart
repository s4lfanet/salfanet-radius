import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../core/company/company_logo.dart';
import '../../core/company/company_provider.dart';
import '../../core/theme/app_theme.dart';
import 'auth_provider.dart';
import 'server_settings_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _identifierController = TextEditingController();
  String? _errorText;
  bool _submitting = false;

  @override
  void dispose() {
    _identifierController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _errorText = null;
    });
    try {
      await context.read<AuthProvider>().login(_identifierController.text.trim());
    } on ApiException catch (e) {
      setState(() => _errorText = e.message);
    } catch (_) {
      setState(() => _errorText = 'Terjadi kesalahan. Coba lagi.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _openServerSettings() async {
    final changed = await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ServerSettingsScreen()));
    if (!mounted) return;
    setState(() {});
    if (changed == true) context.read<CompanyProvider>().load();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final company = context.watch<CompanyProvider>().info;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            tooltip: 'Pengaturan Server',
            onPressed: _openServerSettings,
          ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(child: CompanyLogo(company: company, size: 76, radius: 22)),
                  const SizedBox(height: 26),
                  Text('Selamat Datang', style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 8),
                  Text(
                    company != null
                        ? 'Masuk ke akun ${company.name} dengan nomor HP atau ID pelanggan Anda'
                        : 'Masuk dengan nomor HP atau ID pelanggan Anda',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                  const SizedBox(height: 32),
                  TextFormField(
                    controller: _identifierController,
                    keyboardType: TextInputType.phone,
                    autofillHints: const [AutofillHints.telephoneNumber],
                    decoration: const InputDecoration(
                      labelText: 'No. HP / ID Pelanggan',
                      prefixIcon: Icon(Icons.person_outline),
                    ),
                    validator: (value) {
                      if (value == null || value.trim().length < 4) {
                        return 'Masukkan nomor HP atau ID pelanggan yang valid';
                      }
                      return null;
                    },
                  ),
                  // An icon beside the message, so the failure still reads for
                  // anyone who cannot pick red out from the surrounding text.
                  if (_errorText != null) ...[
                    const SizedBox(height: 14),
                    Container(
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
                              _errorText!,
                              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onErrorContainer),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: _submitting ? null : _submit,
                    child: _submitting
                        ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('Masuk'),
                  ),
                  if (company?.phone != null && company!.phone!.isNotEmpty) ...[
                    const SizedBox(height: 18),
                    Center(
                      child: Text(
                        'Belum punya akun atau lupa nomor terdaftar?\nHubungi ${company.phone}',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                      ),
                    ),
                  ],
                  const SizedBox(height: 10),
                  Center(
                    child: TextButton.icon(
                      onPressed: _openServerSettings,
                      icon: const Icon(Icons.dns_outlined, size: 15),
                      label: Text(
                        Uri.tryParse(ApiClient.instance.baseUrl)?.host ?? ApiClient.instance.baseUrl,
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(color: scheme.onSurfaceVariant),
                      ),
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
