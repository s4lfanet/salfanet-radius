import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';

/// The collector's bell: stored notifications with their read state, same
/// endpoint as the web portal's bell (/api/collector/notifications).
class NotificationsProvider extends ChangeNotifier {
  List<Map<String, dynamic>> events = [];
  int unreadCount = 0;
  bool loading = false;
  String? error;

  Future<void> load({bool quiet = false}) async {
    if (!quiet) {
      loading = true;
      error = null;
      notifyListeners();
    }
    try {
      final res = await ApiClient.instance.get('/api/collector/notifications');
      if (res is Map) {
        events = [for (final e in res['events'] is List ? res['events'] as List : const []) Map<String, dynamic>.from(e as Map)];
        unreadCount = num.tryParse('${res['unread']}')?.toInt() ?? events.where((e) => e['read'] != true).length;
        error = null;
      }
    } on ApiException catch (e) {
      // A quiet refresh (after a push) keeps what is on screen on failure.
      if (!quiet) error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// Marks one notification read, locally first so the badge drops at once.
  Future<void> markRead(String id) async {
    final i = events.indexWhere((e) => e['id'] == id);
    if (i < 0 || events[i]['read'] == true) return;
    events[i] = {...events[i], 'read': true};
    if (unreadCount > 0) unreadCount--;
    notifyListeners();
    try {
      await ApiClient.instance.post('/api/collector/notifications', data: {'ids': [id]});
    } on ApiException {
      await load(quiet: true);
    }
  }

  Future<void> markAllRead() async {
    if (unreadCount == 0) return;
    events = [for (final e in events) {...e, 'read': true}];
    unreadCount = 0;
    notifyListeners();
    try {
      await ApiClient.instance.post('/api/collector/notifications', data: {'all': true});
    } on ApiException {
      await load(quiet: true);
    }
  }

  void clear() {
    events = [];
    unreadCount = 0;
    error = null;
    notifyListeners();
  }
}
