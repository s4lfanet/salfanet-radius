import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/theme_controller.dart';
import '../../core/update/app_updater.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../auth/auth_provider.dart';
import '../auth/server_settings_screen.dart';
import '../collections/collections_screen.dart';
import '../isolir/isolir_screen.dart';
import '../notifications/notifications_screen.dart';
import '../ont/ont_screen.dart';
import '../proofs/proofs_screen.dart';

/// Lainnya — tools kerja sekunder (isolir, riwayat penagihan, ONT, bukti
/// transfer, notifikasi), akun, server, tema, dan keluar. Tab utama tetap
/// untuk alur harian; halaman-halaman ini dijangkau lewat sini, sama
/// seperti sidebar "lainnya" di portal web.
class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;
    return Scaffold(
      appBar: AppBar(title: const Text('Lainnya')),
      body: ListView(
        padding: const EdgeInsets.all(Gap.page),
        children: [
          Card(
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: context.colors.primaryContainer,
                child: Text(
                  (user?.name.isNotEmpty == true ? user!.name[0] : '?').toUpperCase(),
                  style: TextStyle(fontWeight: FontWeight.w800, color: context.colors.onPrimaryContainer),
                ),
              ),
              title: Text(user?.name ?? '-', style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text([user?.username, user?.scopeLabel].whereType<String>().where((s) => s.isNotEmpty).join(' · ')),
            ),
          ),
          const SizedBox(height: Gap.lg),
          _Section(
            title: 'Kerja Lapangan',
            tiles: [
              _menu(context, Icons.wifi_off_rounded, Tone.danger, 'Pelanggan Isolir', 'Yang putus karena belum bayar', const IsolirScreen()),
              _menu(context, Icons.account_balance_wallet_outlined, Tone.success, 'Penagihan Saya', 'Riwayat 6 bulan + transaksi terbaru', const CollectionsScreen()),
              _menu(context, Icons.router_outlined, Tone.warning, 'Cabut ONT', 'Permintaan pencabutan perangkat', const OntScreen()),
              _menu(context, Icons.receipt_outlined, Tone.primary, 'Bukti Pembayaran', 'Foto bukti transfer pelanggan', const ProofsScreen()),
              _menu(context, Icons.notifications_outlined, Tone.neutral, 'Notifikasi', 'Info masuk ke akun Anda', const NotificationsScreen()),
            ],
          ),
          const SizedBox(height: Gap.lg),
          _Section(
            title: 'Pengaturan',
            tiles: [
              _menu(context, Icons.dns_outlined, Tone.neutral, 'Server', ApiClient.instance.baseUrl, null, onTap: () {
                Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ServerSettingsScreen()));
              }),
              _menu(context, Icons.dark_mode_outlined, Tone.neutral, 'Tema', 'Ikuti sistem / terang / gelap', null, onTap: () => _themeSheet(context)),
              _menu(context, Icons.system_update_rounded, Tone.primary, 'Pembaruan Aplikasi', 'Versi terpasang & update APK', const AppUpdateScreen()),
            ],
          ),
          const SizedBox(height: Gap.lg),
          _Section(
            title: 'Akun',
            tiles: [
              EntityTile(
                icon: Icons.logout_rounded,
                tone: Tone.danger,
                title: 'Keluar',
                subtitle: 'Akhiri sesi di perangkat ini',
                onTap: () async {
                  final ok = await confirmAction(context, title: 'Keluar?', message: 'Anda harus masuk kembali untuk menagih.', confirmLabel: 'Keluar', destructive: true);
                  if (ok && context.mounted) context.read<AuthProvider>().logout();
                },
              ),
            ],
          ),
          const SizedBox(height: Gap.lg),
          FutureBuilder<PackageInfo>(
            future: PackageInfo.fromPlatform(),
            builder: (_, s) => Center(
              child: Text(
                'Salfanet Kolektor v${s.data?.version ?? '-'} (${s.data?.buildNumber ?? '-'})',
                style: TextStyle(fontSize: 11.5, color: context.colors.outline),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _menu(BuildContext context, IconData icon, Tone tone, String title, String subtitle, Widget? page, {VoidCallback? onTap}) {
    return EntityTile(
      icon: icon,
      tone: tone,
      title: title,
      subtitle: subtitle,
      trailing: Icon(Icons.chevron_right_rounded, color: context.colors.outline, size: 20),
      onTap: onTap ?? (page != null ? () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => page)) : null),
    );
  }

  void _themeSheet(BuildContext context) {
    final theme = context.read<ThemeController>();
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final m in [(ThemeMode.system, 'Ikuti sistem'), (ThemeMode.light, 'Terang'), (ThemeMode.dark, 'Gelap')])
              ListTile(
                leading: Icon(theme.mode == m.$1 ? Icons.radio_button_checked : Icons.radio_button_off, color: context.colors.primary),
                title: Text(m.$2),
                onTap: () {
                  theme.set(m.$1);
                  Navigator.pop(ctx);
                },
              ),
          ],
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.tiles});
  final String title;
  final List<Widget> tiles;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 2, bottom: Gap.sm),
          child: Text(title, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: context.colors.onSurfaceVariant)),
        ),
        ...tiles,
      ],
    );
  }
}
