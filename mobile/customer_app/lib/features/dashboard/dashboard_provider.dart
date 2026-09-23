import 'package:flutter/foundation.dart';
import '../../core/api/api_client.dart';
import '../../models/dashboard_data.dart';

class DashboardProvider extends ChangeNotifier {
  DashboardData? data;
  bool loading = false;
  String? error;

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await ApiClient.instance.get('/api/customer/dashboard');
      if (res['success'] == true && res['data'] is Map<String, dynamic>) {
        data = DashboardData.fromJson(res['data']);
      }
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }
}
