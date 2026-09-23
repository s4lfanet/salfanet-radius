import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../models/wifi_device.dart';
import 'wifi_provider.dart';

Future<void> showWifiEditSheet(BuildContext context, WlanConfig wlan) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (_) => _WifiEditSheet(wlan: wlan),
  );
}

class _WifiEditSheet extends StatefulWidget {
  const _WifiEditSheet({required this.wlan});
  final WlanConfig wlan;

  @override
  State<_WifiEditSheet> createState() => _WifiEditSheetState();
}

class _WifiEditSheetState extends State<_WifiEditSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _ssidController;
  final _passwordController = TextEditingController();
  bool _obscure = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _ssidController = TextEditingController(text: widget.wlan.ssid);
  }

  @override
  void dispose() {
    _ssidController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await context.read<WifiProvider>().updateWifi(
            wlanIndex: widget.wlan.index,
            ssid: _ssidController.text.trim(),
            password: _passwordController.text,
          );
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('WiFi berhasil diperbarui')));
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Gagal memperbarui WiFi. Coba lagi.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 12,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: SafeArea(
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Ubah WiFi ${widget.wlan.band}', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 20),
              TextFormField(
                controller: _ssidController,
                decoration: const InputDecoration(labelText: 'Nama WiFi (SSID)'),
                maxLength: 32,
                validator: (value) {
                  if (value == null || value.trim().isEmpty) return 'Nama WiFi tidak boleh kosong';
                  return null;
                },
              ),
              TextFormField(
                controller: _passwordController,
                obscureText: _obscure,
                decoration: InputDecoration(
                  labelText: 'Password Baru (opsional)',
                  helperText: 'Kosongkan jika tidak ingin mengubah password',
                  suffixIcon: IconButton(
                    icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
                maxLength: 63,
                validator: (value) {
                  if (value != null && value.isNotEmpty && value.length < 8) {
                    return 'Password minimal 8 karakter';
                  }
                  return null;
                },
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ],
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _saving ? null : _save,
                child: _saving
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Simpan'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
