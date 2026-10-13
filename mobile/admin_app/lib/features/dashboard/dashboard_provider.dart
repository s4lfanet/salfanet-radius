import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import '../../models/dashboard_stats.dart';

class DashboardProvider extends ChangeNotifier {
  DashboardStats? stats;

  /// Latest settled invoices, newest first (web "Aktivitas Pembayaran").
  List<Map<String, dynamic>> payments = const [];

  /// Customers registered in the selected month.
  List<Map<String, dynamic>> newCustomers = const [];

  /// Ledger income vs expense for the last six months, oldest first.
  List<Map<String, dynamic>> incomeExpense = const [];

  /// `yyyy-MM`, or null for the current month.
  String? month;
  bool loading = false;
  String? error;

  void setMonth(String? value) {
    month = value;
    stats = null;
    load();
  }

  Future<void> load() async {
    loading = stats == null;
    error = null;
    notifyListeners();
    final q = {if (month != null) 'month': month};
    try {
      final results = await Future.wait([
        ApiClient.instance.get('/api/dashboard/stats', query: q),
        _radiusRunning(),
        _optional(() => ApiClient.instance.get('/api/dashboard/payment-activity', query: {'limit': 5})),
        _optional(() => ApiClient.instance.get('/api/dashboard/new-customers', query: q)),
        _optional(() => ApiClient.instance.get('/api/dashboard/analytics', query: {'type': 'financial'})),
      ]);
      final res = results[0];
      if (res is Map<String, dynamic>) {
        stats = DashboardStats.fromJson(res);
        final running = results[1] as bool?;
        if (running != null) stats!.radiusOnline = running;
      }
      payments = _list(results[2], 'activities');
      newCustomers = _list(results[3], 'customers');
      final analytics = results[4];
      final data = analytics is Map ? analytics['data'] : null;
      final financial = data is Map ? data['financial'] : null;
      incomeExpense = _list(financial, 'incomeExpense');
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  static List<Map<String, dynamic>> _list(dynamic res, String key) {
    final v = res is Map ? res[key] : null;
    return v is List ? v.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList() : const [];
  }

  /// Secondary panels: a missing permission or a slow query hides that
  /// panel instead of failing the whole dashboard.
  static Future<dynamic> _optional(Future<dynamic> Function() call) async {
    try {
      return await call();
    } on ApiException catch (_) {
      return null;
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
