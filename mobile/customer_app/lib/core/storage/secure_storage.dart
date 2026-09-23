import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorage {
  SecureStorage._internal();
  static final SecureStorage instance = SecureStorage._internal();

  final _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  static const _tokenKey = 'customer_token';
  static const _serverUrlKey = 'server_base_url';

  Future<void> saveToken(String token) => _storage.write(key: _tokenKey, value: token);
  Future<String?> readToken() => _storage.read(key: _tokenKey);
  Future<void> clearToken() => _storage.delete(key: _tokenKey);

  /// Every Salfanet Radius install runs on its own domain — this app isn't
  /// built for one specific ISP, so the server URL is configurable at
  /// runtime rather than baked in at compile time.
  Future<void> saveServerUrl(String url) => _storage.write(key: _serverUrlKey, value: url);
  Future<String?> readServerUrl() => _storage.read(key: _serverUrlKey);
}
