import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AppStorage {
  AppStorage._internal();
  static final AppStorage instance = AppStorage._internal();

  final _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  static const _serverUrlKey = 'server_base_url';

  /// Every Salfanet Radius install runs on its own domain — this app isn't
  /// built for one specific ISP, so the server URL is configurable at
  /// runtime rather than baked in at compile time.
  Future<void> saveServerUrl(String url) => _storage.write(key: _serverUrlKey, value: url);
  Future<String?> readServerUrl() => _storage.read(key: _serverUrlKey);

  static const _themeModeKey = 'theme_mode';
  Future<void> saveThemeMode(String mode) => _storage.write(key: _themeModeKey, value: mode);
  Future<String?> readThemeMode() => _storage.read(key: _themeModeKey);
}
