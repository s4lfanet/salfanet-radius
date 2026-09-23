import 'package:flutter/foundation.dart';
import '../../core/api/api_client.dart';
import '../../models/promo_banner.dart';

class PromoProvider extends ChangeNotifier {
  List<PromoBanner> banners = [];
  bool loading = false;

  Future<void> load() async {
    loading = true;
    notifyListeners();
    try {
      final res = await ApiClient.instance.get('/api/public/promo-banners');
      if (res['success'] == true) {
        final list = res['banners'] as List? ?? const [];
        banners = list.map((e) => PromoBanner.fromJson(e as Map<String, dynamic>)).toList();
      }
    } catch (_) {
      // Promo banners are optional decoration — a failed fetch just hides the section.
    } finally {
      loading = false;
      notifyListeners();
    }
  }
}
