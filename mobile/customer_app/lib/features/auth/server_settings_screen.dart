import 'package:dio/dio.dart' as dio_pkg;
import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';

/// Every Salfanet Radius install runs on its own domain, so the app can't
/// ship with one correct server baked in — this screen lets whoever sets up
/// the app point it at their operator's actual backend, and remembers it.
class ServerSettingsScreen extends StatefulWidget {
  const ServerSettingsScreen({super.key});

  @override
  State<ServerSettingsScreen> createState() => _ServerSettingsScreenState();
}

class _ServerSettingsScreenState extends State<ServerSettingsScreen> {
  late final TextEditingController _urlController;
  bool _testing = false;
  String? _error;
  String? _successCompanyName;

  @override
  void initState() {
    super.initState();
    _urlController = TextEditingController(text: ApiClient.instance.baseUrl);
  }

  @override
  void dispose() {
    _urlController.dispose();
    super.dispose();
  }

  String? _normalize(String raw) {
    var url = raw.trim();
    if (url.isEmpty) return null;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://$url';
    }
    url = url.replaceAll(RegExp(r'/+$'), '');
    final uri = Uri.tryParse(url);
    if (uri == null || uri.host.isEmpty) return null;
    return url;
  }

  Future<void> _testAndSave() async {
    final normalized = _normalize(_urlController.text);
    if (normalized == null) {
      setState(() {
        _error = 'Masukkan alamat server yang valid, mis. radius.nama-isp-anda.id';
        _successCompanyName = null;
      });
      return;
    }

    setState(() {
      _testing = true;
      _error = null;
      _successCompanyName = null;
    });

    try {
      final probe = dio_pkg.Dio(dio_pkg.BaseOptions(
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 10),
        validateStatus: (_) => true,
      ));
      final res = await probe.get('$normalized/api/public/company');
      final data = res.data;
      if (res.statusCode == 200 && data is Map && data['success'] == true) {
        final companyName = (data['company'] as Map?)?['name']?.toString();
        await ApiClient.instance.setBaseUrl(normalized);
        if (!mounted) return;
        setState(() => _successCompanyName = (companyName?.isNotEmpty == true) ? companyName : 'Server');
        await Future.delayed(const Duration(milliseconds: 700));
        if (mounted) Navigator.pop(context, true);
      } else {
        setState(() => _error = 'Server merespons tapi bukan Salfanet Radius yang valid.');
      }
    } catch (_) {
      setState(() => _error = 'Tidak dapat terhubung ke server tersebut. Periksa alamat dan koneksi internet.');
    } finally {
      if (mounted) setState(() => _testing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Pengaturan Server')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              'Setiap instalasi Salfanet Radius berjalan di domainnya sendiri. '
              'Masukkan alamat server milik penyedia internet Anda.',
              style: TextStyle(color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: 20),
            TextField(
              controller: _urlController,
              keyboardType: TextInputType.url,
              autocorrect: false,
              decoration: const InputDecoration(
                labelText: 'Alamat Server',
                hintText: 'radius.nama-isp-anda.id',
                prefixIcon: Icon(Icons.dns_outlined),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: scheme.error)),
            ],
            if (_successCompanyName != null) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  const Icon(Icons.check_circle, color: Color(0xFF12B76A), size: 18),
                  const SizedBox(width: 6),
                  Expanded(child: Text('Terhubung ke $_successCompanyName', style: const TextStyle(color: Color(0xFF12B76A)))),
                ],
              ),
            ],
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _testing ? null : _testAndSave,
              child: _testing
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Uji Koneksi & Simpan'),
            ),
          ],
        ),
      ),
    );
  }
}
