import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/feature_colors.dart';
import '../../core/widgets/state_views.dart';
import '../auth/auth_provider.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _togglingAutoRenewal = false;
  bool _rebooting = false;

  Future<void> _toggleAutoRenewal(bool value) async {
    final authProvider = context.read<AuthProvider>();
    setState(() => _togglingAutoRenewal = true);
    try {
      await ApiClient.instance.post('/api/customer/auto-renewal', data: {'enabled': value});
      await authProvider.fetchMe();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _togglingAutoRenewal = false);
    }
  }

  Future<void> _rebootOnt() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Reboot Perangkat?'),
        content: const Text('Koneksi internet Anda akan terputus sementara selama perangkat restart.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Reboot')),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _rebooting = true);
    try {
      await ApiClient.instance.post('/api/customer/ont/reboot');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Perintah reboot berhasil dikirim')));
      }
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _rebooting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final customer = context.watch<AuthProvider>().customer;
    final scheme = Theme.of(context).colorScheme;

    if (customer == null) {
      return const Scaffold(
        body: ScrollableCenter(child: AppLoadingState(label: 'Memuat profil...')),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Profil Saya')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _row(context, 'Nama', customer.name),
                  _row(context, 'Username', customer.username),
                  if (customer.customerId != null) _row(context, 'ID Pelanggan', customer.customerId!),
                  _row(context, 'No. HP', customer.phone),
                  if (customer.email != null && customer.email!.isNotEmpty) _row(context, 'Email', customer.email!),
                  if (customer.address != null && customer.address!.isNotEmpty) _row(context, 'Alamat', customer.address!),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Paket', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  _row(context, 'Nama Paket', customer.profile?.name ?? '-'),
                  if (customer.profile?.downloadSpeed != null)
                    _row(context, 'Kecepatan', '${customer.profile!.downloadSpeed} / ${customer.profile!.uploadSpeed} Mbps'),
                  if (customer.profile?.price != null) _row(context, 'Harga', formatCurrency(customer.profile!.price!)),
                  _row(context, 'Berlaku hingga', customer.expiredAt != null ? formatDate(customer.expiredAt!) : '-'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: SwitchListTile(
              secondary: const FeatureIconTile(
                icon: Icons.event_repeat_rounded,
                accent: FeatureColors.renewal,
                size: 42,
                radius: 13,
              ),
              title: const Text('Perpanjangan Otomatis'),
              subtitle: const Text('Pakai saldo untuk perpanjang sendiri saat jatuh tempo'),
              value: customer.autoRenewal ?? false,
              onChanged: _togglingAutoRenewal ? null : _toggleAutoRenewal,
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: ListTile(
              leading: const FeatureIconTile(
                icon: Icons.restart_alt_rounded,
                accent: FeatureColors.wifi,
                size: 42,
                radius: 13,
              ),
              title: const Text('Reboot Perangkat (ONT)'),
              subtitle: const Text('Restart modem dari jarak jauh saat internet tersendat'),
              trailing: _rebooting
                  ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : Icon(Icons.chevron_right_rounded, color: scheme.onSurfaceVariant),
              onTap: _rebooting ? null : _rebootOnt,
            ),
          ),
        ],
      ),
    );
  }

  Widget _row(BuildContext context, String label, String value) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: scheme.onSurfaceVariant)),
          Flexible(child: Text(value, textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }
}
