import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

/// Riwayat penagihan saya — monthly totals plus the most recent payments
/// the collector marked, mirroring the web portal's my-collections page.
class CollectionsScreen extends StatefulWidget {
  const CollectionsScreen({super.key});

  @override
  State<CollectionsScreen> createState() => _CollectionsScreenState();
}

class _CollectionsScreenState extends State<CollectionsScreen> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic> _data = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/collector/my-collections', query: {'months': '6'});
      setState(() => _data = res is Map ? Map<String, dynamic>.from(res) : {});
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final monthly = [for (final m in _data['monthly'] is List ? _data['monthly'] : const []) Map<String, dynamic>.from(m as Map)];
    final recent = [for (final r in _data['recent'] is List ? _data['recent'] : const []) Map<String, dynamic>.from(r as Map)];
    final total = num.tryParse('${_data['total_amount']}') ?? 0;

    return Scaffold(
      appBar: AppBar(title: const Text('Penagihan Saya')),
      body: DataStateView(
        loading: _loading,
        error: _error,
        isEmpty: monthly.isEmpty && recent.isEmpty,
        emptyIcon: Icons.account_balance_wallet_outlined,
        emptyMessage: 'Belum ada penagihan',
        emptyHint: 'Pembayaran yang Anda tandai lunas akan muncul di sini.',
        onRetry: _load,
        child: RefreshableList(
          itemCount: monthly.length + recent.length + (monthly.isNotEmpty && recent.isNotEmpty ? 1 : 0),
          onRefresh: _load,
          header: Card(
            child: Padding(
              padding: const EdgeInsets.all(Gap.lg),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Total 6 bulan', style: TextStyle(fontSize: 12, color: context.colors.onSurfaceVariant)),
                        const SizedBox(height: 4),
                        FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.centerLeft,
                          child: Text(formatCurrency(total), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                        ),
                      ],
                    ),
                  ),
                  Text('${_data['total_count'] ?? 0} transaksi', style: TextStyle(fontSize: 12.5, color: context.colors.onSurfaceVariant)),
                ],
              ),
            ),
          ),
          itemBuilder: (_, i) {
            if (i < monthly.length) {
              final m = monthly[i];
              return EntityTile(
                icon: Icons.calendar_month_rounded,
                tone: Tone.primary,
                title: '${m['month'] ?? '-'}',
                subtitle: '${m['total_count'] ?? 0} transaksi · tunai ${formatCurrency(num.tryParse('${m['cash_amount']}') ?? 0)}',
                trailing: Text(formatCurrency(num.tryParse('${m['total_amount']}') ?? 0), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
              );
            }
            final ri = i - monthly.length - (monthly.isNotEmpty ? 1 : 0);
            if (monthly.isNotEmpty && i == monthly.length) {
              return const SectionHeader(title: 'Terbaru');
            }
            final r = recent[ri];
            return EntityTile(
              icon: Icons.payments_outlined,
              tone: Tone.success,
              title: (r['customerName'] ?? r['customerUsername'] ?? '-').toString(),
              subtitle: '${r['invoiceNumber'] ?? ''}${r['paymentMethod'] != null ? ' · ${r['paymentMethod']}' : ''}',
              meta: r['paidAt']?.toString().split('T').first,
              trailing: Text(formatCurrency(num.tryParse('${r['amount']}') ?? 0), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
            );
          },
        ),
      ),
    );
  }
}
