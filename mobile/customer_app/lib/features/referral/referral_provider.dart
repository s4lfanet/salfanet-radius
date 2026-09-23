import 'package:flutter/foundation.dart';
import '../../core/api/api_client.dart';
import '../../models/referral.dart';

class ReferralProvider extends ChangeNotifier {
  ReferralInfo? info;
  bool loading = false;
  bool generating = false;
  String? error;

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await ApiClient.instance.get('/api/customer/referral');
      if (res['success'] == true) {
        info = ReferralInfo.fromJson(res);
      }
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> generateCode() async {
    generating = true;
    notifyListeners();
    try {
      await ApiClient.instance.post('/api/customer/referral');
      await load();
    } finally {
      generating = false;
      notifyListeners();
    }
  }
}
