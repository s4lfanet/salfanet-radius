import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import '../../core/push/push_service.dart';
import '../../models/agent_user.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthProvider extends ChangeNotifier {
  AuthStatus status = AuthStatus.unknown;
  AgentUser? user;
  bool loading = false;

  Future<void> bootstrap() async {
    await ApiClient.instance.init();
    var ok = false;
    if (ApiClient.instance.hasToken) {
      try {
        // Any authenticated call tells whether the saved token still works.
        final res = await ApiClient.instance.get('/api/agent/dashboard', query: {'limit': 1});
        final a = res is Map ? res['agent'] : null;
        if (a is Map) {
          user = AgentUser.fromJson(Map<String, dynamic>.from(a));
          ok = true;
        }
      } catch (_) {}
    }
    status = ok ? AuthStatus.authenticated : AuthStatus.unauthenticated;
    notifyListeners();
    if (ok) PushService.instance.onSignedIn();
  }

  /// Step 1. Returns true when a code was sent and must be entered; false
  /// when the server has OTP off and the agent is already signed in.
  Future<bool> requestLogin(String phone) async {
    loading = true;
    notifyListeners();
    try {
      final res = await ApiClient.instance.requestLogin(phone);
      if (res['requireOTP'] == true) return true;
      await _finish(res);
      return false;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> verifyOtp(String phone, String code) async {
    loading = true;
    notifyListeners();
    try {
      final res = await ApiClient.instance.verifyOtp(phone, code);
      await _finish(res);
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> _finish(Map<String, dynamic> res) async {
    final token = res['token']?.toString();
    if (token == null || token.isEmpty) throw ApiException('Login gagal, token tidak diterima.');
    await ApiClient.instance.setToken(token);
    final a = res['agent'];
    user = a is Map ? AgentUser.fromJson(Map<String, dynamic>.from(a)) : null;
    status = AuthStatus.authenticated;
    PushService.instance.onSignedIn();
  }

  Future<void> logout() async {
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
