import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
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

    return Scaffold(
      appBar: AppBar(title: const Text('Lainnya')),
      body: ListView(
        children: [
          if (customer != null)
            ListTile(
              leading: CircleAvatar(
                backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                child: Text(customer.name.isNotEmpty ? customer.name[0].toUpperCase() : '?'),
              ),
              title: Text(customer.name, style: const TextStyle(fontWeight: FontWeight.bold)),
              subtitle: Text(customer.username),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ProfileScreen())),
            ),
          const Divider(height: 1),
          _MenuTile(
            icon: Icons.autorenew,
            title: 'Perpanjang Langganan',
            subtitle: 'Perpanjang masa aktif paket Anda',
            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const RenewalScreen())),
          ),
          _MenuTile(
            icon: Icons.upgrade,
            title: 'Upgrade / Ganti Paket',
            subtitle: 'Pindah ke paket internet lain',
            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const UpgradeScreen())),
          ),
          _MenuTile(
            icon: Icons.account_balance_wallet_outlined,
            title: 'Top Up Saldo',
            subtitle: 'Isi saldo akun via transfer atau e-wallet',
            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const TopupScreen())),
          ),
          _MenuTile(
            icon: Icons.speed,
            title: 'Speed Test',
            subtitle: 'Cek kecepatan internet Anda',
            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SpeedtestScreen())),
          ),
          _MenuTile(
            icon: Icons.pause_circle_outline,
            title: 'Ajukan Suspend Layanan',
            subtitle: 'Jeda sementara langganan Anda',
            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SuspendScreen())),
          ),
          _MenuTile(
            icon: Icons.card_giftcard,
            title: 'Referral',
            subtitle: 'Ajak teman & dapatkan reward',
            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ReferralScreen())),
          ),
          const Divider(height: 1),
          _MenuTile(
            icon: Icons.logout,
            title: 'Keluar',
            onTap: () => _confirmLogout(context),
            destructive: true,
          ),
        ],
      ),
    );
  }

  void _confirmLogout(BuildContext context) {
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Keluar dari akun?'),
        content: const Text('Anda perlu masuk kembali untuk mengakses akun Anda.'),
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

class _MenuTile extends StatelessWidget {
  const _MenuTile({required this.icon, required this.title, this.subtitle, required this.onTap, this.destructive = false});
  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color = destructive ? scheme.error : scheme.onSurface;
    return ListTile(
      leading: Icon(icon, color: destructive ? scheme.error : scheme.primary),
      title: Text(title, style: TextStyle(color: color)),
      subtitle: subtitle != null ? Text(subtitle!) : null,
      trailing: destructive ? null : const Icon(Icons.chevron_right),
      onTap: onTap,
    );
  }
}
