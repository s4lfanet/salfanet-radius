import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import '../../models/admin_user.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthProvider extends ChangeNotifier {
  AuthStatus status = AuthStatus.unknown;
  AdminUser? user;
  String? error;
  bool loading = false;

  /// Set once step 1 comes back requires2FA:true, so the 2FA screen knows
  /// which pending-token to submit alongside the code.
  String? pendingTfaToken;

  Future<void> bootstrap() async {
    await ApiClient.instance.init();
    final ok = await _fetchSession();
    status = ok ? AuthStatus.authenticated : AuthStatus.unauthenticated;
    notifyListeners();
  }

  Future<bool> _fetchSession() async {
    try {
      final session = await ApiClient.instance.fetchSession();
      if (session == null) return false;
      user = AdminUser.fromJson(session);
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Returns true if login completed immediately, false if a 2FA step is
  /// now required (pendingTfaToken is set in that case).
  Future<bool> login(String username, String password) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final pre = await ApiClient.instance.preLogin(username, password);
      if (pre['requires2FA'] == true) {
        pendingTfaToken = pre['token']?.toString();
        return false;
      }

      await ApiClient.instance.signInWithPassword(username, password);
      final ok = await _fetchSession();
      if (!ok) throw ApiException('Login gagal, sesi tidak ditemukan.');
      status = AuthStatus.authenticated;
      return true;
    } on ApiException catch (e) {
      error = e.message;
      rethrow;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  void cancelTwoFactor() {
    pendingTfaToken = null;
    notifyListeners();
  }

  Future<void> verifyTwoFactor(String code) async {
    if (pendingTfaToken == null) throw ApiException('Sesi login tidak valid, ulangi login.');
    loading = true;
    error = null;
    notifyListeners();
    try {
      await ApiClient.instance.signInWithTwoFactor(pendingTfaToken!, code);
      final ok = await _fetchSession();
      if (!ok) throw ApiException('Verifikasi gagal, sesi tidak ditemukan.');
      pendingTfaToken = null;
      status = AuthStatus.authenticated;
    } on ApiException catch (e) {
      error = e.message;
      rethrow;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    await ApiClient.instance.signOut();
    user = null;
    status = AuthStatus.unauthenticated;
    notifyListeners();
  }

  /// Called by ApiClient when any request comes back 401 (expired/revoked session).
  void forceLogout() {
    if (status != AuthStatus.authenticated) return;
    ApiClient.instance.clearSession();
    user = null;
    status = AuthStatus.unauthenticated;
    notifyListeners();
  }
}
