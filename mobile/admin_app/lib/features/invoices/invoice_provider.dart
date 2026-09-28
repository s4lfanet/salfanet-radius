import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import '../../models/invoice.dart';

class InvoiceProvider extends ChangeNotifier {
  List<Invoice> invoices = [];
  InvoiceStats? stats;
  bool loading = false;
  bool loadingMore = false;
  String? error;
  String search = '';
  String status = 'UNPAID'; // UNPAID | PAID | all
  int page = 1;
  int totalPages = 1;

  Future<void> load({bool reset = true}) async {
    if (reset) {
      page = 1;
      loading = true;
    } else {
      loadingMore = true;
    }
    error = null;
    notifyListeners();
    try {
      final res = await ApiClient.instance.get('/api/invoices', query: {
        'page': page,
        'limit': 30,
        'status': status,
        if (search.isNotEmpty) 'search': search,
      });
      if (res is Map<String, dynamic>) {
        final list = (res['invoices'] as List? ?? []).map((e) => Invoice.fromJson(e as Map<String, dynamic>)).toList();
        totalPages = res['totalPages'] is num ? (res['totalPages'] as num).toInt() : 1;
        if (res['stats'] is Map) {
          stats = InvoiceStats.fromJson((res['stats'] as Map).cast<String, dynamic>());
        }
        invoices = reset ? list : [...invoices, ...list];
      }
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      loadingMore = false;
      notifyListeners();
    }
  }

  Future<void> loadMore() async {
    if (loadingMore || page >= totalPages) return;
    page += 1;
    await load(reset: false);
  }

  void setSearch(String q) {
    search = q;
    load();
  }

  void setStatus(String s) {
    status = s;
    load();
  }

  Future<void> markPaid(String invoiceId) async {
    await ApiClient.instance.put('/api/invoices', data: {'id': invoiceId, 'status': 'PAID'});
    await load();
  }
}
