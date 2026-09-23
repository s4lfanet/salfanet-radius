import 'dart:io';
import 'package:dio/dio.dart' as dio;
import 'package:flutter/foundation.dart';
import '../../core/api/api_client.dart';
import '../../models/package_option.dart';

class TopupProvider extends ChangeNotifier {
  List<PaymentGatewayOption> gateways = [];
  List<PaymentChannel> channels = [];
  bool loadingGateways = false;
  bool loadingChannels = false;
  bool submitting = false;

  Future<void> loadGateways() async {
    if (gateways.isNotEmpty) return;
    loadingGateways = true;
    notifyListeners();
    try {
      final res = await ApiClient.instance.get('/api/public/payment-gateways');
      final list = res['gateways'] as List? ?? const [];
      gateways = list.map((e) => PaymentGatewayOption.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      // Manual top-up (bank transfer + proof) still works without a gateway list.
    } finally {
      loadingGateways = false;
      notifyListeners();
    }
  }

  Future<void> loadChannels(String gateway, int amount) async {
    loadingChannels = true;
    channels = [];
    notifyListeners();
    try {
      final res = await ApiClient.instance.get('/api/customer/payment-methods', query: {'gateway': gateway, 'amount': amount});
      final list = res['methods'] as List? ?? const [];
      channels = list.map((e) => PaymentChannel.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      channels = [];
    } finally {
      loadingChannels = false;
      notifyListeners();
    }
  }

  /// Gateway-based top-up — returns the payment URL to open externally.
  Future<String> topupDirect({required int amount, required String gateway, String? paymentChannel}) async {
    submitting = true;
    notifyListeners();
    try {
      final res = await ApiClient.instance.post('/api/customer/topup-direct', data: {
        'amount': amount,
        'gateway': gateway,
        if (paymentChannel != null) 'paymentChannel': paymentChannel,
      });
      final url = res['paymentUrl']?.toString();
      if (url == null || url.isEmpty) throw ApiException('Tautan pembayaran tidak diterima.');
      return url;
    } finally {
      submitting = false;
      notifyListeners();
    }
  }

  /// Manual top-up — bank transfer with a proof-of-payment photo, reviewed by admin.
  Future<void> topupManual({required int amount, required String paymentMethod, String? note, File? proof}) async {
    submitting = true;
    notifyListeners();
    try {
      final formMap = <String, dynamic>{
        'amount': amount.toString(),
        'paymentMethod': paymentMethod,
        'note': note ?? '',
      };
      if (proof != null) {
        formMap['proof'] = await dio.MultipartFile.fromFile(proof.path, filename: proof.path.split(Platform.pathSeparator).last);
      }
      await ApiClient.instance.postForm('/api/customer/topup-request', dio.FormData.fromMap(formMap));
    } finally {
      submitting = false;
      notifyListeners();
    }
  }
}
