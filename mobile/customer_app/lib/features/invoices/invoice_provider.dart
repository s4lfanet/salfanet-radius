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

  /// The invoice's payment token, which /api/payment/create needs as proof
  /// that this customer may pay this invoice.
  Future<String> requestPaymentToken(String invoiceId) async {
    final res = await ApiClient.instance.get('/api/customer/invoices/payment', query: {'invoiceId': invoiceId});
    final token = res['paymentToken']?.toString();
    if (token != null && token.isNotEmpty) return token;
    // Older servers only return the /pay/{token} link.
    final segs = Uri.tryParse(res['paymentLink']?.toString() ?? '')?.pathSegments ?? const [];
    final i = segs.indexOf('pay');
    if (i >= 0 && i + 1 < segs.length) return segs[i + 1];
    throw ApiException('Tagihan ini belum siap dibayar. Coba lagi sebentar, atau hubungi admin.');
  }
}
