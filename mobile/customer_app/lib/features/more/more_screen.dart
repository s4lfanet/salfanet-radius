import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/feature_colors.dart';
import '../auth/auth_provider.dart';
import '../referral/referral_screen.dart';
import '../renewal/renewal_screen.dart';
import '../speedtest/speedtest_screen.dart';
import '../suspend/suspend_screen.dart';
import '../topup/topup_screen.dart';
import '../upgrade/upgrade_screen.dart';
import 'profile_screen.dart';

class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final customer = context.watch<AuthProvider>().customer;
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: const Text('Lainnya')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
        children: [
          if (customer != null)
            Card(
              child: InkWell(
                borderRadius: BorderRadius.circular(AppRadius.card),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const ProfileScreen()),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 24,
                        backgroundColor: scheme.primaryContainer,
                        child: Text(
                          customer.name.isNotEmpty ? customer.name[0].toUpperCase() : '?',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: scheme.onPrimaryContainer,
                          ),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(customer.name, style: Theme.of(context).textTheme.titleMedium),
                            const SizedBox(height: 2),
                            Text(
                              customer.customerId != null
                                  ? '${customer.username} · ID ${customer.customerId}'
                                  : customer.username,
                              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                    color: scheme.onSurfaceVariant,
                                  ),
                            ),
                          ],
                        ),
                      ),
                      Icon(Icons.chevron_right_rounded, color: scheme.onSurfaceVariant),
                    ],
                  ),
                ),
              ),
            ),
          const SizedBox(height: 24),
          _GroupLabel('Langganan'),
          const SizedBox(height: 8),
          _MenuCard(
            children: [
              _MenuTile(
                icon: Icons.event_repeat_rounded,
                accent: FeatureColors.renewal,
                title: 'Perpanjang Langganan',
                subtitle: 'Tambah masa aktif paket Anda',
                onTap: () => _push(context, const RenewalScreen()),
              ),
              _MenuTile(
                icon: Icons.trending_up_rounded,
                accent: FeatureColors.upgrade,
                title: 'Upgrade / Ganti Paket',
                subtitle: 'Pindah ke paket internet lain',
                onTap: () => _push(context, const UpgradeScreen()),
              ),
              _MenuTile(
                icon: Icons.pause_circle_outline_rounded,
                accent: FeatureColors.suspend,
                title: 'Ajukan Suspend',
                subtitle: 'Jeda sementara saat Anda bepergian',
                onTap: () => _push(context, const SuspendScreen()),
                isLast: true,
              ),
            ],
          ),
          const SizedBox(height: 24),
          _GroupLabel('Saldo & Reward'),
          const SizedBox(height: 8),
          _MenuCard(
            children: [
              _MenuTile(
                icon: Icons.account_balance_wallet_rounded,
                accent: FeatureColors.topup,
                title: 'Top Up Saldo',
                subtitle: 'Isi saldo lewat transfer atau e-wallet',
                onTap: () => _push(context, const TopupScreen()),
              ),
              _MenuTile(
                icon: Icons.volunteer_activism_rounded,
                accent: FeatureColors.referral,
                title: 'Referral',
                subtitle: 'Ajak tetangga, dapat reward',
                onTap: () => _push(context, const ReferralScreen()),
                isLast: true,
              ),
            ],
          ),
          const SizedBox(height: 24),
          _GroupLabel('Alat Bantu'),
          const SizedBox(height: 8),
          _MenuCard(
            children: [
              _MenuTile(
                icon: Icons.network_check_rounded,
                accent: FeatureColors.speedtest,
                title: 'Speed Test',
                subtitle: 'Ukur kecepatan internet saat ini',
                onTap: () => _push(context, const SpeedtestScreen()),
                isLast: true,
              ),
            ],
          ),
          const SizedBox(height: 28),
          OutlinedButton.icon(
            onPressed: () => _confirmLogout(context),
            icon: Icon(Icons.logout_rounded, size: 18, color: scheme.error),
            label: Text('Keluar', style: TextStyle(color: scheme.error)),
            style: OutlinedButton.styleFrom(side: BorderSide(color: scheme.error.withValues(alpha: 0.5))),
          ),
        ],
      ),
    );
  }

  void _push(BuildContext context, Widget screen) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
  }

  void _confirmLogout(BuildContext context) {
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Keluar dari akun?'),
        content: const Text('Anda perlu masuk kembali untuk membuka tagihan dan pengaturan WiFi.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Batal')),
          FilledButton(
            onPressed: () {
              Navigator.pop(dialogContext);
              context.read<AuthProvider>().logout();
            },
            child: const Text('Keluar'),
          ),
        ],
      ),
    );
  }
}

class _GroupLabel extends StatelessWidget {
  const _GroupLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4),
      child: Text(
        text,
        style: Theme.of(context).textTheme.titleSmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
      ),
    );
  }
}

class _MenuCard extends StatelessWidget {
  const _MenuCard({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(children: children),
    );
  }
}

class _MenuTile extends StatelessWidget {
  const _MenuTile({
    required this.icon,
    required this.accent,
    required this.title,
    required this.onTap,
    this.subtitle,
    this.isLast = false,
  });

  final IconData icon;
  final FeatureAccent accent;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      children: [
        InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                FeatureIconTile(icon: icon, accent: accent, size: 42, radius: 13),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: Theme.of(context).textTheme.titleSmall),
                      if (subtitle != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          subtitle!,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: scheme.onSurfaceVariant,
                              ),
                        ),
                      ],
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, size: 20, color: scheme.onSurfaceVariant),
              ],
            ),
          ),
        ),
        if (!isLast)
          Padding(
            padding: const EdgeInsets.only(left: 70),
            child: Divider(height: 1, color: scheme.outlineVariant.withValues(alpha: 0.5)),
          ),
      ],
    );
  }
}
