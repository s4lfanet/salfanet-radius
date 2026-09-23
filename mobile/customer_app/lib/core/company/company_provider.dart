import 'package:flutter/foundation.dart';
import '../api/api_client.dart';
import '../../models/company_info.dart';

/// Every Salfanet Radius install is a different ISP with its own name and
/// logo — loaded once from the public (no-auth) endpoint so branding (login
/// screen, dashboard header, invoice PDF) reflects whichever operator this
/// build is pointed at, never a fixed identity.
class CompanyProvider extends ChangeNotifier {
  CompanyInfo? info;
  bool loading = false;

  Future<void> load() async {
    loading = true;
    notifyListeners();
    try {
      final res = await ApiClient.instance.get('/api/public/company');
      if (res['success'] == true && res['company'] is Map<String, dynamic>) {
        info = CompanyInfo.fromJson(res['company']);
      }
    } catch (_) {
      // Branding is cosmetic — a failed fetch just falls back to generic UI.
    } finally {
      loading = false;
      notifyListeners();
    }
  }
}
