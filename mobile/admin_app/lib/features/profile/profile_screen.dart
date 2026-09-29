import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/theme_controller.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../auth/auth_provider.dart';
import '../auth/server_settings_screen.dart';
import '../resources/team_resources.dart' show roleLabel;

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  PackageInfo? _info;

  @override
  void initState() {
    super.initState();
    PackageInfo.fromPlatform().then((i) {
      if (mounted) setState(() => _info = i);
    });
  }

  Future<void> _logout() async {
    final auth = context.read<AuthProvider>();
    final ok = await confirmAction(
      context,
      title: 'Keluar',
      message: 'Anda perlu login lagi untuk membuka aplikasi.',
      confirmLabel: 'Keluar',
      destructive: true,
    );
    if (!ok || !mounted) return;
    // Pop back to the shell first so the auth gate can swap to the login
    // screen cleanly instead of leaving this page on the stack.
    Navigator.of(context).popUntil((r) => r.isFirst);
    auth.logout();
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final theme = context.watch<ThemeController>();
    final role = user?.role ?? '';

    return Scaffold(
      appBar: AppBar(title: const Text('Profil & Pengaturan')),
      body: ListView(
        padding: EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, listBottomPadding(context)),
        children: [
          DetailHeader(
            icon: Icons.person_rounded,
            tone: Tone.primary,
            title: user?.name ?? '-',
            subtitle: '@${user?.username ?? '-'}',
            status: StatusPill(label: roleLabel(role), tone: role == 'SUPER_ADMIN' ? Tone.accent : Tone.primary),
          ),
          DetailSection(
            title: 'Akun',
            rows: [
              InfoRow('Email', user?.email),
              InfoRow(
                'Server',
                ApiClient.instance.baseUrl,
                onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ServerSettingsScreen())),
              ),
            ],
          ),
          const SizedBox(height: Gap.lg),
          Padding(
            padding: const EdgeInsets.only(left: 2, bottom: Gap.sm),
            child: Text(
              'Tampilan',
              style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: context.colors.onSurfaceVariant),
            ),
          ),
          SegmentedButton<ThemeMode>(
            segments: const [
              ButtonSegment(value: ThemeMode.system, label: Text('Ikuti HP'), icon: Icon(Icons.phone_android_rounded, size: 18)),
              ButtonSegment(value: ThemeMode.light, label: Text('Terang'), icon: Icon(Icons.light_mode_outlined, size: 18)),
              ButtonSegment(value: ThemeMode.dark, label: Text('Gelap'), icon: Icon(Icons.dark_mode_outlined, size: 18)),
            ],
            selected: {theme.mode},
            showSelectedIcon: false,
            onSelectionChanged: (s) => theme.set(s.first),
          ),
          const SizedBox(height: Gap.xl),
          OutlinedButton.icon(
            onPressed: _logout,
            style: OutlinedButton.styleFrom(
              foregroundColor: context.tone(Tone.danger),
              side: BorderSide(color: context.tone(Tone.danger).withValues(alpha: 0.5)),
            ),
            icon: const Icon(Icons.logout_rounded, size: 18),
            label: const Text('Keluar'),
          ),
          const SizedBox(height: Gap.lg),
          if (_info != null)
            Center(
              child: Text('Salfanet Admin ${_info!.version} (${_info!.buildNumber})', style: TextStyle(fontSize: 12, color: context.colors.onSurfaceVariant)),
            ),
        ],
      ),
    );
  }
}
