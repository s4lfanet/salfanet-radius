import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../../features/notifications/notifications_screen.dart';
import '../api/api_client.dart';

/// Must match the admin channel in backend fcm-push.service.ts and the
/// manifest's default_notification_channel_id.
const _channelId = 'salfanet_admin';
const _channelName = 'Notifikasi Admin';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Background isolate needs its own initializeApp(); fails quietly on a
  // build without google-services.json, like the foreground path.
  try {
    await Firebase.initializeApp();
  } catch (_) {}
}

/// Firebase Cloud Messaging for the admin app, built like the customer
/// app's PushService. Every admin notification the backend creates (the
/// web panel's bell) arrives here as a push.
///
/// Fails soft everywhere: until android/app/google-services.json is added,
/// [available] stays false and every method is a no-op, matching the
/// backend when FIREBASE_SERVICE_ACCOUNT_JSON is unset.
class PushService {
  PushService._();
  static final PushService instance = PushService._();

  bool available = false;
  bool _initialized = false;

  /// Set by AuthProvider. A notification tapped after logout has nowhere to
  /// go (the screen's API calls would 401), and tokens are only registered
  /// for a signed-in admin.
  bool signedIn = false;

  final _localNotifications = FlutterLocalNotificationsPlugin();

  /// Lets tap handlers open a screen without a BuildContext of their own;
  /// wired into MaterialApp in main.dart.
  final navigatorKey = GlobalKey<NavigatorState>();

  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    // Local notifications first and unconditionally: they need no Firebase,
    // and the channel must exist before the first push arrives.
    await _setupLocalNotifications();

    try {
      if (Firebase.apps.isEmpty) await Firebase.initializeApp();
      available = true;
    } catch (e) {
      debugPrint('[Push] Firebase not configured, remote push disabled: $e');
      return;
    }

    try {
      FirebaseMessaging.onMessage.listen(_showForegroundNotification);
      FirebaseMessaging.instance.onTokenRefresh.listen((_) => registerToken());
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
      FirebaseMessaging.onMessageOpenedApp.listen((_) => _openNotifications());

      // Cold start from a tapped notification: the navigator is not mounted
      // yet, so wait for the first frame.
      final initial = await FirebaseMessaging.instance.getInitialMessage();
      if (initial != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _openNotifications());
      }
    } catch (e) {
      debugPrint('[Push] Setup failed: $e');
    }
  }

  /// Called once an admin session exists (cold start with a saved session,
  /// login, or 2FA). Asks for the Android 13+ permission here rather than at
  /// launch, when there is an account whose alerts it is for.
  Future<void> onSignedIn() async {
    signedIn = true;
    await _requestPermission();
    await registerToken();
  }

  Future<void> onSigningOut() async {
    await unregisterToken();
    signedIn = false;
  }

  Future<void> _openNotifications() async {
    final nav = navigatorKey.currentState;
    if (nav == null || !signedIn) return;
    // Don't stack copies when several notifications are tapped.
    nav.popUntil((route) => route.isFirst);
    nav.push(MaterialPageRoute(builder: (_) => const NotificationsScreen()));
  }

  Future<void> _setupLocalNotifications() async {
    try {
      const channel = AndroidNotificationChannel(
        _channelId,
        _channelName,
        description: 'Pembayaran, registrasi, tiket, dan peringatan sistem',
        importance: Importance.high,
      );
      await _localNotifications
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(channel);
      await _localNotifications.initialize(
        const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')),
        onDidReceiveNotificationResponse: (_) => _openNotifications(),
      );
    } catch (e) {
      debugPrint('[Push] Local notification setup failed: $e');
    }
  }

  Future<void> _requestPermission() async {
    try {
      await _localNotifications
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.requestNotificationsPermission();
      if (available) await FirebaseMessaging.instance.requestPermission(alert: true, badge: true, sound: true);
    } catch (e) {
      debugPrint('[Push] Permission request failed: $e');
    }
  }

  /// Android shows nothing for a push that arrives while the app is open,
  /// so show it ourselves.
  void _showForegroundNotification(RemoteMessage message) {
    final n = message.notification;
    if (n == null) return;
    _localNotifications.show(
      n.hashCode,
      n.title,
      n.body,
      const NotificationDetails(android: AndroidNotificationDetails(_channelId, _channelName, importance: Importance.high)),
    );
  }

  Future<void> registerToken() async {
    if (!available || !signedIn) return;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null) return;
      await ApiClient.instance.post('/api/admin/push-token', data: {'token': token, 'platform': 'android'});
    } catch (e) {
      debugPrint('[Push] Token registration failed: $e');
    }
  }

  Future<void> unregisterToken() async {
    if (!available || !signedIn) return;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null) return;
      await ApiClient.instance.delete('/api/admin/push-token', query: {'token': token});
    } catch (e) {
      debugPrint('[Push] Token unregistration failed: $e');
    }
  }
}
