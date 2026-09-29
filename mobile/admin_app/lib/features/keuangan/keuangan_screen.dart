import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/crud/crud_list_screen.dart';
import '../../core/crud/lookups.dart';
import '../../core/files.dart';
import '../../core/formatters.dart';
import '../../core/forms/field_spec.dart';
import '../../core/forms/form_screen.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

/// Ledger: income/expense per period with add, edit, delete, categories
/// and export — the web Keuangan page.
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
      final res = await ApiClient.instance.get(
        '/api/keuangan/transactions',
        query: {'limit': 100, 'type': _type, if (r != null) 'startDate': r.$1, if (r != null) 'endDate': r.$2},
      );
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

  List<FieldSpec> _fields() => [
    const FieldSpec('type', 'Jenis', type: FieldType.select, required: true, initial: 'INCOME', options: [('INCOME', 'Pemasukan'), ('EXPENSE', 'Pengeluaran')]),
    FieldSpec('categoryId', 'Kategori', type: FieldType.select, required: true, loadOptions: Lookups.keuanganCategories),
    const FieldSpec('amount', 'Jumlah (Rp)', type: FieldType.integer, required: true, min: 1),
    const FieldSpec('description', 'Keterangan', required: true),
    const FieldSpec('date', 'Tanggal', type: FieldType.date, required: true),
    const FieldSpec('reference', 'Referensi'),
    const FieldSpec('notes', 'Catatan', type: FieldType.multiline),
  ];

  Future<void> _add() async {
    final ok = await openForm(
      context,
      title: 'Tambah Transaksi',
      fields: _fields(),
      initial: {'date': DateTime.now(), 'type': _type == 'EXPENSE' ? 'EXPENSE' : 'INCOME'},
      success: 'Transaksi dicatat.',
      onSubmit: (v) => ApiClient.instance.post('/api/keuangan/transactions', data: v),
    );
    if (ok) _load();
  }

  Future<bool> _edit(BuildContext ctx, Map<String, dynamic> t) => openForm(
    ctx,
    title: 'Edit Transaksi',
    fields: _fields(),
    initial: {...t, 'categoryId': mapOf(t, 'category')?['id'] ?? t['categoryId'], 'notes': (str(t, 'notes')?.startsWith('{') ?? false) ? null : t['notes']},
    success: 'Transaksi disimpan.',
    onSubmit: (v) => ApiClient.instance.put('/api/keuangan/transactions', data: {'id': t['id'], ...v}),
  );

  Future<bool> _delete(BuildContext ctx, Map<String, dynamic> t) async {
    final ok = await confirmAction(
      ctx,
      title: 'Hapus Transaksi?',
      message: '"${t['description']}" (${formatCurrency(numOf(t, 'amount'))}) dihapus dari buku kas.',
      confirmLabel: 'Hapus',
      destructive: true,
    );
    if (!ok || !ctx.mounted) return false;
    return runAction(ctx, () => ApiClient.instance.delete('/api/keuangan/transactions', query: {'id': t['id']}), success: 'Transaksi dihapus.');
  }

  Future<void> _export() async {
    final r = _range;
    await downloadAndShare(
      context,
      '/api/keuangan/export',
      'keuangan-${DateTime.now().toIso8601String().substring(0, 10)}.xlsx',
      query: {'format': 'excel', 'type': _type, if (r != null) 'startDate': r.$1, if (r != null) 'endDate': r.$2},
    );
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
        DetailSection(
          rows: [
            InfoRow('Tanggal', formatDateTimeOrNull(dateOf(t, 'date'))),
            InfoRow('Referensi', str(t, 'reference'), copyable: true),
            InfoRow('Dicatat oleh', str(t, 'createdBy')),
            // notes is sometimes a JSON blob written by automated flows;
            // only show it when it reads as a human note.
            InfoRow('Catatan', (str(t, 'notes')?.startsWith('{') ?? true) ? null : str(t, 'notes')),
          ],
        ),
      ],
      actions: (sheet) => [
        ActionSpec('Edit', Icons.edit_rounded, () async {
          if (await _edit(sheet, t)) {
            if (sheet.mounted) Navigator.pop(sheet);
            _load();
          }
        }),
        ActionSpec('Hapus', Icons.delete_outline_rounded, () async {
          if (await _delete(sheet, t)) {
            if (sheet.mounted) Navigator.pop(sheet);
            _load();
          }
        }, kind: ActionKind.danger),
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
          PopupMenuButton<String>(
            onSelected: (v) async {
              if (v == 'categories') {
                await CrudListScreen.open(context, keuanganCategoriesConfig());
              } else {
                await _export();
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(
                value: 'categories',
                child: ListTile(leading: Icon(Icons.category_rounded), title: Text('Kategori'), contentPadding: EdgeInsets.zero),
              ),
              PopupMenuItem(
                value: 'export',
                child: ListTile(leading: Icon(Icons.ios_share_rounded), title: Text('Ekspor Excel'), contentPadding: EdgeInsets.zero),
              ),
            ],
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(onPressed: _add, icon: const Icon(Icons.add_rounded), label: const Text('Transaksi')),
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
                hasFab: true,
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
                                  Expanded(
                                    child: LabeledFigure(
                                      label: 'Pemasukan · ${numOf(s, 'incomeCount')}',
                                      value: formatCurrency(numOf(s, 'totalIncome')),
                                      color: context.tone(Tone.success),
                                      valueSize: 15,
                                    ),
                                  ),
                                  Expanded(
                                    child: LabeledFigure(
                                      label: 'Pengeluaran · ${numOf(s, 'expenseCount')}',
                                      value: formatCurrency(numOf(s, 'totalExpense')),
                                      color: context.tone(Tone.danger),
                                      valueSize: 15,
                                    ),
                                  ),
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
                      child: Center(
                        child: Text('Tidak ada transaksi di periode ini.', style: TextStyle(color: context.colors.onSurfaceVariant)),
                      ),
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

/// Kategori transaksi — the web Keuangan page's category manager.
CrudConfig keuanganCategoriesConfig() => CrudConfig(
  title: 'Kategori Keuangan',
  noun: 'Kategori',
  icon: Icons.category_rounded,
  fetch: (_) => ApiClient.instance.get('/api/keuangan/categories'),
  listKey: 'categories',
  filters: const [('all', 'Semua'), ('INCOME', 'Pemasukan'), ('EXPENSE', 'Pengeluaran')],
  filterOf: (c) => str(c, 'type'),
  initialFilter: 'all',
  titleOf: (c) => str(c, 'name') ?? '-',
  subtitleOf: (c) => c['type'] == 'INCOME' ? 'Pemasukan' : 'Pengeluaran',
  metaOf: (c) => str(c, 'description'),
  toneOf: (c) => c['type'] == 'INCOME' ? Tone.success : Tone.danger,
  statusOf: (c) => c['isActive'] == false ? const StatusPill(label: 'Nonaktif', tone: Tone.neutral) : null,
  fields: (c) => [
    const FieldSpec('name', 'Nama kategori', required: true),
    const FieldSpec('type', 'Jenis', type: FieldType.select, required: true, initial: 'INCOME', options: [('INCOME', 'Pemasukan'), ('EXPENSE', 'Pengeluaran')]),
    const FieldSpec('description', 'Deskripsi'),
    if (c != null) const FieldSpec('isActive', 'Aktif', type: FieldType.toggle, initial: true),
  ],
  create: CrudRoutes.postTo('/api/keuangan/categories'),
  update: CrudRoutes.putWithBodyId('/api/keuangan/categories'),
  delete: CrudRoutes.deleteWithQueryId('/api/keuangan/categories'),
);
