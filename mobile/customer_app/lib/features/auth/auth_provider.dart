import 'package:flutter/foundation.dart';
import '../../core/api/api_client.dart';
import '../../core/storage/secure_storage.dart';
import '../../core/push/push_service.dart';
import '../../models/customer.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthProvider extends ChangeNotifier {
  AuthStatus status = AuthStatus.unknown;
  CustomerProfile? customer;
  String? error;
  bool loading = false;

  /// Set once login() returns requireOTP:true, so the OTP screen knows which
  /// phone to send send-otp/verify-otp for.
  String? pendingPhone;

  Future<void> bootstrap() async {
    final token = await SecureStorage.instance.readToken();
    if (token == null) {
      status = AuthStatus.unauthenticated;
      notifyListeners();
      return;
    }
    final ok = await fetchMe();
    status = ok ? AuthStatus.authenticated : AuthStatus.unauthenticated;
    notifyListeners();
  }

  Future<bool> fetchMe() async {
    try {
      final res = await ApiClient.instance.get('/api/customer/me');
      if (res['success'] == true && res['user'] is Map<String, dynamic>) {
        customer = CustomerProfile.fromJson(res['user']);
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  /// Returns true if login completed immediately (OTP disabled), false if an
  /// OTP step is now required (pendingPhone is set in that case).
  Future<bool> login(String identifier) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await ApiClient.instance.post('/api/customer/auth/login', data: {'identifier': identifier});

      if (res['requireOTP'] == true) {
        pendingPhone = (res['user'] as Map<String, dynamic>?)?['phone']?.toString() ?? identifier;
        await ApiClient.instance.post('/api/customer/auth/send-otp', data: {'phone': pendingPhone});
        return false;
      }

      final token = res['token']?.toString();
      if (token == null) throw ApiException('Login gagal, token tidak diterima.');
      await SecureStorage.instance.saveToken(token);
      customer = CustomerProfile.fromJson(res['user'] as Map<String, dynamic>);
      status = AuthStatus.authenticated;
      PushService.instance.registerTokenIfReady();
      return true;
    } on ApiException catch (e) {
      error = e.message;
      rethrow;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  void cancelOtp() {
    pendingPhone = null;
    notifyListeners();
  }

  Future<void> resendOtp() async {
    if (pendingPhone == null) return;
    await ApiClient.instance.post('/api/customer/auth/send-otp', data: {'phone': pendingPhone});
  }

  Future<void> verifyOtp(String otpCode) async {
    if (pendingPhone == null) throw ApiException('Sesi login tidak valid, ulangi login.');
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await ApiClient.instance.post(
        '/api/customer/auth/verify-otp',
        data: {'phone': pendingPhone, 'otpCode': otpCode},
      );
      final token = res['token']?.toString();
      if (token == null) throw ApiException('Verifikasi gagal, token tidak diterima.');
      await SecureStorage.instance.saveToken(token);
      customer = CustomerProfile.fromJson(res['user'] as Map<String, dynamic>);
      pendingPhone = null;
      status = AuthStatus.authenticated;
      PushService.instance.registerTokenIfReady();
    } on ApiException catch (e) {
      error = e.message;
      rethrow;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    try {
      await PushService.instance.unregisterToken();
    } catch (_) {
      // Best-effort — don't block logout on a push-token cleanup failure.
    }
    await SecureStorage.instance.clearToken();
    customer = null;
    status = AuthStatus.unauthenticated;
    notifyListeners();
  }

  /// Called by ApiClient when any request comes back 401 (expired/revoked session).
  void forceLogout() {
    if (status != AuthStatus.authenticated) return;
    SecureStorage.instance.clearToken();
    customer = null;
    status = AuthStatus.unauthenticated;
    notifyListeners();
  }
}
