import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';

/// Pending PPPoE self-registrations awaiting manual vetting before their
/// account is allowed to connect — distinct from the Registrasi module,
/// which creates the pppoeUser record itself as part of approval.
class ApprovalProvider extends ChangeNotifier {
  List<Map<String, dynamic>> users = [];
  bool loading = false;
  String? error;

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await ApiClient.instance.get('/api/pppoe/approvals');
      if (res is Map<String, dynamic>) {
        users = ((res['users'] as List?) ?? []).cast<Map<String, dynamic>>();
      }
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> approve(String userId) async {
    await ApiClient.instance.post('/api/pppoe/approvals', data: {'userId': userId, 'action': 'approve'});
    await load();
  }

  Future<void> reject(String userId, String reason) async {
    await ApiClient.instance.post('/api/pppoe/approvals', data: {'userId': userId, 'action': 'reject', 'reason': reason});
    await load();
  }
}
