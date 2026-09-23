import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../api/api_client.dart';
import '../storage/secure_storage.dart';

/// Must match the androidnotification.channelId the backend sends in
/// fcm-push.service.ts, and the manifest's default_notification_channel_id.
const _channelId = 'salfanet_customer';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Background isolate: Firebase needs its own initializeApp() call here.
  // No-ops (with a caught error) until google-services.json is configured,
  // same as the foreground path.
  try {
    await Firebase.initializeApp();
  } catch (_) {
    // Firebase not configured for this build — nothing to do.
  }
}

/// Wraps Firebase Cloud Messaging registration for the customer app.
///
/// Deliberately fails soft everywhere: until a real Firebase project's
/// google-services.json is dropped into android/app/, `available` stays
/// false and every method below is a silent no-op, mirroring the backend's
/// fcm-push.service.ts behavior when FIREBASE_SERVICE_ACCOUNT_JSON is unset.
class PushService {
  PushService._();
  static final PushService instance = PushService._();

  bool available = false;
  bool _initialized = false;
  final _localNotifications = FlutterLocalNotificationsPlugin();

  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp();
      }
      available = true;
    } catch (e) {
      debugPrint('[Push] Firebase not configured, push disabled: $e');
      available = false;
      return;
    }

    try {
      await FirebaseMessaging.instance.requestPermission(alert: true, badge: true, sound: true);

      const androidChannel = AndroidNotificationChannel(
        _channelId,
        'Notifikasi Salfanet',
        description: 'Tagihan, tiket, dan info akun Anda',
        importance: Importance.high,
      );
      await _localNotifications
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(androidChannel);

      await _localNotifications.initialize(
        const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')),
      );

      FirebaseMessaging.onMessage.listen(_showForegroundNotification);
      FirebaseMessaging.instance.onTokenRefresh.listen((_) => registerTokenIfReady());
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

      await registerTokenIfReady();
    } catch (e) {
      debugPrint('[Push] Setup failed: $e');
    }
  }

  void _showForegroundNotification(RemoteMessage message) {
    final notification = message.notification;
    if (notification == null) return;
    _localNotifications.show(
      notification.hashCode,
      notification.title,
      notification.body,
      const NotificationDetails(
        android: AndroidNotificationDetails(_channelId, 'Notifikasi Salfanet', importance: Importance.high),
      ),
    );
  }

  /// Registers the current FCM token with the backend — only meaningful once
  /// the customer is logged in (the endpoint requires a Bearer token), so
  /// call this again right after login/OTP-verify succeeds.
  Future<void> registerTokenIfReady() async {
    if (!available) return;
    final sessionToken = await SecureStorage.instance.readToken();
    if (sessionToken == null) return;

    try {
      final fcmToken = await FirebaseMessaging.instance.getToken();
      if (fcmToken == null) return;
      await ApiClient.instance.post('/api/customer/push-token', data: {
        'token': fcmToken,
        'platform': 'android',
      });
    } catch (e) {
      debugPrint('[Push] Token registration failed: $e');
    }
  }

  Future<void> unregisterToken() async {
    if (!available) return;
    try {
      final fcmToken = await FirebaseMessaging.instance.getToken();
      if (fcmToken == null) return;
      await ApiClient.instance.delete('/api/customer/push-token', query: {'token': fcmToken});
    } catch (e) {
      debugPrint('[Push] Token unregistration failed: $e');
    }
  }
}
