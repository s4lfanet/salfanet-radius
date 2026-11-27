import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/api_client.dart';
import '../theme/app_theme.dart';

/// Nama dan logo perusahaan dari server (`/api/public/company`). Nilai terakhir
/// disimpan di perangkat supaya logo langsung tampil di pembukaan berikutnya,
/// lalu diperbarui dari server di latar belakang.
class CompanyBrand extends ChangeNotifier {
  CompanyBrand._();
  static final CompanyBrand instance = CompanyBrand._();

  static const _nameKey = 'company_name';
  static const _logoKey = 'company_logo';
  final _storage = const FlutterSecureStorage(aOptions: AndroidOptions(encryptedSharedPreferences: true));

  String? name;
  String? logoUrl;
  bool _started = false;

  String? _resolve(String? path, String base) {
    if (path == null || path.isEmpty) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return '$base${path.startsWith('/') ? '' : '/'}$path';
  }

  Future<void> load() async {
    if (_started) return;
    _started = true;
    try {
      final n = await _storage.read(key: _nameKey);
      final l = await _storage.read(key: _logoKey);
      if (n != null || l != null) {
        name = n;
        logoUrl = l;
        notifyListeners();
      }
    } catch (_) {}
    try {
      final base = ApiClient.instance.baseUrl;
      final res = await Dio(BaseOptions(connectTimeout: const Duration(seconds: 6), receiveTimeout: const Duration(seconds: 6))).get('$base/api/public/company');
      final c = (res.data is Map) ? (res.data['company'] as Map?) : null;
      if (c == null) return;
      name = c['name']?.toString();
      logoUrl = _resolve(c['logo']?.toString(), base);
      notifyListeners();
      await _storage.write(key: _nameKey, value: name ?? '');
      await _storage.write(key: _logoKey, value: logoUrl ?? '');
    } catch (_) {}
  }
}

/// Logo perusahaan; bila belum ada atau gagal dimuat, kotak berwarna dengan ikon aplikasi.
class CompanyMark extends StatelessWidget {
  const CompanyMark({super.key, required this.icon, this.size = 76, this.radius});
  final IconData icon;
  final double size;
  final double? radius;

  @override
  Widget build(BuildContext context) {
    final r = radius ?? (size >= 60 ? AppTheme.radiusBrand : size * 0.26);
    return ListenableBuilder(
      listenable: CompanyBrand.instance,
      builder: (context, _) {
        final url = CompanyBrand.instance.logoUrl;
        final fallback = Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            gradient: const LinearGradient(colors: [AppTheme.brand, AppTheme.brandDeep], begin: Alignment.topLeft, end: Alignment.bottomRight),
            borderRadius: BorderRadius.circular(r),
            boxShadow: size >= 60 ? [BoxShadow(color: AppTheme.brand.withValues(alpha: 0.35), blurRadius: 28, offset: const Offset(0, 10))] : null,
          ),
          child: Icon(icon, color: Colors.white, size: size * 0.48),
        );
        if (url == null || url.isEmpty) return fallback;
        return Container(
          width: size,
          height: size,
          padding: EdgeInsets.all(size * 0.12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(r),
            border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
            boxShadow: size >= 60 ? [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 24, offset: const Offset(0, 8))] : null,
          ),
          child: CachedNetworkImage(
            imageUrl: url,
            fit: BoxFit.contain,
            placeholder: (_, __) => const SizedBox.shrink(),
            errorWidget: (_, __, ___) => Icon(icon, color: AppTheme.brand, size: size * 0.48),
          ),
        );
      },
    );
  }
}
