import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import '../../models/registration.dart';

class RegistrationProvider extends ChangeNotifier {
  List<Registration> registrations = [];
  RegistrationStats? stats;
  bool loading = false;
  String? error;
  String status = 'PENDING';

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await ApiClient.instance.get('/api/admin/registrations', query: {'status': status});
      if (res is Map<String, dynamic>) {
        registrations = (res['registrations'] as List? ?? []).map((e) => Registration.fromJson(e as Map<String, dynamic>)).toList();
        if (res['stats'] is Map) {
          stats = RegistrationStats.fromJson((res['stats'] as Map).cast<String, dynamic>());
        }
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

  Future<Map<String, dynamic>> approve(String id, Map<String, dynamic> body) async {
    final res = await ApiClient.instance.post('/api/admin/registrations/$id/approve', data: body);
    await load();
    return res is Map<String, dynamic> ? res : {};
  }

  Future<void> markInstalled(String id) async {
    await ApiClient.instance.post('/api/admin/registrations/$id/mark-installed');
    await load();
  }

  Future<void> reject(String id, String reason) async {
    await ApiClient.instance.post('/api/admin/registrations/$id/reject', data: {'reason': reason});
    await load();
  }
}
