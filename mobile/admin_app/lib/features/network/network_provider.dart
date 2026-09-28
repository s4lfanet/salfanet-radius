import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';

class NetworkProvider extends ChangeNotifier {
  List<Map<String, dynamic>> routers = [];
  Map<String, Map<String, dynamic>> statusMap = {};
  bool loading = false;
  bool checkingStatus = false;
  String? error;

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await ApiClient.instance.get('/api/network/routers');
      if (res is Map<String, dynamic>) {
        routers = ((res['routers'] as List?) ?? []).cast<Map<String, dynamic>>();
      }
      loading = false;
      notifyListeners();
      await _checkStatus();
    } on ApiException catch (e) {
      error = e.message;
      loading = false;
      notifyListeners();
    }
  }

  Future<void> _checkStatus() async {
    if (routers.isEmpty) return;
    checkingStatus = true;
    notifyListeners();
    try {
      final res = await ApiClient.instance.post('/api/network/routers/status', data: {
        'routerIds': routers.map((r) => r['id']).toList(),
      });
      if (res is Map<String, dynamic> && res['statusMap'] is Map) {
        statusMap = (res['statusMap'] as Map).map((k, v) => MapEntry(k.toString(), (v as Map).cast<String, dynamic>()));
      }
    } on ApiException catch (_) {
      // Non-fatal — the router list itself already loaded; status just stays unknown.
    } finally {
      checkingStatus = false;
      notifyListeners();
    }
  }
}
