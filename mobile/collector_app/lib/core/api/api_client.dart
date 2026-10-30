import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:path_provider/path_provider.dart';

import '../storage/app_storage.dart';

/// Every Salfanet Radius installation runs on its own operator-chosen domain
/// — there is no single production host this app can be built for. This is
/// only the fallback shown before the user configures their own server (see
/// ServerSettingsScreen / ApiClient.setBaseUrl). Override at build time for
/// local dev: --dart-define=API_BASE_URL=http://10.0.2.2:3001
const String kDefaultServerUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'https://radius.salfa.my.id');

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});
  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

/// The collector portal authenticates with an httpOnly `collector-token`
/// JWT cookie (7d) set by POST /api/collector/auth/login. A persisted cookie
/// jar carries it on every later request, exactly like the browser tab the
/// web portal uses.
class ApiClient {
  ApiClient._internal();
  static final ApiClient instance = ApiClient._internal();

  late final Dio _dio;
  late final PersistCookieJar _cookieJar;
  bool _ready = false;

  /// Called when a request comes back 401 — lets AuthProvider force logout.
  void Function()? onUnauthorized;

  String get baseUrl => _dio.options.baseUrl;

  Future<void> init() async {
    if (_ready) return;
    final dir = await getApplicationSupportDirectory();
    _cookieJar = PersistCookieJar(ignoreExpires: false, storage: FileStorage('${dir.path}/.cookies/'));
    _dio = Dio(
      BaseOptions(
        baseUrl: kDefaultServerUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 20),
        validateStatus: (_) => true,
        followRedirects: false,
      ),
    );
    _dio.interceptors.add(CookieManager(_cookieJar));

    final saved = await AppStorage.instance.readServerUrl();
    if (saved != null && saved.isNotEmpty) {
      _dio.options.baseUrl = saved;
    }
    _ready = true;
  }

  @visibleForTesting
  void initForTest(HttpClientAdapter adapter, {String baseUrl = 'https://isp.test'}) {
    if (!_ready) _dio = Dio(BaseOptions(baseUrl: baseUrl, validateStatus: (_) => true));
    _dio.httpClientAdapter = adapter;
    _ready = true;
  }

  Future<void> setBaseUrl(String url) async {
    final normalized = url.trim().replaceAll(RegExp(r'/+$'), '');
    _dio.options.baseUrl = normalized;
    await AppStorage.instance.saveServerUrl(normalized);
    // Switching server means any previously-stored session cookie belongs
    // to a different install — drop it so we don't send a stale cookie.
    await _cookieJar.deleteAll();
  }

  /// Clears the session cookie — used on logout.
  Future<void> clearSession() => _cookieJar.deleteAll();

  // ── Collector auth flow ────────────────────────────────────────────

  /// POST /api/collector/auth/login — sets the httpOnly cookie and returns
  /// the user payload. Non-collector accounts are refused server-side.
  Future<Map<String, dynamic>> signIn(String username, String password) async {
    final res = await _dio.post('/api/collector/auth/login', data: {'username': username, 'password': password});
    final data = res.data;
    if (res.statusCode == 200 && data is Map && data['success'] == true) {
      return Map<String, dynamic>.from(data['user'] as Map? ?? const {});
    }
    final msg = data is Map ? data['error']?.toString() : null;
    throw ApiException(msg ?? 'Login gagal (${res.statusCode}).', statusCode: res.statusCode);
  }

  /// GET /api/collector/auth/session — null when the cookie is absent or expired.
  Future<Map<String, dynamic>?> fetchSession() async {
    final res = await _dio.get('/api/collector/auth/session');
    final data = res.data;
    if (res.statusCode == 200 && data is Map) {
      final c = data['collector'] ?? data['user'];
      if (c is Map) return Map<String, dynamic>.from(c);
    }
    return null;
  }

  Future<void> signOut() async {
    try {
      await _dio.post('/api/collector/auth/logout');
    } catch (_) {}
    await _cookieJar.deleteAll();
  }

  // ── Generic helpers ────────────────────────────────────────────────

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) => _run(() => _dio.get(path, queryParameters: query));

  Future<dynamic> post(String path, {Object? data}) => _run(() => _dio.post(path, data: data));

  Future<dynamic> patch(String path, {Object? data}) => _run(() => _dio.patch(path, data: data));

  Future<dynamic> delete(String path, {Map<String, dynamic>? query}) => _run(() => _dio.delete(path, queryParameters: query));

  Future<dynamic> upload(String path, String filePath, {String field = 'file', String? filename, Map<String, dynamic>? fields}) async {
    final form = FormData.fromMap({
      ...?fields,
      field: await MultipartFile.fromFile(filePath, filename: filename),
    });
    return _run(() => _dio.post(path, data: form));
  }

  Future<List<int>> getBytes(String path) async {
    try {
      final res = await _dio.get<List<int>>(path, options: Options(responseType: ResponseType.bytes));
      if (res.statusCode == 200 && res.data != null) return res.data!;
      throw ApiException('Gagal mengambil file (${res.statusCode}).');
    } on DioException {
      throw ApiException('Tidak dapat terhubung ke server.');
    }
  }

  String _errorMessage(dynamic res) {
    final data = res.data;
    if (data is Map) {
      final m = data['error'] ?? data['message'];
      if (m != null) return m.toString();
    }
    return 'Permintaan gagal (${res.statusCode}).';
  }

  Future<dynamic> _run(Future<Response> Function() request) async {
    try {
      final res = await request();
      if (res.statusCode == 401) {
        onUnauthorized?.call();
        throw ApiException('Sesi berakhir, silakan masuk kembali.', statusCode: 401);
      }
      if (res.statusCode == 429) {
        throw ApiException('Terlalu banyak permintaan. Coba lagi sebentar lagi.', statusCode: 429);
      }
      if (res.statusCode != null && res.statusCode! >= 400) {
        throw ApiException(_errorMessage(res), statusCode: res.statusCode);
      }
      return res.data;
    } on DioException catch (e) {
      if (e.error is ApiException) rethrow;
      throw ApiException('Tidak dapat terhubung ke server. Periksa jaringan atau alamat server.');
    }
  }
}
