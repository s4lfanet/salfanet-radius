import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import '../../models/pppoe_user.dart';
import 'online_status.dart';

class PppoeProvider extends ChangeNotifier {
  List<PppoeUser> users = [];
  bool loading = false;
  bool loadingMore = false;
  String? error;
  String search = '';
  String? statusFilter; // null = default (excludes stop/pending/rejected)
  int page = 1;
  int totalPages = 1;
  int total = 0;

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
      final res = await ApiClient.instance.get(
        '/api/pppoe/users',
        query: {'page': page, 'limit': 30, if (search.isNotEmpty) 'search': search, if (statusFilter != null) 'status': statusFilter},
      );
      if (res is Map<String, dynamic>) {
        final list = (res['users'] as List? ?? []).map((e) => PppoeUser.fromJson(e as Map<String, dynamic>)).toList();
        total = res['total'] is num ? (res['total'] as num).toInt() : 0;
        totalPages = res['totalPages'] is num ? (res['totalPages'] as num).toInt() : 1;
        if (reset) {
          users = list;
        } else {
          users = [...users, ...list];
        }
        // Show the rows right away; correct the online dots once the
        // fuller check comes back.
        _applyOnline(list);
      }
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      loadingMore = false;
      notifyListeners();
    }
  }

  Future<void> _applyOnline(List<PppoeUser> subset) async {
    final online = await fetchOnlineUsernames(subset.where((u) => u.status != 'stop').map((u) => u.username));
    if (online == null) return;
    for (final u in subset) {
      u.isOnline = u.status != 'stop' && online.contains(u.username);
    }
    notifyListeners();
  }

  /// Re-checks online state for every loaded row (polled by the list
  /// screen while it's visible, like the web list).
  Future<void> refreshOnline() => _applyOnline(users);

  Future<void> loadMore() async {
    if (loadingMore || page >= totalPages) return;
    page += 1;
    await load(reset: false);
  }

  void setSearch(String q) {
    search = q;
    load();
  }

  void setStatusFilter(String? status) {
    statusFilter = status;
    load();
  }
}
