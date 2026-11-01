import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import '../../core/push/push_service.dart';
import '../../models/collector_user.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthProvider extends ChangeNotifier {
  AuthStatus status = AuthStatus.unknown;
  CollectorUser? user;
  String? error;
  bool loading = false;

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
      user = CollectorUser.fromJson(session);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> login(String username, String password) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      await ApiClient.instance.signIn(username, password);
      final ok = await _fetchSession();
      if (!ok) throw ApiException('Login gagal, sesi tidak ditemukan.');
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
    // Before signOut: the token is removed with this collector's session, so
    // the phone stops getting this account's alerts.
    await PushService.instance.onSigningOut();
    await ApiClient.instance.signOut();
    user = null;
    status = AuthStatus.unauthenticated;
    notifyListeners();
  }

  /// Called by ApiClient when any request comes back 401.
  void forceLogout() {
    if (status != AuthStatus.authenticated) return;
    PushService.instance.signedIn = false;
    ApiClient.instance.clearSession();
    user = null;
    status = AuthStatus.unauthenticated;
    notifyListeners();
  }
}
