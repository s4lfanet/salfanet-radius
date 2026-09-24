import 'package:flutter/foundation.dart';
import '../../core/api/api_client.dart';
import '../../models/dashboard_data.dart';

class DashboardProvider extends ChangeNotifier {
  DashboardData? data;
  bool loading = false;
  String? error;

  /// When [data] was last actually fetched — shown to the customer so "live"
  /// connection status is a claim backed by a real timestamp, not decoration.
  DateTime? lastUpdated;

  /// [silent] skips the loading flag so a background poll (see
  /// DashboardScreen's periodic refresh) doesn't swap the screen to a spinner
  /// while data the customer is already looking at is still valid.
  Future<void> load({bool silent = false}) async {
    if (!silent) {
      loading = true;
      error = null;
      notifyListeners();
    }
    try {
      final res = await ApiClient.instance.get('/api/customer/dashboard');
      if (res['success'] == true && res['data'] is Map<String, dynamic>) {
        data = DashboardData.fromJson(res['data']);
        lastUpdated = DateTime.now();
        error = null;
      }
    } on ApiException catch (e) {
      // A background poll that fails leaves the last-known data on screen
      // rather than replacing it with an error the customer didn't ask for.
      if (!silent) error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }
}
