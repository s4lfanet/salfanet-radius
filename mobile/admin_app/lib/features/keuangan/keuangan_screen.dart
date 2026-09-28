import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

/// Read-only ledger summary. Adding entries and exports stay on the web;
/// checking income vs expense for a period is the mobile need.
class KeuanganScreen extends StatefulWidget {
  const KeuanganScreen({super.key});

  @override
  State<KeuanganScreen> createState() => _KeuanganScreenState();
}

class _KeuanganScreenState extends State<KeuanganScreen> {
  List<Map<String, dynamic>> _tx = [];
  Map<String, dynamic>? _stats;
  bool _loading = true;
  String? _error;
  String _period = 'month';
  String _type = 'all';

  (String, String)? get _range {
    final now = DateTime.now();
    final f = DateFormat('yyyy-MM-dd');
    switch (_period) {
      case 'today':
        return (f.format(now), f.format(now));
      case 'month':
        return (f.format(DateTime(now.year, now.month, 1)), f.format(DateTime(now.year, now.month + 1, 0)));
      case 'lastMonth':
        return (f.format(DateTime(now.year, now.month - 1, 1)), f.format(DateTime(now.year, now.month, 0)));
      default:
        return null;
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _tx.isEmpty;
      _error = null;
    });
    try {
      final r = _range;
      final res = await ApiClient.instance.get('/api/keuangan/transactions', query: {
        'limit': 100,
        'type': _type,
        if (r != null) 'startDate': r.$1,
        if (r != null) 'endDate': r.$2,
      });
      if (res is Map<String, dynamic>) {
        _tx = ((res['transactions'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
        _stats = mapOf(res, 'stats');
      }
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _open(Map<String, dynamic> t) {
    final income = t['type'] == 'INCOME';
    showDetailSheet(
      context,
      header: DetailHeader(
        icon: income ? Icons.south_west_rounded : Icons.north_east_rounded,
        tone: income ? Tone.success : Tone.danger,
        title: str(t, 'description') ?? '-',
        subtitle: str(mapOf(t, 'category'), 'name'),
        status: StatusPill(label: income ? 'Pemasukan' : 'Pengeluaran', tone: income ? Tone.success : Tone.danger),
        figureLabel: 'Jumlah',
        figure: formatCurrency(numOf(t, 'amount')),
      ),
      sections: [
        DetailSection(rows: [
          InfoRow('Tanggal', formatDateTimeOrNull(dateOf(t, 'date'))),
          InfoRow('Referensi', str(t, 'reference'), copyable: true),
          InfoRow('Dicatat oleh', str(t, 'createdBy')),
          // notes is sometimes a JSON blob written by automated flows;
          // only show it when it reads as a human note.
          InfoRow('Catatan', (str(t, 'notes')?.startsWith('{') ?? true) ? null : str(t, 'notes')),
        ]),
      ],
    );
  }

  void _setPeriod(String v) {
    setState(() {
      _period = v;
      _tx = [];
    });
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final s = _stats;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Keuangan'),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'Jenis transaksi',
            icon: Icon(Icons.filter_list_rounded, color: _type == 'all' ? null : context.colors.primary),
            onSelected: (v) {
              setState(() {
                _type = v;
                _tx = [];
              });
              _load();
            },
            itemBuilder: (_) => [
              CheckedPopupMenuItem(value: 'all', checked: _type == 'all', child: const Text('Semua')),
              CheckedPopupMenuItem(value: 'INCOME', checked: _type == 'INCOME', child: const Text('Pemasukan')),
              CheckedPopupMenuItem(value: 'EXPENSE', checked: _type == 'EXPENSE', child: const Text('Pengeluaran')),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          FilterChipRow(
            options: const [('today', 'Hari ini'), ('month', 'Bulan ini'), ('lastMonth', 'Bulan lalu'), ('all', 'Semua')],
            selected: _period,
            onSelected: _setPeriod,
          ),
          Expanded(
            child: DataStateView(
              loading: _loading,
              error: _error,
              onRetry: _load,
              isEmpty: false,
              emptyIcon: Icons.account_balance_outlined,
              emptyMessage: '',
              child: RefreshableList(
                onRefresh: _load,
                header: s == null
                    ? null
                    : Card(
                        child: Padding(
                          padding: const EdgeInsets.all(Gap.lg),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              LabeledFigure(label: 'Saldo periode', value: formatCurrency(numOf(s, 'balance')), valueSize: 24),
                              const SizedBox(height: Gap.md),
                              const Divider(),
                              const SizedBox(height: Gap.md),
                              Row(
                                children: [
                                  Expanded(child: LabeledFigure(label: 'Pemasukan · ${numOf(s, 'incomeCount')}', value: formatCurrency(numOf(s, 'totalIncome')), color: context.tone(Tone.success), valueSize: 15)),
                                  Expanded(child: LabeledFigure(label: 'Pengeluaran · ${numOf(s, 'expenseCount')}', value: formatCurrency(numOf(s, 'totalExpense')), color: context.tone(Tone.danger), valueSize: 15)),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                itemCount: _tx.isEmpty ? 1 : _tx.length,
                itemBuilder: (context, i) {
                  if (_tx.isEmpty) {
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: Gap.xl),
                      child: Center(child: Text('Tidak ada transaksi di periode ini.', style: TextStyle(color: context.colors.onSurfaceVariant))),
                    );
                  }
                  final t = _tx[i];
                  final income = t['type'] == 'INCOME';
                  return EntityTile(
                    icon: income ? Icons.south_west_rounded : Icons.north_east_rounded,
                    tone: income ? Tone.success : Tone.danger,
                    title: str(t, 'description') ?? '-',
                    subtitle: str(mapOf(t, 'category'), 'name'),
                    meta: formatDateOrNull(dateOf(t, 'date')),
                    trailing: Text(
                      '${income ? '+' : '−'}${formatCurrency(numOf(t, 'amount'))}',
                      style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5, color: context.tone(income ? Tone.success : Tone.danger)),
                    ),
                    onTap: () => _open(t),
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
