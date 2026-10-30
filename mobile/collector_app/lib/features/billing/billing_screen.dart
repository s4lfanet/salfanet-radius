import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import '../customers/customers_screen.dart';

/// Daftar tagihan terbuka — the web portal's billing page. Grouped per
/// customer; tapping a row opens the same detail sheet the customers tab
/// uses, so mark-paid / promise / invoice link stay one tap away.
class BillingScreen extends StatefulWidget {
  const BillingScreen({super.key});

  @override
  State<BillingScreen> createState() => _BillingScreenState();
}

class _BillingScreenState extends State<BillingScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _users = [];
  String _query = '';

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
      final res = await ApiClient.instance.get('/api/collector/users', query: {'filter': 'unpaid'});
      final list = res is Map ? res['users'] : null;
      setState(() => _users = [for (final u in list is List ? list : const []) Map<String, dynamic>.from(u as Map)]);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  num get _total => _users.fold(0, (s, u) => s + (num.tryParse('${u['unpaid_amount']}') ?? 0));

  List<Map<String, dynamic>> get _visible {
    if (_query.isEmpty) return _users;
    final q = _query.toLowerCase();
    return _users.where((u) => '${u['name']}'.toLowerCase().contains(q) || '${u['username']}'.toLowerCase().contains(q)).toList();
  }

  @override
  Widget build(BuildContext context) {
    final users = _visible;
    return Scaffold(
      appBar: AppBar(title: const Text('Tagihan')),
      body: Column(
        children: [
          SearchField(hint: 'Cari pelanggan…', onChanged: (v) => setState(() => _query = v)),
          if (!_loading && users.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, 0),
              child: Row(
                children: [
                  Icon(Icons.receipt_long_outlined, size: 16, color: context.colors.onSurfaceVariant),
                  const SizedBox(width: Gap.sm),
                  Expanded(
                    child: Text(
                      '${users.length} pelanggan · total ${formatCurrency(_total)}',
                      style: TextStyle(fontSize: 12.5, color: context.colors.onSurfaceVariant),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: Gap.sm),
          Expanded(
            child: DataStateView(
              loading: _loading,
              error: _error,
              isEmpty: users.isEmpty,
              emptyIcon: Icons.check_circle_outline_rounded,
              emptyMessage: 'Semua tagihan lunas',
              emptyHint: 'Tidak ada tagihan terbuka di area Anda.',
              onRetry: _load,
              child: RefreshableList(
                itemCount: users.length,
                onRefresh: _load,
                itemBuilder: (_, i) {
                  final u = users[i];
                  final count = num.tryParse('${u['unpaid_count']}') ?? 0;
                  return EntityTile(
                    icon: Icons.receipt_long_outlined,
                    tone: u['has_overdue'] == true ? Tone.danger : Tone.warning,
                    title: (u['name'] ?? u['username'] ?? '-').toString(),
                    subtitle: '${u['username'] ?? ''} · $count tagihan',
                    trailing: AmountTrailing(
                      amount: formatCurrency(num.tryParse('${u['unpaid_amount']}') ?? 0),
                      pill: StatusPill(label: u['has_overdue'] == true ? 'Terlambat' : 'Belum lunas', tone: u['has_overdue'] == true ? Tone.danger : Tone.warning),
                    ),
                    onTap: () => openCustomerSheet(context, u, _load),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
