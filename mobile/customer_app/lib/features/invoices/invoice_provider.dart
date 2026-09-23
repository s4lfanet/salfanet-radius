import 'package:flutter/foundation.dart';
import '../../core/api/api_client.dart';
import '../../models/invoice.dart';

class InvoiceProvider extends ChangeNotifier {
  List<Invoice> invoices = [];
  bool loading = false;
  String? error;
  bool _loadedOnce = false;

  Invoice? get nextUnpaid {
    final unpaid = invoices.where((i) => i.isPayable).toList()
      ..sort((a, b) => a.dueDate.compareTo(b.dueDate));
    return unpaid.isEmpty ? null : unpaid.first;
  }

  Future<void> load({bool force = false}) async {
    if (_loadedOnce && !force) return;
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await ApiClient.instance.get('/api/customer/invoices', query: {'page': 1, 'limit': 50});
      final data = res['data'] as Map<String, dynamic>? ?? const {};
      final page = InvoicePage.fromJson(data);
      invoices = page.invoices;
      _loadedOnce = true;
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<String> requestPaymentLink(String invoiceId) async {
    final res = await ApiClient.instance.get('/api/customer/invoices/payment', query: {'invoiceId': invoiceId});
    final link = res['paymentLink']?.toString();
    if (link == null || link.isEmpty) {
      throw ApiException('Tautan pembayaran tidak tersedia.');
    }
    return link;
  }
}
