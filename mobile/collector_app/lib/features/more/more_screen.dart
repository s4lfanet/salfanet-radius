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
import '../notifications/notifications_screen.dart';
import '../ont/ont_screen.dart';
import '../proofs/proofs_screen.dart';
import '../settlements/settlements_screen.dart';

class _Item {
  const _Item(this.icon, this.tone, this.title, this.hint, {this.page, this.action});
  final IconData icon;
  final Tone tone;
  final String title;
  final String hint;
  final Widget? page;

  /// For rows that open a sheet or dialog instead of a page.
  final void Function(BuildContext context)? action;
}

/// Menu — the same pages the web portal keeps under its Menu (Setoran Saya,
/// Koleksi Saya, Bukti Transfer, Cabut ONT), with the account, app settings,
/// and a search box that finds any of them by name.
class MoreScreen extends StatefulWidget {
  const MoreScreen({super.key});

  @override
  State<MoreScreen> createState() => _MoreScreenState();
}

class _MoreScreenState extends State<MoreScreen> {
  String _query = '';

  List<(String, List<_Item>)> _sections() => [
        (
          'Pekerjaan',
          [
            const _Item(Icons.account_balance_wallet_outlined, Tone.warning, 'Setoran Saya', 'Uang tagihan yang harus disetor ke admin', page: SettlementsScreen()),
            const _Item(Icons.history_rounded, Tone.success, 'Koleksi Saya', 'Riwayat 6 bulan dan transaksi terbaru', page: CollectionsScreen()),
            const _Item(Icons.receipt_outlined, Tone.primary, 'Bukti Transfer', 'Foto bukti transfer dari pelanggan', page: ProofsScreen()),
            const _Item(Icons.router_outlined, Tone.danger, 'Cabut ONT', 'Tugas pencabutan perangkat dari admin', page: OntScreen()),
          ],
        ),
        (
          'Akun',
          [
            const _Item(Icons.notifications_outlined, Tone.neutral, 'Notifikasi', 'Info yang masuk ke akun Anda', page: NotificationsScreen()),
            _Item(Icons.system_update_rounded, Tone.primary, 'Pembaruan Aplikasi', 'Versi terpasang dan update APK', page: const AppUpdateScreen()),
          ],
        ),
        (
          'Pengaturan',
          [
            _Item(Icons.dns_outlined, Tone.neutral, 'Server', ApiClient.instance.baseUrl, page: const ServerSettingsScreen()),
            _Item(Icons.dark_mode_outlined, Tone.neutral, 'Tema', 'Ikuti sistem, terang, atau gelap', action: _themeSheet),
          ],
        ),
      ];

  void _open(BuildContext context, _Item item) {
    if (item.action != null) {
      item.action!(context);
    } else if (item.page != null) {
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => item.page!));
    }
  }

  Widget _row(BuildContext context, _Item item, {String? trail}) {
    return EntityTile(
      icon: item.icon,
      tone: item.tone,
      title: item.title,
      subtitle: item.hint,
      meta: trail,
      trailing: Icon(Icons.chevron_right_rounded, color: context.colors.outline, size: 20),
      onTap: () => _open(context, item),
    );
  }

  Widget _heading(BuildContext context, String text) => Padding(
        padding: const EdgeInsets.only(left: 2, top: Gap.md, bottom: Gap.sm),
        child: Text(text, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: context.colors.onSurfaceVariant)),
      );

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final sections = _sections();
    final q = _query.trim().toLowerCase();

    final children = <Widget>[];
    if (q.isNotEmpty) {
      final hits = [
        for (final (section, items) in sections)
          for (final it in items)
            if ('${it.title} ${it.hint} $section'.toLowerCase().contains(q)) (section, it),
      ];
      if (hits.isEmpty) {
        children.add(Padding(
          padding: const EdgeInsets.only(top: Gap.xl),
          child: Column(
            children: [
              Icon(Icons.search_off_rounded, size: 40, color: context.colors.outline),
              const SizedBox(height: Gap.sm),
              Text('Menu "${_query.trim()}" tidak ditemukan', style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: Gap.xs),
              Text('Coba nama lain, mis. setoran, bukti, ONT.', style: TextStyle(color: context.colors.onSurfaceVariant)),
            ],
          ),
        ));
      } else {
        children.add(_heading(context, '${hits.length} menu ditemukan'));
        for (final (section, it) in hits) {
          children.add(_row(context, it, trail: section));
        }
      }
    } else {
      children.add(Card(
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
      ));
      for (final (section, items) in sections) {
        children.add(_heading(context, section));
        children.addAll(items.map((it) => _row(context, it)));
      }
      children
        ..add(_heading(context, 'Sesi'))
        ..add(EntityTile(
          icon: Icons.logout_rounded,
          tone: Tone.danger,
          title: 'Keluar',
          subtitle: 'Akhiri sesi di perangkat ini',
          onTap: () async {
            final ok = await confirmAction(context, title: 'Keluar?', message: 'Anda harus masuk kembali untuk menagih.', confirmLabel: 'Keluar', destructive: true);
            if (ok && context.mounted) context.read<AuthProvider>().logout();
          },
        ))
        ..add(const SizedBox(height: Gap.lg))
        ..add(FutureBuilder<PackageInfo>(
          future: PackageInfo.fromPlatform(),
          builder: (_, s) => Center(
            child: Text(
              'Salfanet Kolektor v${s.data?.version ?? '-'} (${s.data?.buildNumber ?? '-'})',
              style: TextStyle(fontSize: 11.5, color: context.colors.outline),
            ),
          ),
        ));
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Menu')),
      body: Column(
        children: [
          SearchField(hint: 'Cari menu, mis. setoran, bukti, ONT', onChanged: (v) => setState(() => _query = v)),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(Gap.page, 0, Gap.page, Gap.page),
              children: children,
            ),
          ),
        ],
      ),
    );
  }

  static void _themeSheet(BuildContext context) {
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
