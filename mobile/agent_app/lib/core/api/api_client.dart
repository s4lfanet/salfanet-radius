import 'package:dio/dio.dart';

import '../storage/app_storage.dart';

/// Every Salfanet Radius installation runs on its own operator-chosen domain,
/// so this is only the fallback shown before the agent sets their own server
/// (ServerSettingsScreen / ApiClient.setBaseUrl). Override at build time for
/// local dev: --dart-define=API_BASE_URL=http://10.0.2.2:3001
const String kDefaultServerUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'https://radius.salfa.my.id');

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});
  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

/// The agent portal authenticates with a Bearer JWT (7 days) returned by
/// POST /api/agent/login (or /api/agent/verify-otp when OTP is on). The token
/// is kept in secure storage and sent on every request.
class ApiClient {
  ApiClient._internal();
  static final ApiClient instance = ApiClient._internal();

  late final Dio _dio;
  bool _ready = false;
  String? _token;

  /// Called when a request comes back 401 — lets AuthProvider force logout.
  void Function()? onUnauthorized;

  String get baseUrl => _dio.options.baseUrl;
  bool get hasToken => _token != null && _token!.isNotEmpty;

  Future<void> init() async {
    if (_ready) return;
    _dio = Dio(
      BaseOptions(
        baseUrl: kDefaultServerUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 25),
        validateStatus: (_) => true,
        followRedirects: false,
      ),
    );
    _dio.interceptors.add(InterceptorsWrapper(onRequest: (options, handler) {
      final t = _token;
      if (t != null && t.isNotEmpty) options.headers['Authorization'] = 'Bearer $t';
      handler.next(options);
    }));

    final saved = await AppStorage.instance.readServerUrl();
    if (saved != null && saved.isNotEmpty) {
      _dio.options.baseUrl = saved;
    }
    _token = await AppStorage.instance.readToken();
    _ready = true;
  }

  Future<void> setBaseUrl(String url) async {
    final normalized = url.trim().replaceAll(RegExp(r'/+$'), '');
    _dio.options.baseUrl = normalized;
    await AppStorage.instance.saveServerUrl(normalized);
    // A token belongs to one installation — drop it when the server changes.
    await clearSession();
  }

  Future<void> setToken(String token) async {
    _token = token;
    await AppStorage.instance.saveToken(token);
  }

  Future<void> clearSession() async {
    _token = null;
    await AppStorage.instance.clearToken();
  }

  // ── Agent auth flow ────────────────────────────────────────────────

  /// POST /api/agent/login — step 1. Either returns a token straight away
  /// (OTP switched off on the server) or `requireOTP: true` after sending the
  /// code by WhatsApp.
  Future<Map<String, dynamic>> requestLogin(String phone) async {
    final data = await _run(() => _dio.post('/api/agent/login', data: {'phone': phone}));
    return Map<String, dynamic>.from(data as Map);
  }

  /// POST /api/agent/verify-otp — step 2, returns the token.
  Future<Map<String, dynamic>> verifyOtp(String phone, String code) async {
    final data = await _run(() => _dio.post('/api/agent/verify-otp', data: {'phone': phone, 'otpCode': code}));
    return Map<String, dynamic>.from(data as Map);
  }

  Future<void> signOut() async {
    try {
      await _dio.post('/api/agent/logout');
    } catch (_) {}
    await clearSession();
  }

  // ── Generic helpers ────────────────────────────────────────────────

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) => _run(() => _dio.get(path, queryParameters: query));

  Future<dynamic> post(String path, {Object? data}) => _run(() => _dio.post(path, data: data));

  Future<dynamic> postForm(String path, FormData data) => _run(() => _dio.post(path, data: data, options: Options(contentType: 'multipart/form-data')));

  Future<dynamic> put(String path, {Object? data}) => _run(() => _dio.put(path, data: data));

  Future<dynamic> delete(String path, {Map<String, dynamic>? query}) => _run(() => _dio.delete(path, queryParameters: query));

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
