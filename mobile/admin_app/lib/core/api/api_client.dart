import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:path_provider/path_provider.dart';

import '../storage/app_storage.dart';

/// Every Salfanet Radius installation runs on its own operator-chosen domain
/// — there is no single production host this app can be built for. This is
/// only the fallback shown before the user configures their own server (see
/// ServerSettingsScreen / ApiClient.setBaseUrl). Override at build time for
/// local dev: --dart-define=API_BASE_URL=http://10.0.2.2:3001
const String kDefaultServerUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://radius.salfa.my.id',
);

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});
  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

/// The admin web panel authenticates through NextAuth v4 (JWT session
/// strategy, httpOnly cookie) — `requirePermission()` on every admin API
/// route calls `getServerSession(authOptions)`, which only reads that
/// cookie. There is no Bearer-token path into those routes, so rather than
/// touching the shared auth middleware (used by hundreds of routes), this
/// client replicates the exact browser flow `next-auth/react`'s `signIn()`
/// performs: GET csrf → POST callback/credentials → GET session. A
/// persisted cookie jar then carries the session cookie on every later
/// request, exactly like a browser tab.
class ApiClient {
  ApiClient._internal();
  static final ApiClient instance = ApiClient._internal();

  late final Dio _dio;
  late final PersistCookieJar _cookieJar;
  bool _ready = false;

  /// Called when a request comes back 401 — lets AuthProvider force logout
  /// without ApiClient needing to know about it directly.
  void Function()? onUnauthorized;

  String get baseUrl => _dio.options.baseUrl;

  Future<void> init() async {
    if (_ready) return;
    final dir = await getApplicationSupportDirectory();
    _cookieJar = PersistCookieJar(
      ignoreExpires: false,
      storage: FileStorage('${dir.path}/.cookies/'),
    );
    _dio = Dio(BaseOptions(
      baseUrl: kDefaultServerUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 20),
      validateStatus: (_) => true,
      followRedirects: false,
    ));
    _dio.interceptors.add(CookieManager(_cookieJar));

    final saved = await AppStorage.instance.readServerUrl();
    if (saved != null && saved.isNotEmpty) {
      _dio.options.baseUrl = saved;
    }
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

  // ── NextAuth credential flow ─────────────────────────────────────────

  Future<String> _fetchCsrfToken() async {
    final res = await _dio.get('/api/auth/csrf');
    final data = res.data;
    if (data is Map && data['csrfToken'] is String) {
      return data['csrfToken'] as String;
    }
    throw ApiException('Tidak dapat memulai sesi login (csrf).');
  }

  /// Step 1 (no 2FA) or the whole flow re-entry point for 2FA verification
  /// (step 2) — both submit to the same NextAuth callback endpoint, just
  /// with different form fields, exactly like the web login page's two
  /// `signIn('credentials', {...})` calls.
  Future<void> _submitCredentials(Map<String, String> fields) async {
    final csrfToken = await _fetchCsrfToken();
    final res = await _dio.post(
      '/api/auth/callback/credentials',
      data: {
        ...fields,
        'csrfToken': csrfToken,
        'json': 'true',
      },
      options: Options(
        contentType: Headers.formUrlEncodedContentType,
        headers: {'Accept': 'application/json'},
      ),
    );

    final data = res.data;
    final url = data is Map ? data['url']?.toString() : null;
    if (url != null && url.contains('error=')) {
      final uri = Uri.tryParse(url);
      final code = uri?.queryParameters['error'] ?? 'CredentialsSignin';
      throw ApiException(_describeAuthError(code));
    }
    if (res.statusCode != null && res.statusCode! >= 400) {
      throw ApiException('Login gagal (${res.statusCode}).');
    }
  }

  String _describeAuthError(String code) {
    switch (code) {
      case 'CredentialsSignin':
        return 'Username, password, atau kode 2FA salah.';
      default:
        return 'Login gagal. Silakan coba lagi.';
    }
  }

  /// Calls the same pre-login check the web admin panel uses, so 2FA-enabled
  /// accounts get routed to the OTP step instead of a sanitized generic error.
  Future<Map<String, dynamic>> preLogin(String username, String password) async {
    final res = await _dio.post(
      '/api/admin/auth/pre-login',
      data: jsonEncode({'username': username, 'password': password}),
      options: Options(contentType: Headers.jsonContentType),
    );
    final data = res.data;
    if (data is Map<String, dynamic>) {
      if (res.statusCode != null && res.statusCode! >= 400) {
        throw ApiException((data['error'] ?? 'Login gagal').toString(), statusCode: res.statusCode);
      }
      return data;
    }
    throw ApiException('Login gagal, respons server tidak dikenali.');
  }

  Future<void> signInWithPassword(String username, String password) {
    return _submitCredentials({'username': username, 'password': password});
  }

  Future<void> signInWithTwoFactor(String tfaToken, String tfaCode) {
    return _submitCredentials({'tfaToken': tfaToken, 'tfaCode': tfaCode});
  }

  /// Mirrors `useSession()` — returns the decoded admin user, or null if
  /// there is no valid session cookie (logged out / expired).
  Future<Map<String, dynamic>?> fetchSession() async {
    final res = await _dio.get('/api/auth/session');
    final data = res.data;
    if (data is Map<String, dynamic> && data['user'] is Map) {
      return data['user'] as Map<String, dynamic>;
    }
    return null;
  }

  Future<void> signOut() async {
    try {
      final csrfToken = await _fetchCsrfToken();
      await _dio.post(
        '/api/auth/signout',
        data: {'csrfToken': csrfToken, 'json': 'true'},
        options: Options(contentType: Headers.formUrlEncodedContentType),
      );
    } catch (_) {
      // Best-effort — the cookie is wiped locally regardless below.
    }
    await clearSession();
  }

  // ── Generic JSON calls against the shared admin API surface ─────────

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) {
    return _run(() => _dio.get(path, queryParameters: query));
  }

  Future<dynamic> post(String path, {Object? data}) {
    return _run(() => _dio.post(path, data: data));
  }

  Future<dynamic> put(String path, {Object? data}) {
    return _run(() => _dio.put(path, data: data));
  }

  Future<dynamic> patch(String path, {Object? data}) {
    return _run(() => _dio.patch(path, data: data));
  }

  Future<dynamic> delete(String path, {Map<String, dynamic>? query, Object? data}) {
    return _run(() => _dio.delete(path, queryParameters: query, data: data));
  }

  Future<dynamic> _run(Future<Response> Function() request) async {
    try {
      final res = await request();
      return _unwrap(res);
    } on ApiException {
      rethrow;
    } on DioException catch (e) {
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout ||
          e.type == DioExceptionType.sendTimeout) {
        throw ApiException('Koneksi ke server timeout. Periksa jaringan Anda.');
      }
      if (e.type == DioExceptionType.connectionError) {
        throw ApiException('Tidak dapat terhubung ke server. Periksa koneksi internet Anda.');
      }
      throw ApiException('Terjadi kesalahan jaringan.');
    }
  }

  dynamic _unwrap(Response res) {
    if (res.statusCode == 401) {
      onUnauthorized?.call();
    }

    final data = res.data;
    if (res.statusCode != null && res.statusCode! >= 400) {
      final message = data is Map ? (data['error'] ?? data['message'])?.toString() : null;
      throw ApiException(message ?? 'Terjadi kesalahan (${res.statusCode})', statusCode: res.statusCode);
    }
    return data;
  }
}
