import 'package:flutter/foundation.dart';

import '../../core/push/push_service.dart';
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
    if (ok) PushService.instance.onSignedIn();
  }

  Future<bool> _fetchSession() async {
    try {
      final session = await ApiClient.instance.fetchSession();
      if (session == null) return false;
      user = AdminUser.fromJson(session);
      user!.permissions = await _loadPermissions(user!.id);
      return true;
    } catch (_) {
      return false;
    }
  }

  /// The account's own permissions; null when they cannot be read, so the
  /// app shows every menu rather than locking the account out.
  static Future<Set<String>?> _loadPermissions(String userId) async {
    if (userId.isEmpty) return null;
    try {
      final res = await ApiClient.instance.get('/api/admin/users/$userId/permissions');
      final list = res is Map ? res['permissions'] : null;
      if (res is! Map || res['success'] != true || res['warning'] != null || list is! List || list.isEmpty) return null;
      return {for (final p in list) p.toString()};
    } catch (_) {
      return null;
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
      PushService.instance.onSignedIn();
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
      PushService.instance.onSignedIn();
    } on ApiException catch (e) {
      error = e.message;
      rethrow;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    // Before signOut: the token is removed with this admin's session, so the
    // phone stops getting this account's alerts.
    await PushService.instance.onSigningOut();
    await ApiClient.instance.signOut();
    user = null;
    status = AuthStatus.unauthenticated;
    notifyListeners();
  }

  /// Called by ApiClient when any request comes back 401 (expired/revoked session).
  void forceLogout() {
    if (status != AuthStatus.authenticated) return;
    // Session already gone server-side; the token row is cleaned up when
    // FCM later reports it stale or another account registers it.
    PushService.instance.signedIn = false;
    ApiClient.instance.clearSession();
    user = null;
    status = AuthStatus.unauthenticated;
    notifyListeners();
  }
}
