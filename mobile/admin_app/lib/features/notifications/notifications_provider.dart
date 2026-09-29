import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';

class NotificationsProvider extends ChangeNotifier {
  List<Map<String, dynamic>> notifications = [];
  int unreadCount = 0;
  bool loading = false;
  String? error;

  Future<void> load() async {
    loading = notifications.isEmpty;
    error = null;
    notifyListeners();
    try {
      final res = await ApiClient.instance.get('/api/notifications', query: {'limit': 50});
      if (res is Map<String, dynamic>) {
        notifications = ((res['notifications'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
        unreadCount = res['unreadCount'] is num ? (res['unreadCount'] as num).toInt() : 0;
      }
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> delete(String id) async {
    await ApiClient.instance.delete('/api/notifications', query: {'id': id});
    notifications.removeWhere((n) => n['id'] == id);
    notifyListeners();
  }

  /// Clears everything already read — the web's bulk delete over the
  /// read rows.
  Future<void> deleteRead() async {
    final ids = notifications.where((n) => n['isRead'] == true).map((n) => n['id'].toString()).toList();
    if (ids.isEmpty) return;
    await ApiClient.instance.delete('/api/notifications', query: {'ids': ids.join(',')});
    await load();
  }

  Future<void> markAllRead() async {
    await ApiClient.instance.put('/api/notifications', data: {'markAll': true});
    await load();
  }

  /// Optimistic: the row un-bolds immediately; a failed request just means
  /// it shows as unread again on the next refresh.
  Future<void> markRead(String id) async {
    final i = notifications.indexWhere((n) => n['id'] == id);
    if (i < 0 || notifications[i]['isRead'] == true) return;
    notifications[i] = {...notifications[i], 'isRead': true};
    if (unreadCount > 0) unreadCount--;
    notifyListeners();
    try {
      await ApiClient.instance.put(
        '/api/notifications',
        data: {
          'notificationIds': [id],
        },
      );
    } on ApiException catch (_) {}
  }
}
