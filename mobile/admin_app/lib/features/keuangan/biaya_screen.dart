import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/crud/crud_list_screen.dart';
import '../../core/crud/lookups.dart';
import '../../core/formatters.dart';
import '../../core/forms/field_spec.dart';
import '../../core/forms/form_screen.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

final _api = ApiClient.instance;
final _ymd = DateFormat('yyyy-MM-dd');
final _ym = DateFormat('yyyy-MM');
final _monthName = DateFormat('MMMM yyyy', 'id_ID');

/// Biaya Operasional — the web page of the same name: costs paid out of
/// revenue for one month (bandwidth, salaries, equipment...), what is left
/// of income after them, per category versus last month, and the entries.
class BiayaScreen extends StatefulWidget {
  const BiayaScreen({super.key});

  @override
  State<BiayaScreen> createState() => _BiayaScreenState();
}

class _BiayaScreenState extends State<BiayaScreen> {
  DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);
  Json? _data;
  String? _category;
  bool _loading = true;
  String? _error;

  List<Json> _list(String key) => extractList(_data?[key]);
  List<Json> get _expenses => _list('expenses').where((e) => _category == null || e['categoryId'] == _category).toList();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _data == null;
      _error = null;
    });
    try {
      final res = await _api.get('/api/keuangan/expenses', query: {'month': _ym.format(_month)});
      _data = res is Map<String, dynamic> ? res : null;
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _setMonth(DateTime m) {
    setState(() {
      _month = m;
      _data = null;
      _category = null;
    });
    _load();
  }

  List<FieldSpec> _fields() => [
    FieldSpec('categoryId', 'Kategori', type: FieldType.select, required: true, loadOptions: () => Lookups.keuanganCategories(type: 'EXPENSE')),
    const FieldSpec('amount', 'Jumlah (Rp)', type: FieldType.integer, required: true, min: 1),
    const FieldSpec('description', 'Keterangan', required: true, hint: 'Bayar bandwidth upstream Oktober'),
    const FieldSpec('date', 'Tanggal bayar', type: FieldType.date, required: true),
    const FieldSpec('reference', 'No. nota / referensi'),
    const FieldSpec('notes', 'Catatan', type: FieldType.multiline),
  ];

  Future<void> _add() async {
    final now = DateTime.now();
    final sameMonth = now.year == _month.year && now.month == _month.month;
    final ok = await openForm(
      context,
      title: 'Catat Biaya',
      submitLabel: 'Catat biaya',
      fields: _fields(),
      initial: {'date': sameMonth ? now : _month, 'categoryId': _category},
      success: 'Biaya dicatat.',
      onSubmit: (v) => _api.post('/api/keuangan/transactions', data: {...v, 'type': 'EXPENSE'}),
    );
    if (ok) _load();
  }

  Future<bool> _edit(BuildContext ctx, Json e) => openForm(
    ctx,
    title: 'Ubah Biaya',
    fields: _fields(),
    initial: {...e, 'date': dateOf(e, 'date'), 'notes': (str(e, 'notes')?.startsWith('{') ?? false) ? null : e['notes']},
    success: 'Biaya diperbarui.',
    onSubmit: (v) => _api.put('/api/keuangan/transactions', data: {'id': e['id'], 'type': 'EXPENSE', ...v}),
  );

  Future<bool> _delete(BuildContext ctx, Json e) async {
    final ok = await confirmAction(
      ctx,
      title: 'Hapus Biaya?',
      message: '"${e['description']}" (${formatCurrency(numOf(e, 'amount'))}) dihapus dari catatan biaya.',
      confirmLabel: 'Hapus',
      destructive: true,
    );
    if (!ok || !ctx.mounted) return false;
    return runAction(ctx, () => _api.delete('/api/keuangan/transactions', query: {'id': e['id']}), success: 'Biaya dihapus.');
  }

  /// Bandwidth, salaries and rent repeat monthly: copy chosen entries from
  /// the previous month to the same day of this one.
  Future<void> _repeat() async {
    final prev = DateTime(_month.year, _month.month - 1);
    List<Json> items = const [];
    final loaded = await runAction(context, () async {
      final res = await _api.get('/api/keuangan/expenses', query: {'month': _ym.format(prev)});
      items = extractList(res is Map ? res['expenses'] : null);
    });
    if (!loaded || !mounted) return;
    if (items.isEmpty) return showToast(context, 'Tidak ada biaya tercatat di ${_monthName.format(prev)}.');
    final lastDay = DateTime(_month.year, _month.month + 1, 0).day;
    final ok = await openForm(
      context,
      title: 'Ulangi ${_monthName.format(prev)}',
      submitLabel: 'Salin biaya',
      fields: [
        FieldSpec.note('Biaya yang dipilih dicatat lagi di ${_monthName.format(_month)} pada tanggal yang sama. Jumlahnya bisa diubah setelah disalin.'),
        FieldSpec(
          'ids',
          'Biaya',
          type: FieldType.multiSelect,
          required: true,
          options: [for (final e in items) ('${e['id']}', '${e['description']} · ${formatCurrency(numOf(e, 'amount'))}')],
        ),
      ],
      initial: {'ids': [for (final e in items) '${e['id']}']},
      success: 'Biaya disalin.',
      onSubmit: (v) async {
        final ids = (v['ids'] as List).map((e) => '$e').toSet();
        for (final e in items.where((e) => ids.contains('${e['id']}'))) {
          final day = dateOf(e, 'date')?.day ?? 1;
          await _api.post('/api/keuangan/transactions', data: {
            'type': 'EXPENSE',
            'categoryId': e['categoryId'],
            'amount': e['amount'],
            'description': e['description'],
            'date': _ymd.format(DateTime(_month.year, _month.month, day > lastDay ? lastDay : day)),
            'reference': '',
            'notes': (str(e, 'notes')?.startsWith('{') ?? true) ? '' : e['notes'],
          });
        }
      },
    );
    if (ok) _load();
  }

  Future<void> _installCategories() async {
    final done = await runAction(context, () => _api.post('/api/keuangan/expenses'), success: 'Kategori biaya ditambahkan.');
    if (done) _load();
  }

  void _open(Json e) {
    showDetailSheet(
      context,
      header: DetailHeader(
        icon: Icons.north_east_rounded,
        tone: Tone.danger,
        title: str(e, 'description') ?? '-',
        subtitle: str(mapOf(e, 'category'), 'name'),
        figureLabel: 'Jumlah',
        figure: formatCurrency(numOf(e, 'amount')),
      ),
      sections: [
        DetailSection(
          rows: [
            InfoRow('Tanggal bayar', formatDateOrNull(dateOf(e, 'date'))),
            InfoRow('No. nota', str(e, 'reference'), copyable: true),
            InfoRow('Dicatat oleh', str(e, 'createdBy')),
            InfoRow('Catatan', (str(e, 'notes')?.startsWith('{') ?? true) ? null : str(e, 'notes')),
          ],
        ),
      ],
      actions: (sheet) => [
        ActionSpec('Ubah', Icons.edit_rounded, () async {
          if (await _edit(sheet, e)) {
            if (sheet.mounted) Navigator.pop(sheet);
            _load();
          }
        }),
        ActionSpec('Hapus', Icons.delete_outline_rounded, () async {
          if (await _delete(sheet, e)) {
            if (sheet.mounted) Navigator.pop(sheet);
            _load();
          }
        }, kind: ActionKind.danger),
      ],
    );
  }

  Widget _summary() {
    final d = _data!;
    final income = numOf(d, 'totalIncome');
    final expense = numOf(d, 'totalExpense');
    final delta = expense - numOf(d, 'totalExpensePrev');
    final net = numOf(d, 'net');
    final change = delta == 0 ? 'sama dengan bulan lalu' : '${delta > 0 ? 'naik' : 'turun'} ${formatCurrency(delta.abs())}';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(Gap.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            LabeledFigure(
              label: 'Sisa setelah biaya · ${_monthName.format(_month)}',
              value: formatCurrency(net),
              valueSize: 24,
              color: context.tone(net < 0 ? Tone.danger : Tone.success),
            ),
            if (net < 0) ...[
              const SizedBox(height: 2),
              Text('Biaya melebihi pendapatan bulan ini', style: TextStyle(fontSize: 12, color: context.tone(Tone.danger))),
            ],
            const SizedBox(height: Gap.md),
            const Divider(),
            const SizedBox(height: Gap.md),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: LabeledFigure(label: 'Pendapatan', value: formatCurrency(income), valueSize: 15)),
                const SizedBox(width: Gap.md),
                Expanded(child: LabeledFigure(label: 'Biaya', value: formatCurrency(expense), valueSize: 15)),
              ],
            ),
            const SizedBox(height: Gap.sm),
            Text(
              income > 0 ? '${(expense / income * 100).round()}% dari pendapatan · $change' : change[0].toUpperCase() + change.substring(1),
              style: TextStyle(fontSize: 12, color: context.colors.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }

  Widget _categories() {
    final cats = _list('byCategory');
    final total = numOf(_data, 'totalExpense');
    if (cats.isEmpty) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(Gap.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Belum ada kategori biaya', style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text(
                'Pasang kategori umum ISP: bandwidth, gaji, peralatan, listrik, sewa, dan lainnya.',
                style: TextStyle(fontSize: 12.5, color: context.colors.onSurfaceVariant),
              ),
              const SizedBox(height: Gap.md),
              FilledButton(onPressed: _installCategories, child: const Text('Pasang kategori bawaan')),
            ],
          ),
        ),
      );
    }
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          for (var i = 0; i < cats.length; i++) ...[
            if (i > 0) const Divider(indent: Gap.lg),
            _CategoryRow(
              cat: cats[i],
              share: total > 0 ? numOf(cats[i], 'amount') / total : 0,
              selected: _category == cats[i]['id'],
              onTap: () => setState(() => _category = _category == cats[i]['id'] ? null : '${cats[i]['id']}'),
            ),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final months = [for (var i = 0; i < 12; i++) DateTime(now.year, now.month - i)];
    final expenses = _data == null ? const <Json>[] : _expenses;
    final selectedName = _category == null ? null : str(_list('byCategory').firstWhere((c) => c['id'] == _category, orElse: () => {}), 'name');
    return Scaffold(
      appBar: AppBar(
        title: const Text('Biaya Operasional'),
        actions: [
          PopupMenuButton<DateTime>(
            tooltip: 'Pilih bulan',
            icon: const Icon(Icons.calendar_month_rounded),
            onSelected: _setMonth,
            itemBuilder: (_) => [
              for (final m in months)
                CheckedPopupMenuItem(value: m, checked: m.year == _month.year && m.month == _month.month, child: Text(_monthName.format(m))),
            ],
          ),
          IconButton(tooltip: 'Ulangi biaya bulan lalu', icon: const Icon(Icons.repeat_rounded), onPressed: _data == null ? null : _repeat),
        ],
      ),
      floatingActionButton: _list('byCategory').any((c) => c['isActive'] != false)
          ? FloatingActionButton.extended(onPressed: _add, icon: const Icon(Icons.add_rounded), label: const Text('Catat biaya'))
          : null,
      body: DataStateView(
        loading: _loading,
        error: _error,
        onRetry: _load,
        isEmpty: false,
        emptyIcon: Icons.receipt_long_outlined,
        emptyMessage: '',
        child: _data == null
            ? const SizedBox.shrink()
            : RefreshableList(
                onRefresh: _load,
                hasFab: true,
                header: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _summary(),
                    const SizedBox(height: Gap.lg),
                    SectionHeader('Per kategori', action: _category == null ? null : 'Tampilkan semua', onAction: () => setState(() => _category = null)),
                    _categories(),
                    const SizedBox(height: Gap.lg),
                    SectionHeader(selectedName == null ? 'Catatan biaya · ${expenses.length}' : '$selectedName · ${expenses.length}'),
                  ],
                ),
                itemCount: expenses.isEmpty ? 1 : expenses.length,
                itemBuilder: (context, i) {
                  if (expenses.isEmpty) {
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: Gap.lg, horizontal: Gap.md),
                      child: Text(
                        'Belum ada biaya tercatat di ${_monthName.format(_month)}. Catat setiap pembayaran, misalnya tagihan bandwidth atau gaji teknisi.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: context.colors.onSurfaceVariant),
                      ),
                    );
                  }
                  final e = expenses[i];
                  return EntityTile(
                    icon: Icons.north_east_rounded,
                    tone: Tone.danger,
                    title: str(e, 'description') ?? '-',
                    subtitle: str(mapOf(e, 'category'), 'name'),
                    meta: [formatDateOrNull(dateOf(e, 'date')), str(e, 'createdBy')].whereType<String>().join(' · '),
                    trailing: Text(formatCurrency(numOf(e, 'amount')), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
                    onTap: () => _open(e),
                  );
                },
              ),
      ),
    );
  }
}

class _CategoryRow extends StatelessWidget {
  const _CategoryRow({required this.cat, required this.share, required this.selected, required this.onTap});
  final Json cat;
  final num share;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final muted = context.colors.onSurfaceVariant;
    final amount = numOf(cat, 'amount');
    return Material(
      color: selected ? context.colors.surfaceContainerHighest : Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.md, Gap.lg, Gap.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      str(cat, 'name') ?? '-',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13.5, fontWeight: amount > 0 ? FontWeight.w700 : FontWeight.w500, color: amount > 0 ? null : muted),
                    ),
                  ),
                  const SizedBox(width: Gap.sm),
                  Text(formatCurrency(amount), style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800)),
                ],
              ),
              const SizedBox(height: Gap.sm),
              // Share of this month's costs; the text carries the numbers.
              ClipRRect(
                borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                child: LinearProgressIndicator(
                  value: share.toDouble(),
                  minHeight: 6,
                  backgroundColor: context.colors.surfaceContainerHighest,
                  color: context.colors.primary,
                ),
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '${numOf(cat, 'count')} catatan${amount > 0 ? ' · ${(share * 100).round()}%' : ''}',
                      style: TextStyle(fontSize: 11.5, color: muted),
                    ),
                  ),
                  Text('Bulan lalu ${formatCurrency(numOf(cat, 'previousAmount'))}', style: TextStyle(fontSize: 11.5, color: muted)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
