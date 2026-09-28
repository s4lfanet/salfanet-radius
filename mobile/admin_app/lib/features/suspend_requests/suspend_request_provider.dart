import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';

class SuspendRequestProvider extends ChangeNotifier {
  List<Map<String, dynamic>> requests = [];
  bool loading = false;
  String? error;
  String status = 'PENDING';

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await ApiClient.instance.get('/api/admin/suspend-requests', query: {'status': status});
      if (res is Map<String, dynamic>) {
        requests = ((res['rows'] as List?) ?? []).cast<Map<String, dynamic>>();
      }
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  void setStatus(String s) {
    status = s;
    load();
  }

  Future<void> decide(String id, String action, {String? adminNotes}) async {
    await ApiClient.instance.put('/api/admin/suspend-requests/$id', data: {'action': action, 'adminNotes': adminNotes});
    await load();
  }
}
