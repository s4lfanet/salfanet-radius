import 'package:flutter/foundation.dart';
import '../../core/api/api_client.dart';
import '../../models/notification_event.dart';

class NotificationsProvider extends ChangeNotifier {
  List<NotificationEvent> events = [];
  int unreadCount = 0;
  bool loading = false;
  String? error;

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await ApiClient.instance.get('/api/customer/notifications');
      final list = res['events'] as List? ?? const [];
      events = list.map((e) => NotificationEvent.fromJson(e as Map<String, dynamic>)).toList();
      unreadCount = (res['unreadCount'] as num?)?.toInt() ?? 0;
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> markAllRead() async {
    final unreadKeys = events.where((e) => !e.isRead).map((e) => e.id).toList();
    if (unreadKeys.isEmpty) return;
    try {
      await ApiClient.instance.patch('/api/customer/notifications', data: {'eventKeys': unreadKeys});
    } catch (_) {
      return;
    }
    events = events.map((e) => NotificationEvent(
          id: e.id,
          type: e.type,
          title: e.title,
          message: e.message,
          timestamp: e.timestamp,
          isRead: true,
        )).toList();
    unreadCount = 0;
    notifyListeners();
  }
}
