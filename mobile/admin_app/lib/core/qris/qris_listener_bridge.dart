import 'package:flutter/services.dart';

/// State of the native Kasir QRIS listener on this phone.
class QrisListenerStatus {
  QrisListenerStatus(Map<Object?, Object?> m)
    : accessGranted = m['accessGranted'] == true,
      batteryUnrestricted = m['batteryUnrestricted'] == true,
      enabled = m['enabled'] == true,
      voice = m['voice'] != false,
      serverUrl = (m['serverUrl'] ?? '').toString(),
      deviceKey = (m['deviceKey'] ?? '').toString(),
      hasSecret = m['hasSecret'] == true,
      heartbeatAt = (m['heartbeatAt'] as num?)?.toInt() ?? 0,
      lastResult = (m['lastResult'] ?? '').toString(),
      queueSize = (m['queueSize'] as num?)?.toInt() ?? 0,
      recent = ((m['recent'] as List?) ?? const []).map((e) => (e as Map).map((k, v) => MapEntry(k.toString(), (v ?? '').toString()))).toList();

  final bool accessGranted;
  final bool batteryUnrestricted;
  final bool enabled;
  final bool voice;
  final String serverUrl;
  final String deviceKey;
  final bool hasSecret;
  final int heartbeatAt;
  final String lastResult;
  final int queueSize;
  final List<Map<String, String>> recent;

  DateTime? get lastBeat => heartbeatAt > 0 ? DateTime.fromMillisecondsSinceEpoch(heartbeatAt) : null;

  /// The listener beats every 5 minutes while Android keeps it bound.
  bool get alive => lastBeat != null && DateTime.now().difference(lastBeat!) < const Duration(minutes: 11);
}

/// Calls into the native listener (android/app/src/main/kotlin/.../qris).
class QrisListenerBridge {
  QrisListenerBridge._();
  static final instance = QrisListenerBridge._();

  static const _channel = MethodChannel('salfanet/qris_listener');

  Future<QrisListenerStatus> status() async => QrisListenerStatus((await _channel.invokeMethod<Map<Object?, Object?>>('status')) ?? const {});

  Future<QrisListenerStatus> configure({required String serverUrl, required String deviceKey, required String deviceSecret, required bool enabled}) async =>
      QrisListenerStatus(
        (await _channel.invokeMethod<Map<Object?, Object?>>('configure', {
              'serverUrl': serverUrl,
              'deviceKey': deviceKey,
              'deviceSecret': deviceSecret,
              'enabled': enabled,
            })) ??
            const {},
      );

  Future<void> setVoice(bool enabled) => _channel.invokeMethod('setVoice', {'enabled': enabled});
  Future<void> openNotificationAccess() => _channel.invokeMethod('openNotificationAccess');
  Future<void> openBatteryOptimization() => _channel.invokeMethod('openBatteryOptimization');

  /// "vendor" when a phone maker's autostart screen opened, "app" otherwise.
  Future<String> openAutostart() async => (await _channel.invokeMethod<String>('openAutostart')) ?? 'app';
  Future<void> reconnect() => _channel.invokeMethod('reconnect');

  /// "ok", "no_indonesian" (spoke with the default voice) or "no_engine".
  Future<String> testVoice() async => (await _channel.invokeMethod<String>('testVoice')) ?? 'no_engine';

  Future<(bool, String)> testConnection() async {
    final r = (await _channel.invokeMethod<Map<Object?, Object?>>('testConnection')) ?? const {};
    return (r['ok'] == true, (r['message'] ?? '').toString());
  }
}
