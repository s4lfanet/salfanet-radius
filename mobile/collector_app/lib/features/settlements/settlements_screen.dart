import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

/// Setoran saya — pembayaran yang ditandai lunas, per hari atau rentang,
/// sama dengan halaman settlements di portal web.
class SettlementsScreen extends StatefulWidget {
  const SettlementsScreen({super.key});

  @override
  State<SettlementsScreen> createState() => _SettlementsScreenState();
}

class _SettlementsScreenState extends State<SettlementsScreen> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic> _daily = {};
  DateTime _date = DateTime.now();
  bool _rangeMode = false;
  bool _rangeLoading = false;
  List<Map<String, dynamic>> _rangeRows = [];

  String get _dateStr => DateFormat('yyyy-MM-dd').format(_date);

  @override
  void initState() {
    super.initState();
    _loadDaily();
  }

  Future<void> _loadDaily() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/collector/my-settlements', query: {'date': _dateStr});
      setState(() => _daily = res is Map ? Map<String, dynamic>.from(res) : {});
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadRange() async {
    setState(() => _rangeLoading = true);
    try {
      final now = DateTime.now();
      final from = DateFormat('yyyy-MM-dd').format(DateTime(now.year, now.month, 1));
      final to = DateFormat('yyyy-MM-dd').format(now);
      final res = await ApiClient.instance.get('/api/collector/my-settlements/range', query: {'date_from': from, 'date_to': to});
      final rows = res is Map ? (res['rows'] ?? res['data']) : null;
      setState(() => _rangeRows = [for (final r in rows is List ? rows : const []) Map<String, dynamic>.from(r as Map)]);
    } catch (_) {} finally {
      if (mounted) setState(() => _rangeLoading = false);
    }
  }

  Future<void> _pickDate() async {
    final d = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now(),
    );
    if (d != null) {
      _date = d;
      _loadDaily();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Setoran Saya'),
        actions: [
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: false, label: Text('Harian')),
              ButtonSegment(value: true, label: Text('Bulan ini')),
            ],
            selected: {_rangeMode},
            onSelectionChanged: (s) {
              setState(() => _rangeMode = s.first);
              if (_rangeMode && _rangeRows.isEmpty) _loadRange();
            },
          ),
          const SizedBox(width: Gap.md),
        ],
      ),
      body: _rangeMode ? _buildRange() : _buildDaily(),
    );
  }

  Widget _buildRange() {
    return DataStateView(
      loading: _rangeLoading,
      error: null,
      isEmpty: _rangeRows.isEmpty,
      emptyIcon: Icons.date_range_rounded,
      emptyMessage: 'Belum ada setoran bulan ini',
      onRetry: _loadRange,
      child: RefreshableList(
        itemCount: _rangeRows.length,
        onRefresh: _loadRange,
        itemBuilder: (_, i) {
          final r = _rangeRows[i];
          final confirmed = r['confirmed_by'] != null;
          return EntityTile(
            icon: confirmed ? Icons.verified_rounded : Icons.schedule_rounded,
            tone: confirmed ? Tone.success : Tone.warning,
            title: '${r['date']}',
            subtitle: '${r['invoice_count']} transaksi · tunai ${formatCurrency(num.tryParse('${r['cash_amount']}') ?? 0)}',
            trailing: AmountTrailing(
              amount: formatCurrency(num.tryParse('${r['total_amount']}') ?? 0),
              pill: StatusPill(label: confirmed ? 'Dikonfirmasi' : 'Belum setor', tone: confirmed ? Tone.success : Tone.warning),
            ),
            onTap: () {
              final p = '${r['date']}'.split('-').map(int.tryParse).toList();
              if (p.every((e) => e != null)) {
                setState(() {
                  _date = DateTime(p[0]!, p[1]!, p[2]!);
                  _rangeMode = false;
                });
                _loadDaily();
              }
            },
          );
        },
      ),
    );
  }

  Widget _buildDaily() {
    final summary = _daily['summary'] is Map ? Map<String, dynamic>.from(_daily['summary']) : <String, dynamic>{};
    final invoices = [for (final i in _daily['invoices'] is List ? _daily['invoices'] : const []) Map<String, dynamic>.from(i as Map)];
    final confirmation = _daily['confirmation'] is Map ? _daily['confirmation'] : null;

    return DataStateView(
      loading: _loading,
      error: _error,
      isEmpty: invoices.isEmpty,
      emptyIcon: Icons.account_balance_wallet_outlined,
      emptyMessage: 'Tidak ada setoran',
      emptyHint: 'Belum ada pembayaran yang Anda tandai lunas pada tanggal ini.',
      onRetry: _loadDaily,
      child: RefreshableList(
        itemCount: invoices.length,
        onRefresh: _loadDaily,
        header: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              child: ListTile(
                onTap: _pickDate,
                leading: Icon(Icons.calendar_today_rounded, size: 20, color: context.colors.primary),
                title: Text(DateFormat('EEEE, d MMMM yyyy', 'id_ID').format(_date), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                subtitle: confirmation != null
                    ? Text('Dikonfirmasi oleh ${confirmation['confirmed_by']}', style: TextStyle(fontSize: 11.5, color: context.tone(Tone.success)))
                    : null,
                trailing: const Icon(Icons.edit_calendar_outlined, size: 18),
              ),
            ),
            const SizedBox(height: Gap.sm),
            Row(
              children: [
                Expanded(child: _mini('Total', formatCurrency(num.tryParse('${summary['total_amount']}') ?? 0))),
                const SizedBox(width: Gap.md),
                Expanded(child: _mini('Tunai', formatCurrency(num.tryParse('${summary['cash_amount']}') ?? 0))),
                const SizedBox(width: Gap.md),
                Expanded(child: _mini('Transfer', formatCurrency(num.tryParse('${summary['transfer_amount']}') ?? 0))),
              ],
            ),
          ],
        ),
        itemBuilder: (_, i) {
          final inv = invoices[i];
          final method = '${inv['paymentMethod'] ?? 'cash'}';
          return EntityTile(
            icon: method.contains('transfer') ? Icons.account_balance_outlined : Icons.payments_outlined,
            tone: Tone.success,
            title: (inv['customerName'] ?? inv['customerUsername'] ?? '-').toString(),
            subtitle: '${inv['invoiceNumber'] ?? ''}${inv['profileName'] != null && '${inv['profileName']}'.isNotEmpty ? ' · ${inv['profileName']}' : ''}',
            trailing: AmountTrailing(amount: formatCurrency(num.tryParse('${inv['amount']}') ?? 0), pill: StatusPill(label: method, tone: Tone.neutral)),
          );
        },
      ),
    );
  }

  Widget _mini(String label, String value) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Gap.md, vertical: Gap.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TextStyle(fontSize: 11, color: context.colors.onSurfaceVariant)),
            const SizedBox(height: 4),
            Text(value, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800), maxLines: 1, overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
    );
  }
}
