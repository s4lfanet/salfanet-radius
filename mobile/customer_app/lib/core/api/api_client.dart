import 'package:dio/dio.dart';
import '../storage/secure_storage.dart';

/// Production customer subdomain (see deploy/salfanet-subdomains.conf), which
/// proxies /api/ to the backend on port 3001. Override at build time for a
/// local backend: --dart-define=API_BASE_URL=http://10.0.2.2:3001
const String kApiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://customer.salfa.my.id',
);

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});
  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient._internal() {
    _dio = Dio(BaseOptions(
      baseUrl: kApiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 20),
      headers: {'Content-Type': 'application/json'},
      validateStatus: (_) => true,
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await SecureStorage.instance.readToken();
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
    ));
  }

  static final ApiClient instance = ApiClient._internal();
  late final Dio _dio;

  /// Called when a request comes back 401 — lets AuthProvider force logout
  /// without ApiClient needing to know about it directly.
  void Function()? onUnauthorized;

  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? query}) {
    return _run(() => _dio.get(path, queryParameters: query));
  }

  Future<Map<String, dynamic>> post(String path, {Object? data}) {
    return _run(() => _dio.post(path, data: data));
  }

  /// For multipart/form-data submissions (file uploads) — bypasses the
  /// default application/json content type set in BaseOptions.
  Future<Map<String, dynamic>> postForm(String path, FormData data) {
    return _run(() => _dio.post(path, data: data, options: Options(contentType: 'multipart/form-data')));
  }

  Future<Map<String, dynamic>> patch(String path, {Object? data}) {
    return _run(() => _dio.patch(path, data: data));
  }

  Future<Map<String, dynamic>> delete(String path, {Map<String, dynamic>? query}) {
    return _run(() => _dio.delete(path, queryParameters: query));
  }

  Future<Map<String, dynamic>> _run(Future<Response> Function() request) async {
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

  Map<String, dynamic> _unwrap(Response res) {
    if (res.statusCode == 401) {
      onUnauthorized?.call();
    }

    final data = res.data;
    if (data is Map<String, dynamic>) {
      if (res.statusCode != null && res.statusCode! >= 400) {
        final message = (data['error'] ?? data['message'] ?? 'Terjadi kesalahan (${res.statusCode})').toString();
        throw ApiException(message, statusCode: res.statusCode);
      }
      return data;
    }

    if (data is List) {
      // Some shared (non-customer-prefixed) endpoints return a bare JSON array.
      return {'data': data};
    }

    if (res.statusCode != null && res.statusCode! >= 400) {
      throw ApiException('Terjadi kesalahan (${res.statusCode})', statusCode: res.statusCode);
    }
    return {};
  }
}
