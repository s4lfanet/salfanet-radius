import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import '../../models/manual_payment.dart';

class ManualPaymentProvider extends ChangeNotifier {
  List<ManualPayment> payments = [];
  bool loading = false;
  String? error;
  String status = 'PENDING';

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await ApiClient.instance.get('/api/manual-payments', query: {'status': status});
      if (res is Map<String, dynamic> && res['data'] is List) {
        payments = (res['data'] as List).map((e) => ManualPayment.fromJson(e as Map<String, dynamic>)).toList();
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

  Future<void> approve(String id) async {
    await ApiClient.instance.patch('/api/manual-payments/$id', data: {'action': 'APPROVE'});
    await load();
  }

  Future<void> reject(String id, String reason) async {
    await ApiClient.instance.patch('/api/manual-payments/$id', data: {'action': 'REJECT', 'rejectionReason': reason});
    await load();
  }
}
