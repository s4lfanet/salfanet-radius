import 'package:flutter/foundation.dart';
import '../../core/api/api_client.dart';

class RenewalProvider extends ChangeNotifier {
  bool loading = false;
  bool submitting = false;
  bool canRenew = false;
  String? blockedReason;
  Map<String, dynamic>? blockingInvoice;
  String? error;

  Future<void> checkStatus() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await ApiClient.instance.get('/api/customer/renewal');
      canRenew = res['canRenew'] == true;
      blockedReason = res['reason']?.toString();
      blockingInvoice = res['invoice'] as Map<String, dynamic>?;
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// Returns the created invoice's paymentLink (if any) for the caller to open.
  Future<String?> renew() async {
    submitting = true;
    notifyListeners();
    try {
      final res = await ApiClient.instance.post('/api/customer/renewal');
      final invoice = res['invoice'] as Map<String, dynamic>?;
      return invoice?['paymentLink']?.toString();
    } finally {
      submitting = false;
      notifyListeners();
    }
  }
}
