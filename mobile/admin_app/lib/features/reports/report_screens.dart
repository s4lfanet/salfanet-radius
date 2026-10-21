import 'dart:io';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/api/api_client.dart';
import '../../core/crud/crud_list_screen.dart';
import '../../core/crud/paging.dart';
import '../../core/files.dart';
import '../../core/formatters.dart';
import '../../core/forms/field_spec.dart';
import '../../core/forms/form_screen.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import '../pppoe/pppoe_detail_screen.dart';

final _api = ApiClient.instance;
final _ymd = DateFormat('yyyy-MM-dd');
final _ym = DateFormat('yyyy-MM');
final _rangeLabel = DateFormat('d MMM yyyy', 'id_ID');

List<Json> _list(dynamic v) => v is List ? v.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList() : const [];

/// The summary block every report opens with: one figure that answers the
/// screen's question, then the supporting numbers in a row beneath it.
class _Summary extends StatelessWidget {
  const _Summary({required this.label, required this.value, this.caption, this.figures = const []});
  final String label;
  final String value;
  final String? caption;
  final List<(String, String, Tone?)> figures;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(Gap.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (caption != null) ...[
              Text(caption!, style: TextStyle(fontSize: 12.5, color: context.colors.onSurfaceVariant)),
              const SizedBox(height: Gap.sm),
            ],
            LabeledFigure(label: label, value: value, valueSize: 24),
            if (figures.isNotEmpty) ...[
              const SizedBox(height: Gap.md),
              const Divider(),
              const SizedBox(height: Gap.md),
              Wrap(
                spacing: Gap.lg,
                runSpacing: Gap.md,
                children: [
                  for (final (l, v, tone) in figures)
                    SizedBox(
                      width: 140,
                      child: LabeledFigure(label: l, value: v, valueSize: 15, color: tone == null ? null : context.tone(tone)),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _EmptyRow extends StatelessWidget {
  const _EmptyRow(this.message);
  final String message;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: Gap.xl, horizontal: Gap.lg),
    child: Text(message, textAlign: TextAlign.center, style: TextStyle(color: context.colors.onSurfaceVariant)),
  );
}

/// Filter menu in the app bar; the icon takes the primary colour while a
/// non-default value is active so a filtered list never passes as complete.
Widget _filterMenu(
  BuildContext context, {
  required String tooltip,
  required String? selected,
  required List<(String, String)> options,
  required ValueChanged<String> onSelected,
  IconData icon = Icons.filter_list_rounded,
}) {
  return PopupMenuButton<String>(
    tooltip: tooltip,
    icon: Icon(icon, color: selected == options.first.$1 ? null : context.colors.primary),
    onSelected: onSelected,
    itemBuilder: (_) => [for (final (v, l) in options) CheckedPopupMenuItem(value: v, checked: v == selected, child: Text(l))],
  );
}

// ---------------------------------------------------------------------------
// Laporan (web /admin/laporan)
// ---------------------------------------------------------------------------

/// Billing, payment, customer and per-package reports for a date range,
/// with CSV export of exactly the rows on screen.
class LaporanScreen extends StatefulWidget {
  const LaporanScreen({super.key});

  @override
  State<LaporanScreen> createState() => _LaporanScreenState();
}

class _LaporanScreenState extends State<LaporanScreen> {
  static const _types = [('invoice', 'Tagihan'), ('payment', 'Pembayaran'), ('customer', 'Pelanggan Baru'), ('profile', 'Per Paket')];
  static const _invoiceStatus = [('all', 'Semua status'), ('paid', 'Lunas'), ('pending', 'Belum bayar'), ('overdue', 'Jatuh tempo'), ('cancelled', 'Dibatalkan')];
  static const _customerStatus = [('all', 'Semua status'), ('active', 'Aktif'), ('isolated', 'Terisolir'), ('stopped', 'Berhenti'), ('expired', 'Expired')];

  String _type = 'invoice';
  String _status = 'all';
  String _period = 'month';
  DateTimeRange? _custom;
  List<Json> _rows = [];
  Json? _summary;
  bool _loading = true;
  String? _error;

  DateTimeRange get _range {
    final now = DateTime.now();
    return switch (_period) {
      'lastMonth' => DateTimeRange(start: DateTime(now.year, now.month - 1, 1), end: DateTime(now.year, now.month, 0)),
      'quarter' => DateTimeRange(start: DateTime(now.year, now.month - 2, 1), end: now),
      'custom' => _custom ?? DateTimeRange(start: DateTime(now.year, now.month, 1), end: now),
      _ => DateTimeRange(start: DateTime(now.year, now.month, 1), end: now),
    };
  }

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
      final r = _range;
      final res = await _api.get(
        '/api/admin/laporan',
        query: {'type': _type, 'status': _status, 'dateFrom': _ymd.format(r.start), 'dateTo': _ymd.format(r.end)},
      );
      if (res is Map<String, dynamic>) {
        _rows = _list(res['rows']);
        _summary = mapOf(res, 'summary');
      }
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _reset(VoidCallback change) {
    setState(() {
      change();
      _rows = [];
      _summary = null;
    });
    _load();
  }

  Future<void> _pickPeriod(String v) async {
    if (v != 'custom') return _reset(() => _period = v);
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 5),
      lastDate: now,
      initialDateRange: _custom ?? _range,
      helpText: 'Rentang laporan',
    );
    if (picked != null) {
      _reset(() {
        _period = 'custom';
        _custom = picked;
      });
    }
  }

  Future<void> _exportCsv() async {
    if (_rows.isEmpty) return showToast(context, 'Tidak ada baris untuk diekspor.');
    final headers = _rows.first.keys.toList();
    String cell(Object? v) {
      final s = '${v ?? ''}';
      return s.contains(RegExp('[",\n;]')) ? '"${s.replaceAll('"', '""')}"' : s;
    }

    final csv = StringBuffer()..writeln(headers.map(cell).join(','));
    for (final row in _rows) {
      csv.writeln(headers.map((h) => cell(row[h])).join(','));
    }
    final r = _range;
    final name = 'laporan-$_type-${_ymd.format(r.start)}_${_ymd.format(r.end)}.csv';
    final file = File('${(await getTemporaryDirectory()).path}/$name');
    // BOM so Excel opens the file as UTF-8 instead of mangling names.
    await file.writeAsString('﻿$csv');
    await Share.shareXFiles([XFile(file.path)], subject: name);
  }

  Tone _statusTone(String? s) => switch (s?.toUpperCase()) {
    'PAID' || 'ACTIVE' || 'SUCCESS' => Tone.success,
    'PENDING' || 'ISOLATED' => Tone.warning,
    'OVERDUE' || 'EXPIRED' || 'FAILED' => Tone.danger,
    _ => Tone.neutral,
  };

  String _statusLabel(String? s) => switch (s?.toUpperCase()) {
    'PAID' => 'Lunas',
    'PENDING' => 'Belum bayar',
    'OVERDUE' => 'Jatuh tempo',
    'CANCELLED' => 'Batal',
    'ACTIVE' => 'Aktif',
    'ISOLATED' => 'Terisolir',
    'STOPPED' => 'Berhenti',
    'EXPIRED' => 'Expired',
    'SUCCESS' => 'Berhasil',
    _ => s ?? '-',
  };

  Widget? _header() {
    final s = _summary;
    if (s == null) return null;
    final r = _range;
    final caption = '${_rangeLabel.format(r.start)} s/d ${_rangeLabel.format(r.end)}';
    final capped = _rows.length >= 5000 ? ' · dibatasi 5.000 baris' : '';
    return switch (_type) {
      'invoice' => _Summary(
        caption: caption + capped,
        label: 'Sudah dibayar',
        value: formatCurrency(numOf(s, 'paidAmount')),
        figures: [
          ('Total ditagihkan', formatCurrency(numOf(s, 'totalAmount')), null),
          ('Tagihan', '${numOf(s, 'total')}', null),
          ('Lunas', '${numOf(s, 'paid')}', Tone.success),
          ('Belum bayar', '${numOf(s, 'pending')}', Tone.warning),
          ('Jatuh tempo', '${numOf(s, 'overdue')}', Tone.danger),
        ],
      ),
      'payment' => _Summary(
        caption: caption + capped,
        label: 'Uang masuk',
        value: formatCurrency(numOf(s, 'totalAmount')),
        figures: [('Transaksi', '${numOf(s, 'total')}', null)],
      ),
      'customer' => _Summary(
        caption: caption + capped,
        label: 'Pelanggan terdaftar',
        value: '${numOf(s, 'total')}',
        figures: [
          ('Aktif', '${numOf(s, 'active')}', Tone.success),
          ('Terisolir', '${numOf(s, 'isolated')}', Tone.warning),
          ('Berhenti', '${numOf(s, 'stopped')}', null),
          ('Expired', '${numOf(s, 'expired')}', Tone.danger),
        ],
      ),
      // The profile report's summary names are swapped server-side:
      // totalAmount is what was collected, paidAmount is what is still owed.
      _ => _Summary(
        caption: caption,
        label: 'Pendapatan lunas',
        value: formatCurrency(numOf(s, 'totalAmount')),
        figures: [
          ('Masih tertunggak', formatCurrency(numOf(s, 'paidAmount')), Tone.warning),
          ('Paket', '${numOf(s, 'total')}', null),
        ],
      ),
    };
  }

  Widget _tile(Json r) {
    String? v(String k) => r[k] == null || r[k] == '-' ? null : '${r[k]}';
    final status = v('Status');
    final pill = status == null ? null : StatusPill(label: _statusLabel(status), tone: _statusTone(status));
    final (title, subtitle, meta, amount, icon) = switch (_type) {
      'invoice' => (v('Nama Pelanggan'), [v('No. Invoice'), v('Jenis')].whereType<String>().join(' · '), v('Jatuh Tempo') == null ? null : 'Jatuh tempo ${v('Jatuh Tempo')}', v('Jumlah (Rp)'), Icons.receipt_long_rounded),
      'payment' => (v('Nama Pelanggan'), [v('No. Invoice'), v('Metode')].whereType<String>().join(' · '), v('Tanggal Bayar'), v('Jumlah (Rp)'), Icons.payments_rounded),
      'customer' => (v('Nama'), [v('Username'), v('Paket')].whereType<String>().join(' · '), v('Terdaftar') == null ? null : 'Terdaftar ${v('Terdaftar')}', null, Icons.person_rounded),
      _ => (v('Paket'), '${v('Jumlah Pelanggan') ?? 0} pelanggan · ${v('Lunas') ?? 0} dari ${v('Total Invoice') ?? 0} tagihan lunas', v('Tertunggak (Rp)') == null ? null : 'Tertunggak ${v('Tertunggak (Rp)')}', v('Pendapatan (Rp)'), Icons.speed_rounded),
    };
    return EntityTile(
      icon: icon,
      tone: status == null ? Tone.primary : _statusTone(status),
      title: title ?? '-',
      subtitle: subtitle.isEmpty ? null : subtitle,
      meta: meta,
      trailing: amount == null && pill == null
          ? null
          : Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                if (amount != null) Text(amount, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
                if (amount != null && pill != null) const SizedBox(height: 4),
                if (pill != null) pill,
              ],
            ),
      onTap: () => showDetailSheet(
        context,
        header: DetailHeader(icon: icon, tone: Tone.primary, title: title ?? '-', subtitle: subtitle.isEmpty ? null : subtitle, status: pill),
        sections: [
          DetailSection(
            rows: [
              // The raw numeric columns duplicate their "(Rp)" twins.
              for (final e in r.entries)
                if (e.key != 'Jumlah' && e.key != 'Harga') InfoRow(e.key, e.value == '-' ? null : '${e.value}', copyable: e.key == 'No. Invoice' || e.key == 'Telepon'),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final statusOptions = switch (_type) {
      'invoice' => _invoiceStatus,
      'customer' => _customerStatus,
      _ => null,
    };
    final r = _range;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Laporan'),
        actions: [
          if (statusOptions != null)
            _filterMenu(context, tooltip: 'Status', selected: _status, options: statusOptions, onSelected: (v) => _reset(() => _status = v)),
          IconButton(tooltip: 'Ekspor CSV', icon: const Icon(Icons.ios_share_rounded), onPressed: _loading ? null : _exportCsv),
        ],
      ),
      body: Column(
        children: [
          FilterChipRow(
            options: _types,
            selected: _type,
            onSelected: (v) => _reset(() {
              _type = v;
              _status = 'all';
            }),
          ),
          FilterChipRow(
            options: [
              ('month', 'Bulan ini'),
              ('lastMonth', 'Bulan lalu'),
              ('quarter', '3 bulan'),
              ('custom', _period == 'custom' ? '${DateFormat('d/M').format(r.start)} - ${DateFormat('d/M').format(r.end)}' : 'Pilih tanggal'),
            ],
            selected: _period,
            onSelected: _pickPeriod,
          ),
          Expanded(
            child: DataStateView(
              loading: _loading,
              error: _error,
              onRetry: _load,
              isEmpty: false,
              emptyIcon: Icons.summarize_outlined,
              emptyMessage: '',
              child: RefreshableList(
                onRefresh: _load,
                header: _header(),
                itemCount: _rows.isEmpty ? 1 : _rows.length,
                itemBuilder: (_, i) => _rows.isEmpty ? const _EmptyRow('Tidak ada data di rentang ini. Coba pilih periode lain.') : _tile(_rows[i]),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Rekap Voucher (web /admin/hotspot/rekap-voucher)
// ---------------------------------------------------------------------------

/// Voucher sales per batch. "Semua batch" groups by batch creation date and
/// shows remaining stock; a period groups by the day each voucher was first
/// used, which is when it counts as sold.
class RekapVoucherScreen extends StatefulWidget {
  const RekapVoucherScreen({super.key});

  @override
  State<RekapVoucherScreen> createState() => _RekapVoucherScreenState();
}

class _RekapVoucherScreenState extends State<RekapVoucherScreen> {
  String _period = 'all';
  String _agent = 'all';
  List<Json> _rows = [];
  List<Json> _daily = [];
  List<(String, String)> _agents = const [('all', 'Semua agent')];
  Json? _res;
  bool _loading = true;
  String? _error;

  Map<String, String> get _query {
    final now = DateTime.now();
    final q = <String, String>{if (_agent != 'all') 'agentId': _agent};
    switch (_period) {
      case 'today':
        q['date'] = _ymd.format(now);
      case 'week':
        q['week'] = _ymd.format(now.subtract(Duration(days: now.weekday - 1)));
      case 'month':
        q['month'] = _ym.format(now);
      case 'lastMonth':
        q['month'] = _ym.format(DateTime(now.year, now.month - 1));
    }
    return q;
  }

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
      final res = await _api.get('/api/hotspot/rekap-voucher', query: _query);
      if (res is Map<String, dynamic>) {
        _res = res;
        _rows = _list(res['rekap']);
        _daily = _list(res['dailyBreakdown']);
        _agents = [('all', 'Semua agent'), ('', 'Tanpa agent'), for (final a in _list(res['agents'])) ('${a['id']}', str(a, 'name') ?? '-')];
        // The API has no "no agent" filter; that option filters on device.
        if (_agent == '') _rows = _rows.where((r) => r['agent'] == null).toList();
      }
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _reset(VoidCallback change) {
    setState(() {
      change();
      _rows = [];
      _res = null;
    });
    _load();
  }

  Widget? _header() {
    final res = _res;
    if (res == null) return null;
    final period = res['mode'] == 'period';
    num sum(String k) => _rows.fold<num>(0, (s, r) => s + numOf(r, k));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Summary(
          caption: period ? 'Dihitung dari tanggal voucher pertama dipakai' : 'Semua batch, dihitung dari tanggal batch dibuat',
          label: 'Pendapatan voucher terjual',
          value: formatCurrency(sum('totalRevenue')),
          figures: [
            ('Terjual', '${sum('sold')}', null),
            if (!period) ('Stok belum terjual', '${sum('stock')}', null),
            ('Bagian admin', formatCurrency(sum('adminEarnings')), Tone.success),
            ('Komisi agent', formatCurrency(sum('agentProfit')), null),
          ],
        ),
        if (_daily.length > 1) ...[
          const SizedBox(height: Gap.sm),
          Card(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(Gap.lg, 0, Gap.lg, Gap.md),
              child: DetailSection(
                title: 'Per hari',
                rows: [
                  for (final d in _daily) InfoRow(str(d, 'dateLabel') ?? str(d, 'date') ?? '-', '${numOf(d, 'sold')} terjual · ${formatCurrency(numOf(d, 'revenue'))}'),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _tile(Json r) {
    final period = _res?['mode'] == 'period';
    final agent = mapOf(r, 'agent');
    final profile = mapOf(r, 'profile');
    final sold = numOf(r, 'sold');
    final title = str(r, 'batchCode') ?? '-';
    final subtitle = [str(profile, 'name'), str(agent, 'name') ?? 'Dijual admin'].whereType<String>().join(' · ');
    return EntityTile(
      icon: Icons.confirmation_number_rounded,
      tone: sold > 0 ? Tone.success : Tone.neutral,
      title: title,
      subtitle: subtitle,
      meta: period ? '$sold terjual' : '$sold dari ${numOf(r, 'totalQty')} terjual · stok ${numOf(r, 'stock')}',
      trailing: Text(formatCurrency(numOf(r, 'totalRevenue')), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
      onTap: () => showDetailSheet(
        context,
        header: DetailHeader(
          icon: Icons.confirmation_number_rounded,
          tone: Tone.primary,
          title: title,
          subtitle: subtitle,
          figureLabel: 'Pendapatan',
          figure: formatCurrency(numOf(r, 'totalRevenue')),
        ),
        sections: [
          DetailSection(
            title: 'Penjualan',
            rows: [
              if (!period) InfoRow('Jumlah voucher', '${numOf(r, 'totalQty')}'),
              InfoRow('Terjual', '$sold'),
              InfoRow('Sedang aktif', '${numOf(r, 'active')}'),
              InfoRow('Sudah expired', '${numOf(r, 'expired')}'),
              if (!period) InfoRow('Stok', '${numOf(r, 'stock')}'),
            ],
          ),
          DetailSection(
            title: 'Harga per voucher',
            rows: [
              InfoRow('Harga jual', formatCurrency(numOf(r, 'sellingPrice'))),
              InfoRow('Harga modal agent', formatCurrency(numOf(r, 'costPrice'))),
              InfoRow('Komisi agent', formatCurrency(numOf(r, 'resellerFee'))),
            ],
          ),
          DetailSection(
            title: 'Pembagian',
            rows: [
              InfoRow('Bagian admin', formatCurrency(numOf(r, 'adminEarnings'))),
              InfoRow('Untung agent', agent == null ? null : formatCurrency(numOf(r, 'agentProfit'))),
              InfoRow('Agent', str(agent, 'name')),
              InfoRow('Router', str(mapOf(r, 'router'), 'name')),
              InfoRow(period ? 'Pertama terjual' : 'Batch dibuat', formatDateTimeOrNull(dateOf(r, period ? 'firstLoginAt' : 'createdAt'))),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Rekap Voucher'),
        actions: [
          _filterMenu(context, tooltip: 'Agent', selected: _agent, options: _agents, icon: Icons.storefront_rounded, onSelected: (v) => _reset(() => _agent = v)),
          IconButton(
            tooltip: 'Ekspor Excel',
            icon: const Icon(Icons.ios_share_rounded),
            onPressed: () => downloadAndShare(
              context,
              '/api/hotspot/rekap-voucher/export',
              'rekap-voucher-${_ymd.format(DateTime.now())}.xlsx',
              query: _query,
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          FilterChipRow(
            options: const [('all', 'Semua batch'), ('today', 'Hari ini'), ('week', 'Minggu ini'), ('month', 'Bulan ini'), ('lastMonth', 'Bulan lalu')],
            selected: _period,
            onSelected: (v) => _reset(() => _period = v),
          ),
          Expanded(
            child: DataStateView(
              loading: _loading,
              error: _error,
              onRetry: _load,
              isEmpty: false,
              emptyIcon: Icons.confirmation_number_outlined,
              emptyMessage: '',
              child: RefreshableList(
                onRefresh: _load,
                header: _header(),
                itemCount: _rows.isEmpty ? 1 : _rows.length,
                itemBuilder: (_, i) => _rows.isEmpty
                    ? _EmptyRow(_period == 'all' ? 'Belum ada batch voucher. Buat voucher dari menu Voucher Hotspot.' : 'Tidak ada voucher terjual di periode ini.')
                    : _tile(_rows[i]),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Laporan Agent (web /admin/hotspot/agent-report)
// ---------------------------------------------------------------------------

/// Per-agent sales for one day or one month: what each agent sold, what the
/// business keeps, commission owed, and stock still in the agent's hands.
class AgentReportScreen extends StatefulWidget {
  const AgentReportScreen({super.key});

  @override
  State<AgentReportScreen> createState() => _AgentReportScreenState();
}

class _AgentReportScreenState extends State<AgentReportScreen> {
  String _period = 'today';
  String _agent = 'all';
  List<Json> _rows = [];
  List<(String, String)> _agents = const [('all', 'Semua agent')];
  Json? _res;
  bool _loading = true;
  String? _error;

  Map<String, String> get _query {
    final now = DateTime.now();
    return {
      'agentId': _agent,
      ...switch (_period) {
        'yesterday' => {'type': 'daily', 'date': _ymd.format(now.subtract(const Duration(days: 1)))},
        'month' => {'type': 'monthly', 'month': _ym.format(now)},
        'lastMonth' => {'type': 'monthly', 'month': _ym.format(DateTime(now.year, now.month - 1))},
        _ => {'type': 'daily', 'date': _ymd.format(now)},
      },
    };
  }

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
      final res = await _api.get('/api/hotspot/agent-report', query: _query);
      if (res is Map<String, dynamic>) {
        _res = res;
        _rows = _list(res['report']);
        _agents = [('all', 'Semua agent'), for (final a in _list(res['agents'])) ('${a['id']}', str(a, 'name') ?? '-')];
      }
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _reset(VoidCallback change) {
    setState(() {
      change();
      _rows = [];
      _res = null;
    });
    _load();
  }

  Widget? _header() {
    final s = mapOf(_res, 'summary');
    if (s == null) return null;
    return _Summary(
      caption: str(_res, 'periodLabel'),
      label: 'Penjualan voucher agent',
      value: formatCurrency(numOf(s, 'totalRevenue')),
      figures: [
        ('Bagian admin', formatCurrency(numOf(s, 'totalAdminEarnings')), Tone.success),
        ('Komisi agent', formatCurrency(numOf(s, 'totalCommission')), null),
        ('Terjual', '${numOf(s, 'totalSold')} dari ${numOf(s, 'totalGenerated')}', null),
        ('Stok di agent', '${numOf(s, 'totalStock')} · ${formatCurrency(numOf(s, 'totalStockValue'))}', null),
        if (numOf(s, 'totalUnpaidAmount') > 0) ('Penjualan belum dibayar', formatCurrency(numOf(s, 'totalUnpaidAmount')), Tone.warning),
      ],
    );
  }

  Widget _tile(Json a) {
    final inactive = a['isActive'] == false;
    final breakdown = _list(a['profileBreakdown']);
    return EntityTile(
      icon: Icons.storefront_rounded,
      tone: inactive ? Tone.neutral : Tone.accent,
      title: str(a, 'agentName') ?? '-',
      subtitle: '${numOf(a, 'sold')} terjual · stok ${numOf(a, 'currentStock')}',
      meta: 'Saldo ${formatCurrency(numOf(a, 'balance'))}',
      trailing: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(formatCurrency(numOf(a, 'totalRevenue')), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
          if (inactive) ...[const SizedBox(height: 4), const StatusPill(label: 'Nonaktif', tone: Tone.neutral)],
        ],
      ),
      onTap: () => showDetailSheet(
        context,
        header: DetailHeader(
          icon: Icons.storefront_rounded,
          tone: Tone.accent,
          title: str(a, 'agentName') ?? '-',
          subtitle: [str(a, 'agentPhone'), str(mapOf(a, 'router'), 'name')].whereType<String>().join(' · '),
          figureLabel: 'Penjualan ${str(_res, 'periodLabel') ?? ''}'.trim(),
          figure: formatCurrency(numOf(a, 'totalRevenue')),
        ),
        sections: [
          DetailSection(
            title: 'Voucher di periode ini',
            rows: [
              InfoRow('Dibuat', '${numOf(a, 'totalGenerated')}'),
              InfoRow('Terjual', '${numOf(a, 'sold')}'),
              InfoRow('Belum terpakai', '${numOf(a, 'waiting')}'),
            ],
          ),
          DetailSection(
            title: 'Uang',
            rows: [
              InfoRow('Bagian admin', formatCurrency(numOf(a, 'adminEarnings'))),
              InfoRow('Komisi agent', formatCurrency(numOf(a, 'totalCommission'))),
              InfoRow('Transaksi jual', '${numOf(a, 'salesCount')} · ${formatCurrency(numOf(a, 'totalSalesAmount'))}'),
              InfoRow('Belum dibayar', numOf(a, 'unpaidCount') == 0 ? null : '${numOf(a, 'unpaidCount')} · ${formatCurrency(numOf(a, 'unpaidAmount'))}', valueColor: context.tone(Tone.warning)),
              InfoRow('Saldo agent', formatCurrency(numOf(a, 'balance'))),
            ],
          ),
          DetailSection(
            title: 'Stok saat ini',
            rows: [InfoRow('Voucher belum terjual', '${numOf(a, 'currentStock')} · nilai modal ${formatCurrency(numOf(a, 'stockValue'))}')],
          ),
          if (breakdown.isNotEmpty)
            DetailSection(
              title: 'Per profil',
              rows: [
                for (final p in breakdown)
                  InfoRow(str(p, 'profileName') ?? '-', '${numOf(p, 'sold')} dari ${numOf(p, 'generated')} terjual · ${formatCurrency(numOf(p, 'revenue'))}'),
              ],
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Laporan Agent'),
        actions: [_filterMenu(context, tooltip: 'Agent', selected: _agent, options: _agents, icon: Icons.storefront_rounded, onSelected: (v) => _reset(() => _agent = v))],
      ),
      body: Column(
        children: [
          FilterChipRow(
            options: const [('today', 'Hari ini'), ('yesterday', 'Kemarin'), ('month', 'Bulan ini'), ('lastMonth', 'Bulan lalu')],
            selected: _period,
            onSelected: (v) => _reset(() => _period = v),
          ),
          Expanded(
            child: DataStateView(
              loading: _loading,
              error: _error,
              onRetry: _load,
              isEmpty: false,
              emptyIcon: Icons.storefront_outlined,
              emptyMessage: '',
              child: RefreshableList(
                onRefresh: _load,
                header: _header(),
                itemCount: _rows.isEmpty ? 1 : _rows.length,
                itemBuilder: (_, i) => _rows.isEmpty ? const _EmptyRow('Belum ada agent. Tambahkan dari menu Agent.') : _tile(_rows[i]),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Pelanggan Terisolir (web /admin/isolated-users)
// ---------------------------------------------------------------------------

String? _payLink(Json inv) {
  final link = str(inv, 'paymentLink');
  if (link != null) return link;
  final token = str(inv, 'paymentToken');
  if (token == null) return null;
  return '${_api.baseUrl.replaceFirst(RegExp(r'/+$'), '')}/pay/$token';
}

/// Customers cut off for non-payment or suspension, with what they owe and
/// whether they are still connected to the isolation network.
CrudConfig isolatedUsersConfig() => CrudConfig(
  title: 'Pelanggan Terisolir',
  noun: 'Pelanggan',
  icon: Icons.block_rounded,
  tone: Tone.warning,
  fetch: (_) => _api.get('/api/admin/isolated-users'),
  listKey: 'data',
  filters: const [('all', 'Semua'), ('online', 'Online'), ('offline', 'Offline')],
  filterOf: (u) => u['isOnline'] == true ? 'online' : 'offline',
  initialFilter: 'all',
  searchable: true,
  searchHint: 'Cari nama, username, atau nomor HP',
  searchTextOf: (u) => '${u['name']} ${u['username']} ${u['phone']} ${u['customerId']}',
  header: (context, items) {
    if (items.isEmpty) return null;
    final owed = items.fold<num>(0, (s, u) => s + numOf(u, 'totalUnpaid'));
    final online = items.where((u) => u['isOnline'] == true).length;
    return _Summary(
      label: 'Tunggakan pelanggan terisolir',
      value: formatCurrency(owed),
      figures: [
        ('Pelanggan', '${items.length}', null),
        ('Masih online', '$online', Tone.warning),
        ('Tagihan terbuka', '${items.fold<num>(0, (s, u) => s + numOf(u, 'unpaidInvoicesCount'))}', null),
      ],
    );
  },
  titleOf: (u) => str(u, 'name') ?? str(u, 'username') ?? '-',
  subtitleOf: (u) => ['@${u['username']}', str(u, 'profileName')].whereType<String>().join(' · '),
  metaOf: (u) => [
    if (dateOf(u, 'expiredAt') != null) 'Expired ${formatDate(dateOf(u, 'expiredAt')!)}',
    str(u, 'areaName'),
    if (u['isOnline'] == true) 'Online ${str(u, 'ipAddress') ?? ''}'.trim(),
  ].whereType<String>().join(' · '),
  toneOf: (u) => u['status'] == 'suspended' ? Tone.neutral : Tone.warning,
  statusOf: (u) => StatusPill(label: u['status'] == 'suspended' ? 'Suspend' : 'Terisolir', tone: u['status'] == 'suspended' ? Tone.neutral : Tone.warning),
  figureOf: (u) => numOf(u, 'totalUnpaid') > 0 ? formatCurrency(numOf(u, 'totalUnpaid')) : null,
  figureLabel: 'Tunggakan',
  emptyIcon: Icons.verified_rounded,
  emptyMessage: 'Tidak ada pelanggan terisolir',
  emptyHint: 'Pelanggan yang diisolir karena telat bayar akan muncul di sini.',
  sectionsOf: (context, u) {
    final invoices = _list(u['unpaidInvoices']);
    return [
      DetailSection(
        title: 'Pelanggan',
        rows: [
          InfoRow('ID pelanggan', str(u, 'customerId'), copyable: true),
          InfoRow('Username', str(u, 'username'), copyable: true),
          InfoRow('No. HP', str(u, 'phone'), copyable: true),
          InfoRow('Paket', [str(u, 'profileName'), if (u['profilePrice'] != null) formatCurrency(numOf(u, 'profilePrice'))].whereType<String>().join(' · ')),
          InfoRow('Area', str(u, 'areaName')),
          InfoRow('Expired', formatDateOrNull(dateOf(u, 'expiredAt'))),
        ],
      ),
      DetailSection(
        title: 'Koneksi',
        rows: [
          InfoRow('Status', u['isOnline'] == true ? 'Online di jaringan isolir' : 'Offline'),
          InfoRow('IP', str(u, 'ipAddress'), copyable: true),
          InfoRow('NAS', str(u, 'nasIp')),
          InfoRow('Login sejak', formatDateTimeOrNull(dateOf(u, 'loginTime'))),
        ],
      ),
      if (invoices.isNotEmpty)
        DetailSection(
          title: 'Tagihan belum dibayar',
          rows: [
            for (final inv in invoices)
              InfoRow(
                str(inv, 'invoiceNumber') ?? '-',
                '${formatCurrency(numOf(inv, 'amount'))} · jatuh tempo ${formatDateOrNull(dateOf(inv, 'dueDate')) ?? '-'}',
              ),
          ],
        ),
    ];
  },
  itemActions: [
    CrudAction('Buka pelanggan', Icons.person_rounded, (ctx, u) async {
      await Navigator.of(ctx).push(MaterialPageRoute(builder: (_) => PppoeDetailScreen(userId: '${u['id']}')));
      return true;
    }, kind: ActionKind.primary),
    CrudAction(
      'Kirim link bayar',
      Icons.chat_rounded,
      (ctx, u) {
        final inv = _list(u['unpaidInvoices']).first;
        final link = _payLink(inv);
        return openForm(
          ctx,
          title: 'Kirim Link Bayar',
          submitLabel: 'Kirim WhatsApp',
          fields: const [
            FieldSpec('phone', 'Nomor tujuan', type: FieldType.phone, required: true),
            FieldSpec('message', 'Pesan', type: FieldType.multiline, required: true),
          ],
          initial: {
            'phone': u['phone'],
            'message': 'Halo ${u['name']}, layanan internet Anda sedang diisolir karena tagihan ${str(inv, 'invoiceNumber') ?? ''} '
                'sebesar ${formatCurrency(numOf(inv, 'amount'))} belum dibayar.'
                '${link == null ? '' : ' Silakan bayar melalui link berikut: $link'}',
          },
          success: 'Pesan dikirim.',
          onSubmit: (v) => _api.post('/api/whatsapp/send', data: v),
        );
      },
      kind: ActionKind.success,
      visible: (u) => str(u, 'phone') != null && _list(u['unpaidInvoices']).isNotEmpty,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Trace Fiber (web /admin/network/trace)
// ---------------------------------------------------------------------------

/// Follows a fiber from one core through every splice to its end, with the
/// loss budget, or lists every splice inside one closure/ODC/ODP/OTB.
class FiberTraceScreen extends StatefulWidget {
  const FiberTraceScreen({super.key});

  @override
  State<FiberTraceScreen> createState() => _FiberTraceScreenState();
}

class _FiberTraceScreenState extends State<FiberTraceScreen> {
  static const _deviceTypes = [('ODC', 'ODC'), ('ODP', 'ODP'), ('JOINT_CLOSURE', 'Joint Closure'), ('OTB', 'OTB')];

  Json? _result;
  String? _subject;
  String? _mode;

  static Future<FieldOptions> _cores() async {
    final list = await fetchAllPages('/api/network/cores', listKey: 'cores');
    return [
      for (final c in list)
        ('${c['id']}', '${str(mapOf(mapOf(c, 'tube'), 'cable'), 'code') ?? '?'} T${mapOf(c, 'tube')?['tubeNumber'] ?? '-'} C${c['coreNumber'] ?? '-'} ${c['colorCode'] ?? ''} · ${c['status'] ?? ''}'.trim()),
    ];
  }

  static Future<FieldOptions> _devices(String type) => optionsFrom(
    () => _api.get(switch (type) {
      'ODC' => '/api/network/odcs',
      'ODP' => '/api/network/odps',
      'JOINT_CLOSURE' => '/api/network/joint-closures',
      _ => '/api/network/otbs',
    }, query: {'limit': 1000}),
    listKey: switch (type) {
      'ODC' => 'odcs',
      'ODP' => 'odps',
      'JOINT_CLOSURE' => 'data',
      _ => 'otbs',
    },
    label: (d) => [str(d, 'name'), str(d, 'code')].whereType<String>().toSet().join(' · '),
  );

  Future<void> _search() async {
    await openForm(
      context,
      title: 'Telusuri Fiber',
      submitLabel: 'Telusuri',
      fields: [
        const FieldSpec('mode', 'Mulai dari', type: FieldType.select, required: true, initial: 'core', options: [('core', 'Satu core'), ('device', 'Satu perangkat')]),
        FieldSpec('coreId', 'Core', type: FieldType.select, required: true, loadOptions: _cores, visibleIf: (v) => v['mode'] == 'core'),
        FieldSpec(
          'direction',
          'Arah',
          type: FieldType.select,
          initial: 'both',
          options: const [('both', 'Dua arah'), ('downstream', 'Ke pelanggan'), ('upstream', 'Ke OLT')],
          visibleIf: (v) => v['mode'] == 'core',
        ),
        FieldSpec('deviceType', 'Jenis perangkat', type: FieldType.select, required: true, initial: 'ODC', options: _deviceTypes, visibleIf: (v) => v['mode'] == 'device'),
        for (final (t, label) in _deviceTypes)
          FieldSpec('device_$t', label, type: FieldType.select, required: true, loadOptions: () => _devices(t), visibleIf: (v) => v['mode'] == 'device' && v['deviceType'] == t),
      ],
      initial: {'mode': _mode ?? 'core'},
      onSubmit: (v) async {
        final device = v['mode'] == 'device';
        final res = await _api.get(
          '/api/network/trace',
          query: device
              ? {'type': 'device', 'deviceType': v['deviceType'], 'deviceId': v['device_${v['deviceType']}']}
              : {'type': 'core', 'coreId': v['coreId'], 'direction': v['direction'] ?? 'both'},
        );
        setState(() {
          _mode = v['mode'] as String;
          _result = (res is Map<String, dynamic>) ? res : null;
          _subject = device ? _deviceTypes.firstWhere((t) => t.$1 == v['deviceType']).$2 : null;
        });
      },
    );
  }

  List<Widget> _coreResult(Json r) {
    final start = mapOf(r, 'startCore');
    final budget = mapOf(r, 'signalBudget');
    final steps = _list(r['steps']);
    final ok = budget?['isWithinBudget'] == true;
    return [
      _Summary(
        caption: 'Mulai dari ${str(start, 'cableName') ?? 'kabel'} tube ${start?['tubeNumber'] ?? '-'} core ${start?['coreNumber'] ?? '-'}',
        label: 'Redaman total',
        value: '${numOf(r, 'totalAttenuation').toStringAsFixed(2)} dB',
        figures: [
          if (budget != null) ...[
            ('Perkiraan sinyal di ONU', '${numOf(budget, 'expectedSignal').toStringAsFixed(2)} dBm', ok ? Tone.success : Tone.danger),
            ('Sisa margin', '${numOf(budget, 'margin').toStringAsFixed(2)} dB', ok ? Tone.success : Tone.danger),
            ('Sensitivitas ONU', '${numOf(budget, 'onuSensitivity')} dBm', null),
          ],
          ('Titik dilewati', '${steps.length}', null),
        ],
      ),
      const SizedBox(height: Gap.sm),
      if (steps.isEmpty) const _EmptyRow('Core ini belum tersambung ke splice mana pun.'),
      for (final s in steps)
        Padding(
          padding: const EdgeInsets.only(bottom: Gap.sm),
          child: EntityTile(
            icon: s['type'] == 'DEVICE' ? Icons.inventory_2_rounded : Icons.linear_scale_rounded,
            tone: s['type'] == 'DEVICE' ? Tone.violet : Tone.accent,
            title: '${s['order'] ?? ''}. ${str(s, 'deviceName') ?? str(s, 'deviceType') ?? '-'}',
            subtitle: [
              str(s, 'deviceType'),
              if (s['tubeNumber'] != null) 'T${s['tubeNumber']} C${s['coreNumber'] ?? '-'}',
              str(s, 'spliceType'),
            ].whereType<String>().join(' · '),
            meta: str(s, 'notes'),
            trailing: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text('${numOf(s, 'cumulativeAttenuation').toStringAsFixed(2)} dB', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                Text('+${numOf(s, 'attenuation').toStringAsFixed(2)}', style: TextStyle(fontSize: 11.5, color: context.colors.onSurfaceVariant)),
              ],
            ),
          ),
        ),
    ];
  }

  List<Widget> _deviceResult(Json r) {
    final splices = _list(r['splices']);
    String core(Json? c) => c == null ? '-' : '${c['cable'] ?? '?'} T${c['tube'] ?? '-'} C${c['core'] ?? '-'}';
    return [
      _Summary(label: 'Sambungan di $_subject ini', value: '${numOf(r, 'spliceCount')}'),
      const SizedBox(height: Gap.sm),
      if (splices.isEmpty) const _EmptyRow('Belum ada sambungan aktif di perangkat ini. Tambahkan dari menu Titik Sambung.'),
      for (final s in splices)
        Padding(
          padding: const EdgeInsets.only(bottom: Gap.sm),
          child: EntityTile(
            icon: Icons.linear_scale_rounded,
            tone: Tone.accent,
            title: '${core(mapOf(s, 'incomingCore'))}  ke  ${core(mapOf(s, 'outgoingCore'))}',
            subtitle: ['Tray ${s['trayNumber'] ?? '-'}', str(s, 'spliceType')].whereType<String>().join(' · '),
            trailing: s['insertionLoss'] == null ? null : Text('${s['insertionLoss']} dB', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
          ),
        ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final r = _result;
    return Scaffold(
      appBar: AppBar(title: const Text('Trace Fiber')),
      floatingActionButton: FloatingActionButton.extended(onPressed: _search, icon: const Icon(Icons.route_rounded), label: Text(r == null ? 'Telusuri' : 'Telusuri lagi')),
      body: r == null
          ? EmptyState(
              icon: Icons.route_rounded,
              message: 'Pilih core atau perangkat',
              hint: 'Trace mengikuti core melewati setiap splice dan menghitung redaman sampai ujungnya.',
            )
          : ListView(
              padding: EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, listBottomPadding(context, hasFab: true)),
              children: _mode == 'device' ? _deviceResult(r) : _coreResult(r),
            ),
    );
  }
}
