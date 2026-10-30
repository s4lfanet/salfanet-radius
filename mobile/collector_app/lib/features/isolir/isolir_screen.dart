import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import '../customers/customers_screen.dart';

/// Pelanggan terisolir — same list the web portal's isolir page shows.
/// The collector usually needs these names on the road: "siapa yang putus
/// karena belum bayar".
class IsolirScreen extends StatefulWidget {
  const IsolirScreen({super.key});

  @override
  State<IsolirScreen> createState() => _IsolirScreenState();
}

class _IsolirScreenState extends State<IsolirScreen> {
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
      final res = await ApiClient.instance.get('/api/collector/isolir');
      final list = res is Map ? res['users'] : null;
      setState(() => _users = [for (final u in list is List ? list : const []) Map<String, dynamic>.from(u as Map)]);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _visible {
    if (_query.isEmpty) return _users;
    final q = _query.toLowerCase();
    return _users.where((u) => '${u['name']}'.toLowerCase().contains(q) || '${u['username']}'.toLowerCase().contains(q)).toList();
  }

  @override
  Widget build(BuildContext context) {
    final users = _visible;
    return Scaffold(
      appBar: AppBar(title: const Text('Pelanggan Isolir')),
      body: Column(
        children: [
          SearchField(hint: 'Cari pelanggan isolir…', onChanged: (v) => setState(() => _query = v)),
          const SizedBox(height: Gap.sm),
          Expanded(
            child: DataStateView(
              loading: _loading,
              error: _error,
              isEmpty: users.isEmpty,
              emptyIcon: Icons.wifi_off_rounded,
              emptyMessage: 'Tidak ada pelanggan isolir',
              emptyHint: 'Semua pelanggan di area Anda terhubung.',
              onRetry: _load,
              child: RefreshableList(
                itemCount: users.length,
                onRefresh: _load,
                itemBuilder: (_, i) {
                  final u = users[i];
                  return EntityTile(
                    icon: Icons.wifi_off_rounded,
                    tone: Tone.danger,
                    title: (u['name'] ?? u['username'] ?? '-').toString(),
                    subtitle: '${u['username'] ?? ''}${u['phone'] != null ? ' · ${u['phone']}' : ''}',
                    trailing: AmountTrailing(
                      amount: (num.tryParse('${u['unpaid_amount']}') ?? 0) > 0 ? formatCurrency(num.tryParse('${u['unpaid_amount']}') ?? 0) : '',
                      pill: const StatusPill(label: 'Isolir', tone: Tone.danger),
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
