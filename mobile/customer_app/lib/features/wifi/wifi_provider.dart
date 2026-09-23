import 'package:flutter/foundation.dart';
import '../../core/api/api_client.dart';
import '../../models/wifi_device.dart';

class WifiProvider extends ChangeNotifier {
  WifiDevice? device;
  bool loading = false;
  String? error;

  /// Set when the backend responds success:false with a reason (not_configured,
  /// device_not_found, timeout) rather than a hard error — shown as a plain
  /// info message instead of a scary error banner.
  String? infoMessage;

  Future<void> load() async {
    loading = true;
    error = null;
    infoMessage = null;
    notifyListeners();
    try {
      final res = await ApiClient.instance.get('/api/customer/wifi');
      if (res['success'] == true && res['device'] is Map<String, dynamic>) {
        device = WifiDevice.fromJson(res['device']);
      } else {
        device = null;
        infoMessage = _reasonMessage(res['reason']?.toString());
      }
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  String _reasonMessage(String? reason) {
    switch (reason) {
      case 'not_configured':
        return 'Layanan monitoring WiFi belum aktif untuk akun Anda.';
      case 'device_not_found':
        return 'Perangkat WiFi Anda tidak ditemukan. Hubungi CS jika ini tidak sesuai.';
      case 'timeout':
        return 'Perangkat tidak merespons. Perangkat mungkin sedang offline.';
      default:
        return 'Informasi WiFi tidak tersedia saat ini.';
    }
  }

  Future<void> updateWifi({
    required int wlanIndex,
    required String ssid,
    String? password,
  }) async {
    final id = device?.id;
    if (id == null) throw ApiException('Perangkat tidak ditemukan.');
    await ApiClient.instance.post('/api/customer/wifi', data: {
      'deviceId': id,
      'wlanIndex': wlanIndex,
      'ssid': ssid,
      if (password != null && password.trim().isNotEmpty) 'password': password.trim(),
    });
    await load();
  }
}
