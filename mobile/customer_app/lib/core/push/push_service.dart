import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../../features/notifications/notifications_screen.dart';
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

  /// Lets the notification-tap handlers push a screen without a BuildContext
  /// of their own — wired into MaterialApp in main.dart.
  final navigatorKey = GlobalKey<NavigatorState>();

  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    // Local notifications are set up first and unconditionally. They do not
    // need Firebase, and folding them into the Firebase path meant that on a
    // build without google-services.json the channel was never created and
    // the OS notification permission was never asked for at all.
    await _setupLocalNotifications();

    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp();
      }
      available = true;
    } catch (e) {
      debugPrint('[Push] Firebase not configured, remote push disabled: $e');
      available = false;
      return;
    }

    try {
      await FirebaseMessaging.instance.requestPermission(alert: true, badge: true, sound: true);

      FirebaseMessaging.onMessage.listen(_showForegroundNotification);
      FirebaseMessaging.instance.onTokenRefresh.listen((_) => registerTokenIfReady());
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

      // Tapped while the app was backgrounded (Android auto-displayed the
      // system notification for us — this fires once the app resumes).
      FirebaseMessaging.onMessageOpenedApp.listen((_) => _openNotifications());

      // Cold start: the app was launched BY tapping a notification. The
      // navigator isn't mounted yet at this point in main(), so wait for
      // the first frame before pushing the route.
      final initialMessage = await FirebaseMessaging.instance.getInitialMessage();
      if (initialMessage != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _openNotifications());
      }

      await registerTokenIfReady();
    } catch (e) {
      debugPrint('[Push] Setup failed: $e');
    }
  }

  Future<void> _openNotifications() async {
    final nav = navigatorKey.currentState;
    if (nav == null) return;
    // A stale notification tapped after logout has nowhere useful to go —
    // the API calls the screen makes would just 401.
    if (await SecureStorage.instance.readToken() == null) return;
    // Avoid stacking duplicate copies if the user taps more than one
    // notification, or is already looking at the list.
    nav.popUntil((route) => route.isFirst);
    nav.push(MaterialPageRoute(builder: (_) => const NotificationsScreen()));
  }

  Future<void> _setupLocalNotifications() async {
    try {
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
        onDidReceiveNotificationResponse: (_) => _openNotifications(),
      );
    } catch (e) {
      debugPrint('[Push] Local notification setup failed: $e');
    }
  }

  /// Asks for the Android 13+ notification permission.
  ///
  /// Called after sign-in rather than at cold start: the prompt makes sense
  /// once there is an account whose bills and ticket replies will generate
  /// the notifications. Android only surfaces the dialog once, so calling it
  /// again after a denial returns false without pestering anyone.
  Future<bool> ensureNotificationPermission() async {
    try {
      final android = _localNotifications
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      return await android?.requestNotificationsPermission() ?? false;
    } catch (e) {
      debugPrint('[Push] Notification permission request failed: $e');
      return false;
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
