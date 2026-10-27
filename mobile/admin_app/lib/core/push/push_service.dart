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

/// Must match the admin channel in backend fcm-push.service.ts and the
/// manifest's default_notification_channel_id.
const _channelId = 'salfanet_admin';
const _channelName = 'Notifikasi Admin';
const _pollTask = 'salfanet-admin-notice-poll';

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
  // Background isolate needs its own initializeApp(), with the options the
  // server gave the app last time.
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
      await ApiClient.instance.init();
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

/// Shows unread admin notifications (the web panel's bell, which is also
/// what FCM pushes) created since polling began and not shown here yet.
Future<void> showNewNotices(FlutterLocalNotificationsPlugin plugin) async {
  final since = DateTime.tryParse(await _store.read(key: _sinceKey) ?? '');
  if (since == null) return;

  final dynamic res;
  try {
    res = await ApiClient.instance.get('/api/notifications', query: {'limit': 20, 'unreadOnly': 'true'});
  } on ApiException catch (e) {
    // Signed out or the session expired; the next sign-in schedules it again.
    if (e.statusCode == 401) await Workmanager().cancelByUniqueName(_pollTask);
    return;
  }
  if (res is! Map) return;

  final seenRaw = await _store.read(key: _seenKey);
  final seen = <String>[...?(seenRaw == null ? null : (jsonDecode(seenRaw) as List).cast<String>())];
  final fresh = ((res['notifications'] as List?) ?? const [])
      .whereType<Map>()
      .where((n) {
        final created = DateTime.tryParse(n['createdAt']?.toString() ?? '');
        final id = n['id']?.toString();
        return id != null && n['isRead'] != true && !seen.contains(id) && created != null && created.isAfter(since);
      })
      .take(5)
      .toList()
      .reversed;

  for (final n in fresh) {
    final id = n['id'].toString();
    await plugin.show(
      _notificationId(id),
      n['title']?.toString(),
      n['message']?.toString(),
      const NotificationDetails(android: AndroidNotificationDetails(_channelId, _channelName, importance: Importance.high)),
    );
    seen.add(id);
  }
  if (fresh.isNotEmpty) {
    await _store.write(key: _seenKey, value: jsonEncode(seen.length > 100 ? seen.sublist(seen.length - 100) : seen));
  }
}

/// Notifications for the admin app, from whichever source the server
/// supports:
/// - Firebase (FCM), with the options the server hands out at
///   /api/public/push-config — nothing Firebase is baked into the APK, so
///   the same APK works with every Salfanet installation;
/// - otherwise polling: a WorkManager task about every 15 minutes, plus
///   every minute while the app is open, over the web panel's notifications.
class PushService with WidgetsBindingObserver {
  PushService._();
  static final PushService instance = PushService._();

  /// True when FCM is running and tokens can be registered.
  bool available = false;
  bool _initialized = false;
  bool _firebaseStarted = false;
  bool _polling = false;
  Timer? _foregroundPoll;

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

    // Local notifications first and unconditionally: both sources need the
    // channel, and polling shows everything through it.
    await _setupLocalNotifications();
    try {
      await Workmanager().initialize(noticePollDispatcher);
    } catch (e) {
      debugPrint('[Push] WorkManager unavailable: $e');
    }
    WidgetsBinding.instance.addObserver(this);
    await ApiClient.instance.init();

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
      final res = await ApiClient.instance.get('/api/public/push-config', query: {'app': 'admin'});
      if (res is! Map<String, dynamic> || res['mode'] is! String) return;
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
    await registerToken();
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
      FirebaseMessaging.instance.onTokenRefresh.listen((_) => registerToken());
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
      FirebaseMessaging.onMessageOpenedApp.listen((_) => _openNotifications());
      // Cold start from a tapped notification: the navigator is not mounted
      // yet, so wait for the first frame.
      final initial = await FirebaseMessaging.instance.getInitialMessage();
      if (initial != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _openNotifications());
      }
      if (signedIn) await FirebaseMessaging.instance.requestPermission(alert: true, badge: true, sound: true);
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

  Future<void> _syncPolling() async {
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
        // signedIn turns false on a forced logout (expired session) without a
        // call back here; stop then instead of hitting a 401 every minute.
        _foregroundPoll ??= Timer.periodic(const Duration(minutes: 1), (t) {
          if (!signedIn) {
            t.cancel();
            _foregroundPoll = null;
            return;
          }
          showNewNotices(_localNotifications);
        });
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
    await _syncPolling();
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
        _initSettings,
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

  /// Registers the FCM token, or starts polling when this server has no
  /// Firebase.
  Future<void> registerToken() async {
    await _syncPolling();
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
