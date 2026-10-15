import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import '../../core/company/company_provider.dart';
import '../../core/formatters.dart';
import '../../core/theme/feature_colors.dart';
import '../../core/widgets/state_views.dart';
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
      appBar: featureAppBar(title: 'Ajak Teman', icon: Icons.volunteer_activism_rounded, accent: FeatureColors.referral),
      body: provider.loading
          ? const ScrollableCenter(child: AppLoadingState(label: 'Memuat data Ajak Teman...'))
          : provider.error != null
              ? ScrollableCenter(child: AppErrorState(message: provider.error!, onRetry: provider.load))
              : !(provider.info?.enabled ?? false)
                  ? const ScrollableCenter(
                      child: AppEmptyState(
                        icon: Icons.volunteer_activism_rounded,
                        accent: FeatureColors.referral,
                        title: 'Program Ajak Teman belum aktif',
                        message: 'Penyedia internet Anda belum membuka program ini. '
                            'Kalau nanti dibuka, kode Anda akan muncul di halaman ini.',
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
                                const FeatureIconTile(
                                  icon: Icons.volunteer_activism_rounded,
                                  accent: FeatureColors.referral,
                                  size: 56,
                                  radius: 18,
                                ),
                                const SizedBox(height: 14),
                                Text(
                                  'Dapatkan ${formatCurrency(provider.info?.rewardAmount ?? 0)} untuk setiap teman yang berlangganan dengan kode Anda',
                                  textAlign: TextAlign.center,
                                  style: Theme.of(context).textTheme.bodyMedium,
                                ),
                                const SizedBox(height: 20),
                                if (provider.info?.code != null) ...[
                                  // The code sits in a quiet field the customer can copy
                                  // from; the share button below is the one filled control.
                                  Container(
                                    padding: const EdgeInsets.fromLTRB(16, 6, 6, 6),
                                    decoration: BoxDecoration(
                                      color: scheme.surfaceContainer,
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(color: scheme.outlineVariant),
                                    ),
                                    child: Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            provider.info!.code!,
                                            style: TextStyle(
                                              fontSize: 22,
                                              fontWeight: FontWeight.w800,
                                              letterSpacing: 3,
                                              color: scheme.onSurface,
                                            ),
                                          ),
                                        ),
                                        IconButton(
                                          tooltip: 'Salin kode',
                                          icon: const Icon(Icons.copy_rounded),
                                          onPressed: () {
                                            Clipboard.setData(ClipboardData(text: provider.info!.code!));
                                            ScaffoldMessenger.of(context).showSnackBar(
                                              const SnackBar(content: Text('Kode disalin')),
                                            );
                                          },
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  FilledButton.icon(
                                    onPressed: () {
                                      final isp = context.read<CompanyProvider>().info?.name ?? 'penyedia internet saya';
                                      Share.share(
                                        'Yuk berlangganan internet di $isp. Pakai kode ${provider.info!.code} saat daftar:\n${provider.info!.shareUrl ?? ''}'.trim(),
                                      );
                                    },
                                    icon: const Icon(Icons.share_rounded),
                                    label: const Text('Bagikan ke Teman'),
                                  ),
                                ] else
                                  FilledButton(
                                    onPressed: provider.generating ? null : () => context.read<ReferralProvider>().generateCode(),
                                    child: provider.generating
                                        ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                                        : const Text('Buat Kode Saya'),
                                  ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            Expanded(child: _StatCard(label: 'Teman bergabung', value: '${provider.info?.totalReferred ?? 0}')),
                            const SizedBox(width: 12),
                            Expanded(child: _StatCard(label: 'Hadiah diterima', value: formatCurrency(provider.info?.totalRewardsCredited ?? 0))),
                          ],
                        ),
                        if ((provider.info?.pendingRewardsAmount ?? 0) > 0) ...[
                          const SizedBox(height: 12),
                          _StatCard(label: 'Hadiah menunggu', value: formatCurrency(provider.info!.pendingRewardsAmount)),
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
