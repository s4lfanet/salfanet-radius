import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/theme_controller.dart';
import '../../core/update/app_updater.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../auth/auth_provider.dart';
import '../auth/server_settings_screen.dart';
import '../notifications/notifications_screen.dart';

class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  Widget _row(BuildContext context, IconData icon, Tone tone, String title, String hint, {Widget? page, VoidCallback? action}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Gap.sm),
      child: EntityTile(
        icon: icon,
        tone: tone,
        title: title,
        subtitle: hint,
        trailing: Icon(Icons.chevron_right_rounded, color: context.colors.outline, size: 20),
        onTap: () {
          if (action != null) {
            action();
          } else if (page != null) {
            Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
          }
        },
      ),
    );
  }

  Widget _heading(BuildContext context, String text) => Padding(
        padding: const EdgeInsets.only(left: 2, top: Gap.md, bottom: Gap.sm),
        child: Text(text, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: context.colors.onSurfaceVariant)),
      );

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

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    return Scaffold(
      appBar: AppBar(title: const Text('Menu')),
      body: ListView(
        padding: EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, listBottomPadding(context)),
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
              subtitle: Text(user?.phone ?? ''),
            ),
          ),
          _heading(context, 'Akun'),
          _row(context, Icons.notifications_outlined, Tone.neutral, 'Notifikasi', 'Info voucher, deposit, dan saldo', page: const NotificationsScreen()),
          _row(context, Icons.system_update_rounded, Tone.primary, 'Pembaruan Aplikasi', 'Versi terpasang dan update APK', page: const AppUpdateScreen()),
          _heading(context, 'Pengaturan'),
          _row(context, Icons.dns_outlined, Tone.neutral, 'Server', ApiClient.instance.baseUrl, page: const ServerSettingsScreen()),
          _row(context, Icons.dark_mode_outlined, Tone.neutral, 'Tema', 'Ikuti sistem, terang, atau gelap', action: () => _themeSheet(context)),
          _heading(context, 'Sesi'),
          EntityTile(
            icon: Icons.logout_rounded,
            tone: Tone.danger,
            title: 'Keluar',
            subtitle: 'Akhiri sesi di perangkat ini',
            onTap: () async {
              final ok = await confirmAction(context, title: 'Keluar?', message: 'Anda harus masuk kembali dengan kode OTP.', confirmLabel: 'Keluar', destructive: true);
              if (ok && context.mounted) context.read<AuthProvider>().logout();
            },
          ),
          const SizedBox(height: Gap.lg),
          const AppVersionFooter(appName: 'Salfanet Agen'),
        ],
      ),
    );
  }
}
