import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/qris/qris_listener_bridge.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

/// Kasir QRIS: turns this phone into the QRIS listener. It reads the payment
/// notifications DANA, banks and other e-wallets post on the phone that
/// receives the QRIS money, and reports them to the server, which matches
/// the amount to the waiting order and marks it paid.
///
/// Meant for one phone only. The device key and secret come from the
/// server with the staff login, so nothing is typed or pasted.
class QrisCashierScreen extends StatefulWidget {
  const QrisCashierScreen({super.key});

  @override
  State<QrisCashierScreen> createState() => _QrisCashierScreenState();
}

class _QrisCashierScreenState extends State<QrisCashierScreen> with WidgetsBindingObserver {
  final _bridge = QrisListenerBridge.instance;
  QrisListenerStatus? _status;
  String? _error;
  bool _busy = false;
  String? _testResult;
  bool? _testOk;
  Timer? _poll;

  static const _apps = {
    'id.dana': 'DANA',
    'com.gojek.app': 'GoPay',
    'com.shopee.id': 'ShopeePay',
    'ovo.id': 'OVO',
    'id.co.bri.brimo': 'BRImo',
    'com.bca': 'BCA mobile',
    'id.bmri.livin': "Livin' Mandiri",
  };

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refresh();
    // While the screen is open, show the listener's latest state.
    _poll = Timer.periodic(const Duration(seconds: 5), (_) => _refresh());
  }

  @override
  void dispose() {
    _poll?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Coming back from Android settings (notification access, battery).
    if (state == AppLifecycleState.resumed) _refresh();
  }

  Future<void> _refresh() async {
    try {
      final s = await _bridge.status();
      if (mounted) {
        setState(() {
          _status = s;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = 'Fitur ini hanya tersedia di aplikasi Android ($e).');
    }
  }

  String get _notifyUrl => '${ApiClient.instance.baseUrl.replaceFirst(RegExp(r'/+$'), '')}/api/payment/qris-notify';

  Future<void> _setEnabled(bool on) async {
    setState(() => _busy = true);
    try {
      if (!on) {
        final s = _status!;
        _status = await _bridge.configure(serverUrl: s.serverUrl, deviceKey: s.deviceKey, deviceSecret: '', enabled: false);
        if (mounted) showToast(context, 'Kasir QRIS dimatikan di HP ini.');
        return;
      }
      // Credentials straight from the server: copy-paste mistakes in the
      // secret were the usual reason payments went unmatched.
      final res = await ApiClient.instance.get('/api/payment-gateway/qris-mandiri');
      final cfg = res is Map ? res.cast<String, dynamic>() : <String, dynamic>{};
      final key = (cfg['qrisDeviceKey'] ?? '').toString();
      final secret = (cfg['qrisDeviceSecret'] ?? '').toString();
      if (cfg['qrisEnabled'] != true) {
        throw ApiException('QRIS Mandiri belum aktif. Aktifkan dulu di Lainnya > Payment Gateway > QRIS Mandiri.');
      }
      if (key.isEmpty || secret.isEmpty) {
        throw ApiException('Device Key atau Device Secret belum dibuat di pengaturan QRIS Mandiri.');
      }
      _status = await _bridge.configure(serverUrl: _notifyUrl, deviceKey: key, deviceSecret: secret, enabled: true);
      if (mounted && !_status!.accessGranted) {
        final open = await confirmAction(
          context,
          title: 'Izinkan baca notifikasi',
          message:
              'Android perlu izin agar aplikasi ini bisa membaca notifikasi pembayaran DANA dan bank. '
              'Di layar berikutnya, aktifkan "Salfanet Admin".',
          confirmLabel: 'Buka pengaturan',
        );
        if (open) await _bridge.openNotificationAccess();
      }
    } catch (e) {
      if (mounted) showToast(context, e is ApiException ? e.message : 'Gagal: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
      _refresh();
    }
  }

  Future<void> _testConnection() async {
    setState(() {
      _testResult = 'Menguji...';
      _testOk = null;
    });
    final (ok, msg) = await _bridge.testConnection();
    if (mounted) {
      setState(() {
        _testOk = ok;
        _testResult = msg;
      });
    }
  }

  Future<void> _testVoice() async {
    final r = await _bridge.testVoice();
    if (!mounted) return;
    if (r == 'no_engine') showToast(context, 'HP ini tidak punya mesin suara (Text-to-Speech).');
    if (r == 'no_indonesian') showToast(context, 'Suara Bahasa Indonesia belum terpasang. Pasang di Pengaturan > Text-to-Speech.');
  }

  @override
  Widget build(BuildContext context) {
    final s = _status;
    return Scaffold(
      appBar: AppBar(title: const Text('Kasir QRIS')),
      body: _error != null
          ? ErrorView(message: _error!)
          : s == null
          ? const LoadingView()
          : RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, Gap.xl * 2),
                children: [
                  _Hero(status: s, busy: _busy, onToggle: _setEnabled),
                  DetailSection(
                    title: 'Persiapan HP ini',
                    rows: const [],
                    trailing: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: Gap.lg, vertical: Gap.sm),
                      child: Column(
                        children: [
                          _CheckRow(label: 'Izin baca notifikasi', done: s.accessGranted, action: 'Izinkan', onAction: _bridge.openNotificationAccess),
                          _CheckRow(label: 'Baterai tidak dibatasi', done: s.batteryUnrestricted, action: 'Atur', onAction: _bridge.openBatteryOptimization),
                          _CheckRow(
                            label: 'Autostart / jalan di latar',
                            done: null,
                            action: 'Buka',
                            onAction: () async {
                              final where = await _bridge.openAutostart();
                              if (context.mounted && where == 'app') {
                                showToast(context, 'Pilih Baterai > Tidak dibatasi, lalu izinkan aktivitas latar.');
                              }
                            },
                          ),
                        ],
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(Gap.xs, Gap.sm, Gap.xs, 0),
                    child: Text(
                      'Jangan tutup aplikasi dengan menggeser dari daftar aplikasi terbaru; di Xiaomi, Oppo dan Vivo '
                      'itu menghentikan pemantauan. Kunci aplikasi di daftar terbaru bila HP menyediakannya.',
                      style: TextStyle(fontSize: 12, height: 1.4, color: context.colors.onSurfaceVariant),
                    ),
                  ),
                  DetailSection(
                    title: 'Koneksi server',
                    rows: [
                      InfoRow('Server', Uri.tryParse(s.serverUrl)?.host ?? (s.serverUrl.isEmpty ? null : s.serverUrl)),
                      InfoRow('Device Key', s.deviceKey.isEmpty ? null : s.deviceKey, copyable: true),
                      InfoRow('Device Secret', s.hasSecret ? 'Tersimpan di HP ini' : 'Belum ada'),
                      InfoRow('Antrean kirim ulang', s.queueSize == 0 ? 'Kosong' : '${s.queueSize} notifikasi menunggu sinyal'),
                    ],
                  ),
                  const SizedBox(height: Gap.sm),
                  OutlinedButton.icon(
                    onPressed: s.deviceKey.isEmpty ? null : _testConnection,
                    icon: const Icon(Icons.wifi_tethering_rounded),
                    label: const Text('Tes koneksi ke server'),
                  ),
                  if (_testResult != null)
                    Padding(
                      padding: const EdgeInsets.only(top: Gap.sm),
                      child: Text(
                        _testResult!,
                        style: TextStyle(
                          fontSize: 13,
                          color: _testOk == null ? context.colors.onSurfaceVariant : context.tone(_testOk! ? Tone.success : Tone.danger),
                        ),
                      ),
                    ),
                  DetailSection(
                    title: 'Suara pembayaran',
                    rows: const [],
                    trailing: Padding(
                      padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.xs, Gap.sm, Gap.xs),
                      child: Column(
                        children: [
                          SwitchListTile(
                            contentPadding: EdgeInsets.zero,
                            title: const Text('Bacakan nominal yang masuk', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                            subtitle: const Text('Lewat volume media, misalnya "Pembayaran DANA diterima, tiga ribu rupiah".'),
                            value: s.voice,
                            onChanged: (v) async {
                              await _bridge.setVoice(v);
                              _refresh();
                            },
                          ),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: TextButton.icon(onPressed: _testVoice, icon: const Icon(Icons.volume_up_rounded), label: const Text('Tes suara')),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: Gap.xl),
                  const SectionHeader('Notifikasi terakhir'),
                  if (s.lastResult.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: Gap.sm),
                      child: Text(s.lastResult, style: TextStyle(fontSize: 13, height: 1.4, color: context.colors.onSurfaceVariant)),
                    ),
                  if (s.recent.isEmpty)
                    Text('Belum ada notifikasi yang terbaca di HP ini.', style: TextStyle(fontSize: 13, color: context.colors.onSurfaceVariant))
                  else
                    for (final n in s.recent)
                      Padding(
                        padding: const EdgeInsets.only(bottom: Gap.sm),
                        child: EntityTile(
                          icon: Icons.notifications_rounded,
                          tone: _apps.containsKey(n['pkg']) ? Tone.success : Tone.neutral,
                          title: n['title']?.isNotEmpty == true ? n['title']! : '(tanpa judul)',
                          subtitle: _apps[n['pkg']] ?? n['pkg'] ?? '',
                          trailing: Text(n['time'] ?? '', style: TextStyle(fontSize: 12, color: context.colors.onSurfaceVariant)),
                        ),
                      ),
                ],
              ),
            ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.status, required this.busy, required this.onToggle});
  final QrisListenerStatus status;
  final bool busy;
  final ValueChanged<bool> onToggle;

  @override
  Widget build(BuildContext context) {
    final s = status;
    final last = s.lastBeat == null ? null : DateFormat('d MMM HH:mm', 'id_ID').format(s.lastBeat!);
    final (label, tone) = !s.enabled
        ? ('Nonaktif', Tone.neutral)
        : !s.accessGranted
        ? ('Butuh izin notifikasi', Tone.warning)
        : s.alive
        ? ('Memantau', Tone.success)
        : ('Terhenti', Tone.danger);
    final detail = !s.enabled
        ? 'Aktifkan hanya di HP yang menerima notifikasi uang masuk DANA atau bank.'
        : s.alive
        ? 'Aktif terakhir $last.'
        : last == null
        ? 'Belum pernah aktif di HP ini. Pastikan izin notifikasi sudah diberikan.'
        : 'Tidak ada tanda aktif sejak $last. Buka Persiapan HP ini, lalu tekan Sambungkan ulang.';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DetailHeader(
          icon: Icons.qr_code_2_rounded,
          tone: tone,
          title: 'Pemantau pembayaran',
          subtitle: detail,
          status: StatusPill(label: label, tone: tone),
        ),
        const SizedBox(height: Gap.sm),
        Card(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.sm, Gap.sm, Gap.sm),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    s.enabled ? 'Kasir QRIS aktif di HP ini' : 'Kasir QRIS mati di HP ini',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                  ),
                ),
                if (s.enabled && s.accessGranted && !s.alive)
                  TextButton(onPressed: QrisListenerBridge.instance.reconnect, child: const Text('Sambungkan ulang')),
                busy
                    ? const Padding(
                        padding: EdgeInsets.all(Gap.md),
                        child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2)),
                      )
                    : Switch(value: s.enabled, onChanged: onToggle),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// One setup step: done (tick), not done (action button) or unknown (the
/// vendor autostart switch Android does not report).
class _CheckRow extends StatelessWidget {
  const _CheckRow({required this.label, required this.done, required this.action, required this.onAction});
  final String label;
  final bool? done;
  final String action;
  final Future<void> Function() onAction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Gap.xs),
      child: Row(
        children: [
          Icon(
            done == true
                ? Icons.check_circle_rounded
                : done == false
                ? Icons.error_outline_rounded
                : Icons.help_outline_rounded,
            size: 20,
            color: context.tone(
              done == true
                  ? Tone.success
                  : done == false
                  ? Tone.warning
                  : Tone.neutral,
            ),
          ),
          const SizedBox(width: Gap.md),
          Expanded(
            child: Text(label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          ),
          if (done != true) TextButton(onPressed: onAction, child: Text(action)),
        ],
      ),
    );
  }
}
