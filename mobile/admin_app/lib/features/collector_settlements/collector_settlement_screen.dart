import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

/// Daily cash reconciliation: what each collector took in on a date, broken
/// down per invoice, confirmed once the money is handed to the office.
/// The API is limited to SUPER_ADMIN / FINANCE.
class CollectorSettlementScreen extends StatefulWidget {
  const CollectorSettlementScreen({super.key});

  @override
  State<CollectorSettlementScreen> createState() => _CollectorSettlementScreenState();
}

class _CollectorSettlementScreenState extends State<CollectorSettlementScreen> {
  List<Map<String, dynamic>> _rows = [];
  bool _loading = true;
  String? _error;
  DateTime _date = DateTime.now();

  String get _dateParam => DateFormat('yyyy-MM-dd').format(_date);
  num get _dayTotal => _rows.fold<num>(0, (s, r) => s + numOf(r, 'total_amount'));

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _rows.isEmpty;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/collector/setoran', query: {'date': _dateParam});
      if (res is List) {
        // Collectors with nothing collected that day are noise here.
        _rows = res.map((e) => (e as Map).cast<String, dynamic>()).where((r) => numOf(r, 'invoice_count') > 0).toList();
      }
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(context: context, initialDate: _date, firstDate: DateTime(2020), lastDate: DateTime.now());
    if (picked == null) return;
    setState(() {
      _date = picked;
      _rows = [];
    });
    _load();
  }

  Future<void> _confirm(BuildContext ctx, Map<String, dynamic> r, {bool fromSheet = false}) async {
    final ok = await confirmAction(ctx,
        title: 'Konfirmasi Setoran',
        message: '${formatCurrency(numOf(r, 'total_amount'))} dari ${str(r, 'collector_name')} untuk ${formatDate(_date)} sudah diterima kantor?',
        confirmLabel: 'Sudah Diterima');
    if (!ok || !ctx.mounted) return;
    final done = await runAction(ctx, () => ApiClient.instance.post('/api/collector/confirm-settlement', data: {'collectorId': r['collector_id'], 'date': _dateParam}),
        success: 'Setoran dikonfirmasi.');
    if (done) {
      if (fromSheet && ctx.mounted) Navigator.pop(ctx);
      _load();
    }
  }

  void _open(Map<String, dynamic> r) {
    final confirmed = r['confirmed_by'] != null;
    final invoices = ((r['invoices'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
    showDetailSheet(
      context,
      header: DetailHeader(
        icon: Icons.badge_rounded,
        tone: confirmed ? Tone.success : Tone.warning,
        title: str(r, 'collector_name') ?? '-',
        subtitle: '${formatDate(_date)} · ${numOf(r, 'invoice_count')} tagihan',
        status: StatusPill(label: confirmed ? 'Dikonfirmasi' : 'Belum disetor', tone: confirmed ? Tone.success : Tone.warning),
        figureLabel: 'Total tertagih',
        figure: formatCurrency(numOf(r, 'total_amount')),
      ),
      sections: [
        DetailSection(title: 'Rincian', rows: [
          InfoRow('Tunai', formatCurrency(numOf(r, 'cash_amount'))),
          InfoRow('Transfer', formatCurrency(numOf(r, 'transfer_amount'))),
          InfoRow('Dikonfirmasi oleh', str(r, 'confirmed_by')),
          InfoRow('Pada', formatDateTimeOrNull(dateOf(r, 'confirmed_at'))),
        ]),
        DetailSection(
          title: 'Tagihan Tertagih',
          rows: invoices
              .map((inv) => InfoRow(
                    str(inv, 'customerName') ?? str(inv, 'customerUsername') ?? '-',
                    '${formatCurrency(numOf(inv, 'amount'))} · ${(str(inv, 'paymentMethod') ?? 'tunai')}${inv['has_proof'] == true ? ' · ada bukti' : ''}',
                  ))
              .toList(),
        ),
      ],
      actions: confirmed ? null : (sheet) => [ActionSpec('Konfirmasi Setoran', Icons.check_circle_rounded, () => _confirm(sheet, r, fromSheet: true), kind: ActionKind.success)],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Setoran Kolektor'),
        actions: [IconButton(tooltip: 'Pilih tanggal', icon: const Icon(Icons.calendar_month_rounded), onPressed: _pickDate)],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, 0),
            child: Card(
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: _pickDate,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: Gap.lg, vertical: Gap.md),
                  child: Row(
                    children: [
                      Expanded(child: LabeledFigure(label: DateFormat('EEEE, d MMMM yyyy', 'id_ID').format(_date), value: formatCurrency(_dayTotal), valueSize: 18)),
                      Icon(Icons.edit_calendar_rounded, color: context.colors.onSurfaceVariant),
                    ],
                  ),
                ),
              ),
            ),
          ),
          Expanded(
            child: DataStateView(
              loading: _loading,
              error: _error,
              onRetry: _load,
              isEmpty: _rows.isEmpty,
              emptyIcon: Icons.badge_outlined,
              emptyMessage: 'Tidak ada tagihan tertagih kolektor di tanggal ini',
              emptyHint: 'Pilih tanggal lain lewat ikon kalender.',
              child: RefreshableList(
                onRefresh: _load,
                itemCount: _rows.length,
                itemBuilder: (context, i) {
                  final r = _rows[i];
                  final confirmed = r['confirmed_by'] != null;
                  return EntityTile(
                    icon: Icons.badge_rounded,
                    tone: confirmed ? Tone.success : Tone.warning,
                    title: str(r, 'collector_name') ?? '-',
                    subtitle: '${numOf(r, 'invoice_count')} tagihan · tunai ${formatCurrency(numOf(r, 'cash_amount'))}',
                    meta: confirmed ? 'Dikonfirmasi ${str(r, 'confirmed_by')}' : 'Belum dikonfirmasi',
                    trailing: AmountTrailing(
                      amount: formatCurrency(numOf(r, 'total_amount')),
                      pill: StatusPill(label: confirmed ? 'Diterima' : 'Belum', tone: confirmed ? Tone.success : Tone.warning),
                    ),
                    onTap: () => _open(r),
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
