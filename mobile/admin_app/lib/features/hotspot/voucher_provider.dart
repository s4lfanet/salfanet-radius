import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';

class VoucherProvider extends ChangeNotifier {
  List<Map<String, dynamic>> vouchers = [];
  bool loading = false;
  bool generating = false;
  String? error;
  String status = 'all';

  List<Map<String, dynamic>> profiles = [];
  List<Map<String, dynamic>> routers = [];

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await ApiClient.instance.get('/api/hotspot/voucher', query: {'status': status, 'limit': 50});
      if (res is Map<String, dynamic>) {
        vouchers = ((res['vouchers'] as List?) ?? []).cast<Map<String, dynamic>>();
      }
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> loadOptions() async {
    try {
      final results = await Future.wait([
        ApiClient.instance.get('/api/hotspot/profiles'),
        ApiClient.instance.get('/api/network/routers'),
      ]);
      profiles = ((results[0] as Map?)?['profiles'] as List? ?? []).cast<Map<String, dynamic>>();
      routers = ((results[1] as Map?)?['routers'] as List? ?? []).cast<Map<String, dynamic>>();
      notifyListeners();
    } on ApiException catch (_) {
      // Non-fatal — the generate form still works with router left unset.
    }
  }

  void setStatus(String s) {
    status = s;
    load();
  }

  Future<int> generate({required int quantity, required String profileId, String? routerId, String? prefix}) async {
    generating = true;
    notifyListeners();
    try {
      final res = await ApiClient.instance.post('/api/hotspot/voucher', data: {
        'quantity': quantity,
        'profileId': profileId,
        if (routerId != null) 'routerId': routerId,
        if (prefix != null && prefix.isNotEmpty) 'prefix': prefix,
      });
      await load();
      return res is Map && res['count'] is num ? (res['count'] as num).toInt() : quantity;
    } finally {
      generating = false;
      notifyListeners();
    }
  }
}
