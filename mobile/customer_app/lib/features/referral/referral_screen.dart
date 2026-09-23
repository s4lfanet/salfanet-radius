import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import '../../core/formatters.dart';
import 'referral_provider.dart';

class ReferralScreen extends StatefulWidget {
  const ReferralScreen({super.key});

  @override
  State<ReferralScreen> createState() => _ReferralScreenState();
}

class _ReferralScreenState extends State<ReferralScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ReferralProvider>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ReferralProvider>();
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: const Text('Referral')),
      body: provider.loading
          ? const Center(child: CircularProgressIndicator())
          : provider.error != null
              ? Center(child: Text(provider.error!))
              : !(provider.info?.enabled ?? false)
                  ? const Center(
                      child: Padding(
                        padding: EdgeInsets.all(24),
                        child: Text('Program referral belum diaktifkan.', textAlign: TextAlign.center),
                      ),
                    )
                  : ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(20),
                            child: Column(
                              children: [
                                Icon(Icons.card_giftcard, size: 40, color: scheme.primary),
                                const SizedBox(height: 12),
                                Text(
                                  'Ajak teman berlangganan, dapatkan ${formatCurrency(provider.info?.rewardAmount ?? 0)} per referral berhasil',
                                  textAlign: TextAlign.center,
                                  style: Theme.of(context).textTheme.bodyMedium,
                                ),
                                const SizedBox(height: 20),
                                if (provider.info?.code != null) ...[
                                  Container(
                                    padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
                                    decoration: BoxDecoration(
                                      color: scheme.primaryContainer,
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: Text(
                                      provider.info!.code!,
                                      style: TextStyle(
                                        fontSize: 24,
                                        fontWeight: FontWeight.bold,
                                        letterSpacing: 4,
                                        color: scheme.onPrimaryContainer,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 16),
                                  FilledButton.icon(
                                    onPressed: () => Share.share(
                                      'Yuk daftar internet di Salfanet pakai kode referral saya: ${provider.info!.code}\n${provider.info!.shareUrl ?? ''}',
                                    ),
                                    icon: const Icon(Icons.share),
                                    label: const Text('Bagikan Kode'),
                                  ),
                                ] else
                                  FilledButton(
                                    onPressed: provider.generating ? null : () => context.read<ReferralProvider>().generateCode(),
                                    child: provider.generating
                                        ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                                        : const Text('Buat Kode Referral'),
                                  ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            Expanded(child: _StatCard(label: 'Total Referral', value: '${provider.info?.totalReferred ?? 0}')),
                            const SizedBox(width: 12),
                            Expanded(child: _StatCard(label: 'Reward Diterima', value: formatCurrency(provider.info?.totalRewardsCredited ?? 0))),
                          ],
                        ),
                        if ((provider.info?.pendingRewardsAmount ?? 0) > 0) ...[
                          const SizedBox(height: 12),
                          _StatCard(label: 'Reward Menunggu', value: formatCurrency(provider.info!.pendingRewardsAmount)),
                        ],
                      ],
                    ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12)),
            const SizedBox(height: 4),
            Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          ],
        ),
      ),
    );
  }
}
