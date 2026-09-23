import 'package:flutter/foundation.dart';
import '../../core/api/api_client.dart';
import '../../models/package_option.dart';

class UpgradeProvider extends ChangeNotifier {
  List<PackageOption> packages = [];
  List<PaymentGatewayOption> gateways = [];
  bool loading = false;
  bool submitting = false;
  String? error;

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final results = await Future.wait([
        ApiClient.instance.get('/api/public/profiles'),
        ApiClient.instance.get('/api/public/payment-gateways'),
      ]);
      final profileList = results[0]['profiles'] as List? ?? const [];
      packages = profileList.map((e) => PackageOption.fromJson(e as Map<String, dynamic>)).toList();
      final gatewayList = results[1]['gateways'] as List? ?? const [];
      gateways = gatewayList.map((e) => PaymentGatewayOption.fromJson(e as Map<String, dynamic>)).toList();
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// Gateway-based upgrade — returns a payment URL to open, or null when the
  /// gateway didn't return one (rare; invoice still gets created).
  Future<String?> upgradeWithGateway({required String packageId, required String gateway}) async {
    submitting = true;
    notifyListeners();
    try {
      final res = await ApiClient.instance.post('/api/customer/upgrade', data: {
        'newProfileId': packageId,
        'gateway': gateway,
      });
      return res['paymentUrl']?.toString();
    } finally {
      submitting = false;
      notifyListeners();
    }
  }

  /// Manual upgrade (no gateway) — creates an invoice the customer pays
  /// through the regular Tagihan flow.
  Future<String?> upgradeManual({required String packageId}) async {
    submitting = true;
    notifyListeners();
    try {
      final res = await ApiClient.instance.post('/api/customer/upgrade-package', data: {'packageId': packageId});
      return res['paymentLink']?.toString();
    } finally {
      submitting = false;
      notifyListeners();
    }
  }
}
