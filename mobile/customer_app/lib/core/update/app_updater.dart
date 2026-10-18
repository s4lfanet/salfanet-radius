import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/api_client.dart';

/// In-app update for the APK installed outside the Play Store.
///
/// The server publishes the APK uploaded in Download APK with its build
/// number (/api/public/apk-releases). When that build is newer than the
/// installed one, the app offers it, downloads it and opens Android's
/// installer. Android always asks the user to confirm the install; the
/// first time it also asks to allow this app as an install source.
/// Below the release's minVersionCode the update is required.
class AppUpdater {
  AppUpdater._();

  static const _channel = MethodChannel('salfanet/updater');
  static const _target = 'customer';
  static bool _checkedOnLaunch = false;

  /// Installed version, or null when not running as an Android app (tests, web).
  static Future<({int code, String name})?> installed() async {
    if (!Platform.isAndroid) return null;
    try {
      final info = await _channel.invokeMapMethod<String, dynamic>('info');
      if (info == null) return null;
      return (code: (info['versionCode'] as num).toInt(), name: (info['versionName'] ?? '').toString());
    } on MissingPluginException {
      return null;
    } on PlatformException {
      return null;
    }
  }

  /// Once per app start, after sign-in. Quiet when there is nothing to do.
  static Future<void> checkOnLaunch(BuildContext context) async {
    if (_checkedOnLaunch) return;
    _checkedOnLaunch = true;
    await check(context);
  }

  /// [manual] reports "already up to date" and errors; the launch check stays quiet.
  static Future<void> check(BuildContext context, {bool manual = false}) async {
    void say(String msg) {
      if (manual && context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    }

    final current = await installed();
    if (current == null) return say('Pembaruan hanya tersedia di aplikasi Android.');
    _Release? release;
    try {
      final res = await ApiClient.instance.get('/api/public/apk-releases');
      final r = (res as Map)['releases']?[_target];
      if (r is Map && r['available'] == true && r['versionCode'] is num && r['url'] is String) {
        release = _Release.fromJson(Map<String, dynamic>.from(r));
      }
    } catch (_) {
      return say('Gagal memeriksa pembaruan. Periksa koneksi lalu coba lagi.');
    }
    if (release == null || release.versionCode <= current.code) {
      return say('Aplikasi sudah versi terbaru (${current.name}).');
    }
    if (!context.mounted) return;
    final required = release.minVersionCode != null && current.code < release.minVersionCode!;
    final offer = release;
    await showDialog<void>(
      context: context,
      barrierDismissible: !required,
      builder: (_) => PopScope(canPop: !required, child: _UpdateDialog(release: offer, required: required)),
    );
  }
}

class _Release {
  _Release({required this.versionCode, required this.url, this.versionName, this.minVersionCode, this.size, this.note});
  final int versionCode;
  final String url;
  final String? versionName;
  final int? minVersionCode;
  final int? size;
  final String? note;

  factory _Release.fromJson(Map<String, dynamic> j) {
    final note = j['note']?.toString().trim();
    return _Release(
      versionCode: (j['versionCode'] as num).toInt(),
      url: j['url'] as String,
      versionName: j['versionName']?.toString(),
      minVersionCode: (j['minVersionCode'] as num?)?.toInt(),
      size: (j['size'] as num?)?.toInt(),
      note: note == null || note.isEmpty ? null : note,
    );
  }
}

enum _Step { offer, downloading, permission, ready, failed }

class _UpdateDialog extends StatefulWidget {
  const _UpdateDialog({required this.release, required this.required});
  final _Release release;
  final bool required;

  @override
  State<_UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends State<_UpdateDialog> with WidgetsBindingObserver {
  _Step _step = _Step.offer;
  double? _progress;
  String? _error;
  File? _apk;
  CancelToken? _cancel;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _cancel?.cancel();
    super.dispose();
  }

  // Back from the "install unknown apps" settings: continue if it was allowed.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _step == _Step.permission) _install();
  }

  String get _fullUrl {
    final u = widget.release.url;
    if (Uri.parse(u).hasScheme) return u;
    return '${ApiClient.instance.baseUrl.replaceFirst(RegExp(r'/+$'), '')}$u';
  }

  Future<void> _download() async {
    setState(() {
      _step = _Step.downloading;
      _progress = null;
      _error = null;
    });
    try {
      final info = await AppUpdater._channel.invokeMapMethod<String, dynamic>('info');
      final dir = Directory(info!['updatesDir'] as String);
      final file = File('${dir.path}/update-${widget.release.versionCode}.apk');
      // Older downloads are not needed any more.
      for (final f in dir.listSync().whereType<File>()) {
        if (f.path != file.path) f.deleteSync();
      }
      final expected = widget.release.size;
      if (!(file.existsSync() && expected != null && file.lengthSync() == expected)) {
        _cancel = CancelToken();
        final part = File('${file.path}.part');
        await Dio().download(
          _fullUrl,
          part.path,
          cancelToken: _cancel,
          onReceiveProgress: (got, total) {
            final t = total > 0 ? total : (expected ?? 0);
            if (mounted && t > 0) setState(() => _progress = got / t);
          },
        );
        if (expected != null && part.lengthSync() != expected) {
          part.deleteSync();
          throw const FileSystemException('Unduhan tidak lengkap');
        }
        part.renameSync(file.path);
      }
      _apk = file;
      await _install();
    } on DioException catch (e) {
      if (CancelToken.isCancel(e)) return;
      _fail('Unduhan gagal. Periksa koneksi lalu coba lagi.');
    } catch (_) {
      _fail('Unduhan gagal. Coba lagi.');
    }
  }

  Future<void> _install() async {
    final apk = _apk;
    if (apk == null) return;
    try {
      final allowed = await AppUpdater._channel.invokeMethod<bool>('canInstall') ?? false;
      if (!allowed) {
        if (mounted) setState(() => _step = _Step.permission);
        return;
      }
      if (mounted) setState(() => _step = _Step.ready);
      await AppUpdater._channel.invokeMethod('install', {'path': apk.path});
    } on PlatformException {
      _fail('Pemasang Android tidak bisa dibuka. Coba lagi.');
    }
  }

  void _fail(String msg) {
    if (!mounted) return;
    setState(() {
      _step = _Step.failed;
      _error = msg;
    });
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.release;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final sizeMb = r.size != null ? ' · ${(r.size! / (1024 * 1024)).toStringAsFixed(1)} MB' : '';

    final status = switch (_step) {
      _Step.offer => Text('Data dan login Anda tetap tersimpan.', style: text.bodySmall?.copyWith(color: muted)),
      _Step.downloading => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          LinearProgressIndicator(value: _progress),
          const SizedBox(height: 6),
          Text(_progress == null ? 'Mengunduh...' : 'Mengunduh ${(_progress! * 100).round()}%', style: text.bodySmall?.copyWith(color: muted)),
        ],
      ),
      _Step.permission => Text(
        'Android perlu izin sekali untuk memasang pembaruan dari aplikasi ini. Buka pengaturan, aktifkan "Izinkan dari sumber ini", lalu kembali ke sini.',
        style: text.bodySmall,
      ),
      _Step.ready => Text('Ikuti layar pemasangan Android, lalu tekan Update atau Instal.', style: text.bodySmall),
      _Step.failed => Text(_error ?? 'Gagal.', style: text.bodySmall?.copyWith(color: Theme.of(context).colorScheme.error)),
    };

    final primary = switch (_step) {
      _Step.offer => FilledButton(onPressed: _download, child: const Text('Perbarui')),
      _Step.downloading => const FilledButton(onPressed: null, child: Text('Mengunduh')),
      _Step.permission => FilledButton(
        onPressed: () => AppUpdater._channel.invokeMethod('openInstallPermission'),
        child: const Text('Buka pengaturan'),
      ),
      _Step.ready => FilledButton(onPressed: _install, child: const Text('Pasang')),
      _Step.failed => FilledButton(onPressed: _download, child: const Text('Coba lagi')),
    };

    return AlertDialog(
      title: Text(widget.required ? 'Pembaruan wajib' : 'Pembaruan tersedia'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Versi ${r.versionName ?? r.versionCode}$sizeMb', style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
            if (r.note != null) ...[const SizedBox(height: 6), Text(r.note!, style: text.bodyMedium)],
            if (widget.required) ...[
              const SizedBox(height: 10),
              Text('Versi yang terpasang sudah tidak didukung. Perbarui dulu untuk lanjut memakai aplikasi.', style: text.bodySmall?.copyWith(color: muted)),
            ],
            const SizedBox(height: 12),
            status,
          ],
        ),
      ),
      actions: [
        if (!widget.required)
          TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(_step == _Step.offer ? 'Nanti' : 'Tutup')),
        primary,
      ],
    );
  }
}

/// App name, version and build with a manual "Cek pembaruan" button, for the profile / more screens.
class AppVersionFooter extends StatefulWidget {
  const AppVersionFooter({super.key, required this.appName});
  final String appName;

  @override
  State<AppVersionFooter> createState() => _AppVersionFooterState();
}

class _AppVersionFooterState extends State<AppVersionFooter> {
  ({int code, String name})? _v;
  bool _checking = false;

  @override
  void initState() {
    super.initState();
    AppUpdater.installed().then((v) {
      if (mounted) setState(() => _v = v);
    });
  }

  Future<void> _check() async {
    setState(() => _checking = true);
    await AppUpdater.check(context, manual: true);
    if (mounted) setState(() => _checking = false);
  }

  @override
  Widget build(BuildContext context) {
    final v = _v;
    if (v == null) return const SizedBox.shrink();
    return Column(
      children: [
        Text('${widget.appName} ${v.name} (${v.code})', style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
        TextButton(onPressed: _checking ? null : _check, child: Text(_checking ? 'Memeriksa...' : 'Cek pembaruan')),
      ],
    );
  }
}
