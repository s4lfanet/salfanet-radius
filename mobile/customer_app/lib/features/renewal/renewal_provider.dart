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

  /// Creates the renewal invoice and returns it (id, invoiceNumber, amount,
  /// paymentLink) for the caller to pay.
  Future<Map<String, dynamic>?> renew() async {
    submitting = true;
    notifyListeners();
    try {
      final res = await ApiClient.instance.post('/api/customer/renewal');
      return res['invoice'] as Map<String, dynamic>?;
    } finally {
      submitting = false;
      notifyListeners();
    }
  }
}
