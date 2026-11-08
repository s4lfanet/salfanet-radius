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
    final text = Theme.of(context).textTheme;
    final company = context.watch<CompanyProvider>().info;
    // With the keyboard up the brand block shrinks so the form keeps its room.
    final compact = MediaQuery.of(context).viewInsets.bottom > 0;
    return Scaffold(
      backgroundColor: scheme.primary,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(28, compact ? 4 : 8, 8, compact ? 16 : 36),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Align(
                    alignment: Alignment.centerRight,
                    child: IconButton(
                      icon: Icon(Icons.settings_outlined, color: scheme.onPrimary),
                      tooltip: 'Pengaturan Server',
                      onPressed: _openServerSettings,
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(right: 20),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(6),
                          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18)),
                          child: CompanyLogo(company: company, size: compact ? 44 : 56, radius: 14),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Text(
                            company?.name ?? 'Portal Pelanggan',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: text.titleLarge?.copyWith(color: scheme.onPrimary, fontWeight: FontWeight.w800),
                          ),
                        ),
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
                  color: scheme.surface,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                ),
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(28, 32, 28, 24),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text('Masuk', style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                        const SizedBox(height: 6),
                        Text(
                          'Gunakan nomor HP atau ID pelanggan yang terdaftar.',
                          style: text.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                        ),
                        const SizedBox(height: 28),
                        TextFormField(
                          controller: _identifierController,
                          keyboardType: TextInputType.phone,
                          textInputAction: TextInputAction.done,
                          autofillHints: const [AutofillHints.telephoneNumber],
                          onFieldSubmitted: (_) => _submitting ? null : _submit(),
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
                                    style: text.bodySmall?.copyWith(color: scheme.onErrorContainer),
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
                              : const Text('Lanjut'),
                        ),
                        if (company?.phone != null && company!.phone!.isNotEmpty) ...[
                          const SizedBox(height: 20),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(Icons.support_agent_rounded, size: 18, color: scheme.onSurfaceVariant),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  'Belum punya akun atau lupa nomor terdaftar? Hubungi ${company.phone}',
                                  style: text.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                                ),
                              ),
                            ],
                          ),
                        ],
                        const SizedBox(height: 12),
                        Center(
                          child: TextButton.icon(
                            onPressed: _openServerSettings,
                            icon: const Icon(Icons.dns_outlined, size: 15),
                            label: Text(
                              Uri.tryParse(ApiClient.instance.baseUrl)?.host ?? ApiClient.instance.baseUrl,
                              style: text.labelSmall?.copyWith(color: scheme.onSurfaceVariant),
                            ),
                          ),
                        ),
                      ],
                    ),
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
