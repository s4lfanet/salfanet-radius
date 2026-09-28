import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import '../../models/dashboard_stats.dart';

class DashboardProvider extends ChangeNotifier {
  DashboardStats? stats;
  bool loading = false;
  String? error;

  Future<void> load() async {
    loading = stats == null;
    error = null;
    notifyListeners();
    try {
      final results = await Future.wait([
        ApiClient.instance.get('/api/dashboard/stats'),
        _radiusRunning(),
      ]);
      final res = results[0];
      if (res is Map<String, dynamic>) {
        stats = DashboardStats.fromJson(res);
        final running = results[1] as bool?;
        if (running != null) stats!.radiusOnline = running;
      }
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// The stats endpoint's RADIUS flag was a heuristic ("a session started
  /// in the last hour") that reads offline on any stable network. The
  /// FreeRADIUS status page's endpoint asks systemd for the real service
  /// state, so prefer it. Needs settings.view — returns null (keep the
  /// stats value) for accounts without it or on any failure.
  Future<bool?> _radiusRunning() async {
    try {
      final res = await ApiClient.instance.get('/api/freeradius/status');
      final status = (res is Map) ? res['status'] : null;
      if (status is Map && status['running'] is bool) return status['running'] as bool;
    } on ApiException catch (_) {}
    return null;
  }
}
