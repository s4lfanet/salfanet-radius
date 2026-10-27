import 'dart:async';
import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:workmanager/workmanager.dart';
import '../../features/notifications/notifications_screen.dart';
import '../api/api_client.dart';
import '../storage/secure_storage.dart';

/// Must match the androidnotification.channelId the backend sends in
/// fcm-push.service.ts, and the manifest's default_notification_channel_id.
const _channelId = 'salfanet_customer';
const _channelName = 'Notifikasi Salfanet';
const _pollTask = 'salfanet-notice-poll';

const _store = FlutterSecureStorage(aOptions: AndroidOptions(encryptedSharedPreferences: true));
const _configKey = 'push_config';
const _sinceKey = 'push_poll_since';
const _seenKey = 'push_poll_seen';

const _initSettings = InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher'));

FirebaseOptions? _optionsFrom(dynamic fcm) {
  if (fcm is! Map) return null;
  final apiKey = fcm['apiKey'], appId = fcm['appId'], sender = fcm['messagingSenderId'], project = fcm['projectId'];
  if (apiKey is! String || appId is! String || sender is! String || project is! String) return null;
  return FirebaseOptions(
    apiKey: apiKey,
    appId: appId,
    messagingSenderId: sender,
    projectId: project,
    storageBucket: fcm['storageBucket'] is String ? fcm['storageBucket'] as String : null,
  );
}

Future<Map<String, dynamic>?> _cachedConfig() async {
  try {
    final raw = await _store.read(key: _configKey);
    final decoded = raw == null ? null : jsonDecode(raw);
    return decoded is Map<String, dynamic> ? decoded : null;
  } catch (_) {
    return null;
  }
}

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Background isolate: Firebase needs its own initializeApp(), with the
  // options the server gave the app last time.
  try {
    final options = _optionsFrom((await _cachedConfig())?['fcm']);
    if (options != null && Firebase.apps.isEmpty) await Firebase.initializeApp(options: options);
  } catch (_) {}
}

/// WorkManager entry point: runs about every 15 minutes while the server has
/// no Firebase, even with the app closed.
@pragma('vm:entry-point')
void noticePollDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    try {
      await ApiClient.instance.restoreSavedBaseUrl();
      final plugin = FlutterLocalNotificationsPlugin();
      await plugin.initialize(_initSettings);
      await showNewNotices(plugin);
    } catch (_) {}
    return true;
  });
}

/// Stable across isolates and app restarts, so a notice shown by both the
/// background task and the foreground timer replaces itself instead of
/// appearing twice.
int _notificationId(String key) {
  var hash = 0x811c9dc5;
  for (final unit in key.codeUnits) {
    hash = ((hash ^ unit) * 0x01000193) & 0x7fffffff;
  }
  return hash;
}

/// Shows the pushes the server stored for this customer since polling began
/// that this phone has not shown yet.
Future<void> showNewNotices(FlutterLocalNotificationsPlugin plugin) async {
  if (await SecureStorage.instance.readToken() == null) return;
  final since = DateTime.tryParse(await _store.read(key: _sinceKey) ?? '');
  if (since == null) {
    await _store.write(key: _sinceKey, value: DateTime.now().toUtc().toIso8601String());
    return;
  }

  final Map<String, dynamic> res;
  try {
    res = await ApiClient.instance.get('/api/customer/app-notices');
  } on ApiException catch (e) {
    if (e.statusCode == 401) await Workmanager().cancelByUniqueName(_pollTask);
    return;
  }

  final seenRaw = await _store.read(key: _seenKey);
  final seen = <String>[...?(seenRaw == null ? null : (jsonDecode(seenRaw) as List).cast<String>())];
  final fresh = ((res['notices'] as List?) ?? const [])
      .whereType<Map>()
      .where((n) {
        final created = DateTime.tryParse(n['createdAt']?.toString() ?? '');
        return n['id'] is String && !seen.contains(n['id']) && created != null && created.isAfter(since);
      })
      .take(5)
      .toList()
      .reversed;

  for (final n in fresh) {
    final id = n['id'] as String;
    await plugin.show(
      _notificationId(id),
      n['title']?.toString(),
      n['body']?.toString(),
      const NotificationDetails(android: AndroidNotificationDetails(_channelId, _channelName, importance: Importance.high)),
    );
    seen.add(id);
  }
  if (fresh.isNotEmpty) {
    await _store.write(key: _seenKey, value: jsonEncode(seen.length > 100 ? seen.sublist(seen.length - 100) : seen));
  }
}

/// Notifications for the customer app, from whichever source the server
/// supports:
/// - Firebase (FCM), with the options the server hands out at
///   /api/public/push-config — nothing Firebase is baked into the APK, so
///   the same APK works with every Salfanet installation;
/// - otherwise polling: a WorkManager task about every 15 minutes, plus
///   every minute while the app is open, showing what the server stored at
///   /api/customer/app-notices.
class PushService with WidgetsBindingObserver {
  PushService._();
  static final PushService instance = PushService._();

  /// True when FCM is running and tokens can be registered.
  bool available = false;
  bool _initialized = false;
  bool _firebaseStarted = false;
  bool _polling = false;
  Timer? _foregroundPoll;
  final _localNotifications = FlutterLocalNotificationsPlugin();

  /// Lets the notification-tap handlers push a screen without a BuildContext
  /// of their own — wired into MaterialApp in main.dart.
  final navigatorKey = GlobalKey<NavigatorState>();

  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    // Local notifications first and unconditionally: both sources need the
    // channel, and polling shows everything through it.
    await _setupLocalNotifications();
    try {
      await Workmanager().initialize(noticePollDispatcher);
    } catch (e) {
      debugPrint('[Push] WorkManager unavailable: $e');
    }
    WidgetsBinding.instance.addObserver(this);

    // The last config first, so a cold start from a tapped push works
    // offline; then ask the server whether it changed.
    final cached = await _cachedConfig();
    if (cached != null) await _apply(cached);
    unawaited(_refreshConfig());

    try {
      final launch = await _localNotifications.getNotificationAppLaunchDetails();
      if (launch?.didNotificationLaunchApp ?? false) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _openNotifications());
      }
    } catch (_) {}
  }

  Future<void> _refreshConfig() async {
    try {
      final res = await ApiClient.instance.get('/api/public/push-config', query: {'app': 'customer'});
      if (res['mode'] is! String) return;
      await _store.write(key: _configKey, value: jsonEncode(res));
      await _apply(res);
    } catch (e) {
      // Offline or an older server without this endpoint: keep the last mode.
      debugPrint('[Push] Could not refresh push config: $e');
      if (!_firebaseStarted) await _apply(const {'mode': 'poll'});
    }
  }

  Future<void> _apply(Map<String, dynamic> config) async {
    final options = config['mode'] == 'fcm' ? _optionsFrom(config['fcm']) : null;
    available = options != null && await _startFirebase(options);
    await registerTokenIfReady();
  }

  /// Firebase can only be started once per process; a different project
  /// from the server takes effect on the next app start.
  Future<bool> _startFirebase(FirebaseOptions options) async {
    if (_firebaseStarted) {
      final current = Firebase.app().options;
      return current.projectId == options.projectId && current.appId == options.appId;
    }
    try {
      if (Firebase.apps.isEmpty) await Firebase.initializeApp(options: options);
      _firebaseStarted = true;
      FirebaseMessaging.onMessage.listen(_showForegroundNotification);
      FirebaseMessaging.instance.onTokenRefresh.listen((_) => registerTokenIfReady());
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
      // Tapped while the app was backgrounded (Android showed the system
      // notification itself); fires once the app resumes.
      FirebaseMessaging.onMessageOpenedApp.listen((_) => _openNotifications());
      // Cold start by tapping a notification: the navigator is not mounted
      // yet in main(), so wait for the first frame.
      final initialMessage = await FirebaseMessaging.instance.getInitialMessage();
      if (initialMessage != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _openNotifications());
      }
      return true;
    } catch (e) {
      debugPrint('[Push] Firebase start failed, using polling: $e');
      return false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Picks up Firebase being set up (or removed) on the server meanwhile.
      unawaited(_refreshConfig());
    } else if (state == AppLifecycleState.paused) {
      _foregroundPoll?.cancel();
      _foregroundPoll = null;
    }
  }

  Future<void> _syncPolling({required bool signedIn}) async {
    final poll = !available && signedIn;
    try {
      if (poll) {
        if (await _store.read(key: _sinceKey) == null) {
          await _store.write(key: _sinceKey, value: DateTime.now().toUtc().toIso8601String());
        }
        if (!_polling) {
          await Workmanager().registerPeriodicTask(
            _pollTask,
            _pollTask,
            frequency: const Duration(minutes: 15),
            constraints: Constraints(networkType: NetworkType.connected),
            existingWorkPolicy: ExistingPeriodicWorkPolicy.keep,
          );
        }
        _foregroundPoll ??= Timer.periodic(const Duration(minutes: 1), (_) => showNewNotices(_localNotifications));
        unawaited(showNewNotices(_localNotifications));
      } else {
        // Also clears a task left from an earlier run in polling mode.
        await Workmanager().cancelByUniqueName(_pollTask);
        _foregroundPoll?.cancel();
        _foregroundPoll = null;
        if (!signedIn) {
          await _store.delete(key: _sinceKey);
          await _store.delete(key: _seenKey);
        }
      }
      _polling = poll;
    } catch (e) {
      debugPrint('[Push] Polling setup failed: $e');
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
        _channelName,
        description: 'Tagihan, tiket, dan info akun Anda',
        importance: Importance.high,
      );
      await _localNotifications
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(androidChannel);

      await _localNotifications.initialize(
        _initSettings,
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
        android: AndroidNotificationDetails(_channelId, _channelName, importance: Importance.high),
      ),
    );
  }

  /// Registers the FCM token with the backend, or starts polling when this
  /// server has no Firebase — only meaningful once the customer is logged in
  /// (the endpoints require a Bearer token), so call this again right after
  /// login/OTP-verify succeeds.
  Future<void> registerTokenIfReady() async {
    final signedIn = await SecureStorage.instance.readToken() != null;
    await _syncPolling(signedIn: signedIn);
    if (!available || !signedIn) return;

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

  /// On logout: removes the FCM token and stops polling for this account.
  Future<void> unregisterToken() async {
    await _syncPolling(signedIn: false);
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
