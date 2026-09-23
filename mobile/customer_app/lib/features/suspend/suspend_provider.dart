import 'package:flutter/foundation.dart';
import '../../core/api/api_client.dart';
import '../../models/suspend_request.dart';

class SuspendProvider extends ChangeNotifier {
  SuspendRequestModel? current;
  bool loading = false;
  bool submitting = false;
  String? error;

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await ApiClient.instance.get('/api/customer/suspend-request');
      final data = res['data'];
      current = data is Map<String, dynamic> ? SuspendRequestModel.fromJson(data) : null;
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> requestSuspend({required DateTime start, required DateTime end, String? reason}) async {
    submitting = true;
    notifyListeners();
    try {
      await ApiClient.instance.post('/api/customer/suspend-request', data: {
        'startDate': start.toIso8601String(),
        'endDate': end.toIso8601String(),
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      });
      await load();
    } finally {
      submitting = false;
      notifyListeners();
    }
  }

  Future<void> cancel(String id) async {
    submitting = true;
    notifyListeners();
    try {
      await ApiClient.instance.delete('/api/customer/suspend-request', query: {'id': id});
      await load();
    } finally {
      submitting = false;
      notifyListeners();
    }
  }
}
