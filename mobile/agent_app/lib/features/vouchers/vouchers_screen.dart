import 'dart:async';
import 'dart:ui' show FontFeature;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import '../../core/widgets/underline_tabs.dart';
import '../auth/auth_provider.dart';
import '../print/voucher_print.dart';

/// Daftar voucher agen dengan tab status (Semua / Menunggu / Aktif / Kedaluwarsa),
/// pencarian kode, dan tombol Buat Voucher — sama dengan halaman voucher portal agen.
class VouchersScreen extends StatefulWidget {
  const VouchersScreen({super.key, this.generateSignal});

  /// Dinaikkan oleh shell (tombol "Buat Voucher" di Ringkasan) untuk membuka sheet pembuatan.
  final ValueNotifier<int>? generateSignal;

  @override
  State<VouchersScreen> createState() => _VouchersScreenState();
}

Tone _voucherTone(String status) {
  switch (status.toUpperCase()) {
    case 'ACTIVE':
      return Tone.success;
    case 'EXPIRED':
      return Tone.danger;
    case 'SOLD':
      return Tone.primary;
    default:
      return Tone.neutral;
  }
}

String _voucherLabel(String status) {
  switch (status.toUpperCase()) {
    case 'WAITING':
      return 'Menunggu';
    case 'SOLD':
      return 'Terjual';
    case 'ACTIVE':
      return 'Aktif';
    case 'EXPIRED':
      return 'Kedaluwarsa';
    default:
      return status;
  }
}

class _VouchersScreenState extends State<VouchersScreen> {
  static const _limit = 20;
  static const _tabs = <(String, String)>[
    ('ALL', 'Semua'),
    ('WAITING', 'Menunggu'),
    ('SOLD', 'Terjual'),
    ('ACTIVE', 'Aktif'),
    ('EXPIRED', 'Expired'),
  ];

  final _scroll = ScrollController();
  final _searchCtl = TextEditingController();
  Timer? _debounce;

  List<Map<String, dynamic>> _items = [];
  List<Map<String, dynamic>> _profiles = [];
  num _balance = 0;
  int _page = 1;
  int _totalPages = 1;
  int _total = 0;
  String _status = 'ALL';
  String? _profileFilter;
  String _search = '';
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 300) _loadMore();
    });
    widget.generateSignal?.addListener(_onSignal);
    _load();
  }

  void _onSignal() {
    if (mounted) _generate();
  }

  @override
  void dispose() {
    widget.generateSignal?.removeListener(_onSignal);
    _debounce?.cancel();
    _scroll.dispose();
    _searchCtl.dispose();
    super.dispose();
  }

  Future<Map<String, dynamic>> _fetch(int page) async {
    final res = await ApiClient.instance.get('/api/agent/dashboard', query: {
      'page': page,
      'limit': _limit,
      if (_status != 'ALL') 'status': _status,
      if (_search.isNotEmpty) 'search': _search,
      if (_profileFilter != null) 'profileId': _profileFilter,
    });
    return res is Map ? Map<String, dynamic>.from(res) : <String, dynamic>{};
  }

  List<Map<String, dynamic>> _list(dynamic v) => (v as List?)?.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() ?? [];

  Future<void> _load() async {
    setState(() {
      _loading = _items.isEmpty;
      _error = null;
    });
    try {
      final res = await _fetch(1);
      if (!mounted) return;
      final pg = mapOf(res, 'pagination');
      setState(() {
        _items = _list(res['vouchers']);
        _profiles = _list(res['profiles']);
        _balance = numOf(mapOf(res, 'agent'), 'balance');
        _page = 1;
        _totalPages = numOf(pg, 'totalPages').toInt();
        _total = numOf(pg, 'total').toInt();
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadMore() async {
    if (_loading || _loadingMore || _page >= _totalPages) return;
    setState(() => _loadingMore = true);
    try {
      final res = await _fetch(_page + 1);
      if (!mounted) return;
      setState(() {
        _items = [..._items, ..._list(res['vouchers'])];
        _page += 1;
      });
    } on ApiException catch (e) {
      if (mounted) showToast(context, e.message);
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  void _setStatus(String s) {
    if (s == _status) return;
    setState(() {
      _status = s;
      _items = [];
    });
    _load();
  }

  void _onSearch(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 450), () {
      _search = v.trim();
      setState(() => _items = []);
      _load();
    });
  }

  Future<void> _generate() async {
    final agentId = context.read<AuthProvider>().user?.id ?? '';
    final done = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _GenerateSheet(profiles: _profiles, balance: _balance, agentId: agentId),
    );
    if (done == true) _load();
  }

  void _detail(Map<String, dynamic> v) {
    final code = str(v, 'code') ?? '-';
    final status = str(v, 'status') ?? '-';
    final text = 'Voucher WiFi\nKode: $code\nPaket: ${str(v, 'profileName') ?? '-'}';
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Gap.page),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: SelectableText(code, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: 1))),
                  StatusPill(label: _voucherLabel(status), tone: _voucherTone(status)),
                ],
              ),
              const SizedBox(height: Gap.md),
              _kv(ctx, 'Paket', str(v, 'profileName')),
              _kv(ctx, 'Password', (str(v, 'password') != null && str(v, 'password') != code) ? str(v, 'password') : null),
              _kv(ctx, 'Masa aktif', str(v, 'validity')),
              _kv(ctx, 'Kecepatan', str(v, 'speed')),
              _kv(ctx, 'Kuota', str(v, 'usageQuota')),
              _kv(ctx, 'Harga jual', formatCurrency(numOf(v, 'sellingPrice'))),
              _kv(ctx, 'Komisi', formatCurrency(numOf(v, 'resellerFee'))),
              _kv(ctx, 'Batch', str(v, 'batchCode')),
              _kv(ctx, 'Router', str(v, 'routerName')),
              _kv(ctx, 'Dibuat', formatDateTimeOrNull(dateOf(v, 'createdAt')?.toLocal())),
              _kv(ctx, 'Pertama dipakai', formatDateTimeOrNull(dateOf(v, 'firstLoginAt')?.toLocal())),
              _kv(ctx, 'Kedaluwarsa', formatDateTimeOrNull(dateOf(v, 'expiresAt')?.toLocal())),
              const SizedBox(height: Gap.lg),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () {
                        Clipboard.setData(ClipboardData(text: code));
                        Navigator.pop(ctx);
                        showToast(context, 'Kode disalin');
                      },
                      icon: const Icon(Icons.copy_rounded, size: 18),
                      label: const Text('Salin'),
                    ),
                  ),
                  const SizedBox(width: Gap.sm),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: () => Share.share(text, subject: 'Voucher WiFi'),
                      icon: const Icon(Icons.share_rounded, size: 18),
                      label: const Text('Bagikan'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: Gap.sm),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(44)),
                onPressed: () {
                  Navigator.pop(ctx);
                  showVoucherPrintSheet(context, [v]);
                },
                icon: const Icon(Icons.print_rounded, size: 18),
                label: const Text('Cetak voucher'),
              ),
              const SizedBox(height: Gap.sm),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(44)),
                onPressed: () {
                  Navigator.pop(ctx);
                  sendVoucherWhatsApp(context, text);
                },
                icon: const Icon(Icons.chat_rounded, size: 18),
                label: const Text('Kirim ke WhatsApp pembeli'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _kv(BuildContext context, String k, String? v) {
    if (v == null || v.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 120, child: Text(k, style: TextStyle(color: context.colors.onSurfaceVariant, fontSize: 13))),
          Expanded(child: Text(v, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }

  Widget _statusBar(BuildContext context) => UnderlineTabs(options: _tabs, selected: _status, onSelected: _setStatus);

  Widget _profileBar(BuildContext context) {
    if (_profiles.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(Gap.page, Gap.lg, Gap.page, Gap.sm),
      child: DropdownButtonFormField<String?>(
        value: _profileFilter,
        isExpanded: true,
        isDense: true,
        decoration: const InputDecoration(labelText: 'Paket', prefixIcon: Icon(Icons.filter_list_rounded, size: 20)),
        items: [
          const DropdownMenuItem<String?>(value: null, child: Text('Semua paket')),
          for (final p in _profiles) DropdownMenuItem<String?>(value: str(p, 'id'), child: Text(str(p, 'name') ?? '-', overflow: TextOverflow.ellipsis)),
        ],
        onChanged: (v) {
          setState(() {
            _profileFilter = v;
            _items = [];
          });
          _load();
        },
      ),
    );
  }

  Widget _card(BuildContext context, Map<String, dynamic> v) {
    final c = context.colors;
    final status = str(v, 'status') ?? '-';
    final tone = context.tone(_voucherTone(status));
    final batch = str(v, 'batchCode');
    final shortBatch = batch == null ? null : (batch.length > 6 ? batch.substring(batch.length - 6) : batch);
    final created = formatDateTimeOrNull(dateOf(v, 'createdAt')?.toLocal())?.split(',').first;
    return Padding(
      padding: const EdgeInsets.only(bottom: Gap.sm),
      child: Material(
        color: c.surface,
        borderRadius: BorderRadius.circular(AppTheme.radiusCard),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => _detail(v),
          child: Container(
            decoration: BoxDecoration(
              border: Border.all(color: c.outlineVariant),
              borderRadius: BorderRadius.circular(AppTheme.radiusCard),
            ),
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(width: 5, color: tone),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(Gap.md, Gap.md, Gap.md, Gap.md),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(str(v, 'code') ?? '-', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, letterSpacing: 1.2, fontFeatures: [FontFeature.tabularFigures()])),
                                const SizedBox(height: 2),
                                Text(str(v, 'profileName') ?? '-', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, color: c.onSurface)),
                                const SizedBox(height: 6),
                                Text(
                                  [if (created != null) created, if (shortBatch != null) 'batch $shortBatch'].join(', '),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(fontSize: 12, color: c.onSurfaceVariant),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: Gap.md),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(formatCurrency(numOf(v, 'sellingPrice')), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                              const SizedBox(height: 6),
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Container(width: 8, height: 8, decoration: BoxDecoration(color: tone, shape: BoxShape.circle)),
                                  const SizedBox(width: 6),
                                  Text(_voucherLabel(status), style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: tone)),
                                ],
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Voucher')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _profiles.isEmpty && _loading ? null : _generate,
        icon: const Icon(Icons.add_rounded),
        label: const Text('Buat Voucher'),
      ),
      body: Column(
        children: [
          SearchField(hint: 'Cari kode voucher', controller: _searchCtl, onChanged: _onSearch),
          _statusBar(context),
          _profileBar(context),
          Expanded(
            child: DataStateView(
              loading: _loading,
              error: _error,
              isEmpty: _items.isEmpty,
              emptyIcon: Icons.confirmation_number_outlined,
              emptyMessage: 'Belum ada voucher',
              emptyHint: _search.isNotEmpty || _status != 'ALL' || _profileFilter != null ? 'Coba ubah pencarian atau filter.' : 'Tekan Buat Voucher untuk membuat stok voucher.',
              onRetry: _load,
              child: RefreshableList(
                controller: _scroll,
                hasFab: true,
                loadingMore: _loadingMore,
                itemCount: _items.length,
                onRefresh: _load,
                header: Padding(
                  padding: const EdgeInsets.only(bottom: Gap.sm, left: 2),
                  child: Text('$_total voucher · saldo ${formatCurrency(_balance)}', style: TextStyle(fontSize: 12.5, color: context.colors.onSurfaceVariant)),
                ),
                itemBuilder: (context, i) => _card(context, _items[i]),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _GenerateSheet extends StatefulWidget {
  const _GenerateSheet({required this.profiles, required this.balance, required this.agentId});
  final List<Map<String, dynamic>> profiles;
  final num balance;
  final String agentId;

  @override
  State<_GenerateSheet> createState() => _GenerateSheetState();
}

class _GenerateSheetState extends State<_GenerateSheet> {
  static const _codeTypes = <(String, String)>[
    ('alpha-upper', 'Huruf besar (ABCD)'),
    ('alpha-lower', 'Huruf kecil (abcd)'),
    ('alpha-mixed', 'Huruf campuran (AbCd)'),
    ('numeric', 'Angka (1234)'),
    ('alphanumeric-upper', 'Huruf besar + angka (AB12)'),
    ('alphanumeric-lower', 'Huruf kecil + angka (ab12)'),
    ('alphanumeric-mixed', 'Campuran + angka (Ab12)'),
  ];

  String? _profileId;
  String _codeType = 'alphanumeric-upper';
  String _voucherType = 'same';
  final _qty = TextEditingController(text: '1');
  final _len = TextEditingController(text: '6');
  final _prefix = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.profiles.isNotEmpty) _profileId = str(widget.profiles.first, 'id');
  }

  @override
  void dispose() {
    _qty.dispose();
    _len.dispose();
    _prefix.dispose();
    super.dispose();
  }

  num get _total {
    final qty = int.tryParse(_qty.text.trim()) ?? 0;
    final p = widget.profiles.where((e) => str(e, 'id') == _profileId);
    if (p.isEmpty || qty < 1) return 0;
    return numOf(p.first, 'sellingPrice') * qty;
  }

  Future<void> _submit() async {
    final qty = int.tryParse(_qty.text.trim()) ?? 0;
    final len = int.tryParse(_len.text.trim()) ?? 0;
    if (_profileId == null) {
      setState(() => _error = 'Pilih paket voucher.');
      return;
    }
    if (qty < 1 || qty > 500) {
      setState(() => _error = 'Jumlah voucher 1 sampai 500.');
      return;
    }
    if (len < 4 || len > 32) {
      setState(() => _error = 'Panjang kode 4 sampai 32 karakter.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.post('/api/agent/generate-voucher', data: {
        'agentId': widget.agentId,
        'profileId': _profileId,
        'quantity': qty,
        'codeLength': len,
        'codeType': _codeType,
        'voucherType': _voucherType,
        'prefix': _prefix.text.trim(),
      });
      if (!mounted) return;
      final vouchers = ((res is Map ? res['vouchers'] : null) as List?)?.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() ?? [];
      final profile = widget.profiles.firstWhere((p) => str(p, 'id') == _profileId, orElse: () => const {});
      final nav = Navigator.of(context);
      nav.pop(true);
      nav.push(MaterialPageRoute(
        builder: (_) => GeneratedVouchersScreen(
          vouchers: vouchers,
          profileName: str(profile, 'name') ?? '',
          profileInfo: res is Map ? (mapOf(Map<String, dynamic>.from(res), 'profile') ?? const <String, dynamic>{}) : const {},
          batchCode: res is Map ? str(Map<String, dynamic>.from(res), 'batchCode') : null,
          cost: res is Map ? numOf(Map<String, dynamic>.from(res), 'cost') : 0,
          newBalance: res is Map ? numOf(Map<String, dynamic>.from(res), 'newBalance') : 0,
        ),
      ));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(Gap.page, Gap.md, Gap.page, (MediaQuery.viewInsetsOf(context).bottom > 0 ? MediaQuery.viewInsetsOf(context).bottom : MediaQuery.viewPaddingOf(context).bottom) + Gap.page),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Buat Voucher', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Text('Saldo ${formatCurrency(widget.balance)} — dipotong sesuai paket dan jumlah.', style: TextStyle(fontSize: 12.5, color: context.colors.onSurfaceVariant)),
            const SizedBox(height: Gap.lg),
            if (widget.profiles.isEmpty)
              Text('Belum ada paket voucher yang dibuka untuk agen. Hubungi admin.', style: TextStyle(color: context.tone(Tone.danger)))
            else
              DropdownButtonFormField<String>(
                value: _profileId,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Paket'),
                items: [
                  for (final p in widget.profiles)
                    DropdownMenuItem(
                      value: str(p, 'id'),
                      child: Text('${str(p, 'name') ?? '-'} · ${formatCurrency(numOf(p, 'sellingPrice'))}', overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (v) => setState(() => _profileId = v),
              ),
            const SizedBox(height: Gap.md),
            DropdownButtonFormField<String>(
              value: _voucherType,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Tipe voucher'),
              items: const [
                DropdownMenuItem(value: 'same', child: Text('Username = Password')),
                DropdownMenuItem(value: 'different', child: Text('Username ≠ Password')),
              ],
              onChanged: (v) => setState(() => _voucherType = v ?? _voucherType),
            ),
            const SizedBox(height: Gap.md),
            Row(
              children: [
                Expanded(
                  child: TextField(onChanged: (_) => setState(() {}), controller: _qty, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Jumlah')),
                ),
                const SizedBox(width: Gap.md),
                Expanded(
                  child: TextField(controller: _len, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Panjang kode')),
                ),
              ],
            ),
            const SizedBox(height: Gap.md),
            DropdownButtonFormField<String>(
              value: _codeType,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Jenis kode'),
              items: [for (final t in _codeTypes) DropdownMenuItem(value: t.$1, child: Text(t.$2))],
              onChanged: (v) => setState(() => _codeType = v ?? _codeType),
            ),
            const SizedBox(height: Gap.md),
            TextField(controller: _prefix, maxLength: 10, decoration: const InputDecoration(labelText: 'Awalan kode (opsional)', counterText: '', helperText: 'Panjang kode sudah termasuk awalan.')),
            if (_total > 0) ...[
              const SizedBox(height: Gap.md),
              Container(
                padding: const EdgeInsets.all(Gap.md),
                decoration: BoxDecoration(color: context.colors.surfaceContainerHighest, borderRadius: BorderRadius.circular(AppTheme.radiusControl)),
                child: Row(
                  children: [
                    Expanded(child: Text('Total biaya', style: TextStyle(color: context.colors.onSurfaceVariant))),
                    Text(formatCurrency(_total), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: _total > widget.balance ? context.tone(Tone.danger) : null)),
                  ],
                ),
              ),
              if (_total > widget.balance)
                Padding(padding: const EdgeInsets.only(top: 4), child: Text('Saldo tidak cukup. Isi saldo dulu.', style: TextStyle(fontSize: 12, color: context.tone(Tone.danger)))),
            ],
            if (_error != null) ...[
              const SizedBox(height: Gap.md),
              Text(_error!, style: TextStyle(color: context.tone(Tone.danger), fontWeight: FontWeight.w600)),
            ],
            const SizedBox(height: Gap.lg),
            FilledButton(
              onPressed: _busy || widget.profiles.isEmpty ? null : _submit,
              child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Buat Voucher'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Hasil pembuatan: ringkasan batch, daftar voucher lengkap, cetak, salin, bagikan.
class GeneratedVouchersScreen extends StatelessWidget {
  const GeneratedVouchersScreen({
    super.key,
    required this.vouchers,
    required this.profileName,
    required this.cost,
    required this.newBalance,
    this.profileInfo = const {},
    this.batchCode,
  });
  final List<Map<String, dynamic>> vouchers;
  final String profileName;
  final num cost;
  final num newBalance;
  final Map<String, dynamic> profileInfo;
  final String? batchCode;

  String get _text {
    final lines = <String>[];
    for (final v in vouchers) {
      final code = str(v, 'code') ?? '';
      final pass = str(v, 'password');
      lines.add(pass != null && pass != code ? '$code / $pass' : code);
    }
    return 'Voucher WiFi${profileName.isEmpty ? '' : ' $profileName'}\n${lines.join('\n')}';
  }

  Widget _row(BuildContext context, String k, String? v, {bool bold = false}) {
    if (v == null || v.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 110, child: Text(k, style: TextStyle(color: context.colors.onSurfaceVariant, fontSize: 13))),
          Expanded(child: Text(v, style: TextStyle(fontSize: 13.5, fontWeight: bold ? FontWeight.w800 : FontWeight.w600))),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final first = vouchers.isNotEmpty ? vouchers.first : const <String, dynamic>{};
    String? pick(String key) => str(first, key) ?? str(profileInfo, key);
    final price = numOf(first, 'sellingPrice') > 0 ? numOf(first, 'sellingPrice') : numOf(profileInfo, 'sellingPrice');
    return Scaffold(
      appBar: AppBar(title: const Text('Voucher Dibuat')),
      body: ListView(
        padding: EdgeInsets.fromLTRB(Gap.page, Gap.md, Gap.page, listBottomPadding(context)),
        children: [
          Container(
            padding: const EdgeInsets.all(Gap.md),
            decoration: BoxDecoration(color: c.surface, border: Border.all(color: c.outlineVariant), borderRadius: BorderRadius.circular(AppTheme.radiusCard)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${vouchers.length} voucher berhasil dibuat', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                const SizedBox(height: Gap.sm),
                _row(context, 'Paket', profileName),
                _row(context, 'Batch', batchCode),
                _row(context, 'Harga jual', price > 0 ? formatCurrency(price) : null),
                _row(context, 'Masa aktif', pick('validity')),
                _row(context, 'Kecepatan', pick('speed')),
                _row(context, 'Kuota', pick('usageQuota')),
                _row(context, 'Durasi pakai', pick('usageDuration')),
                _row(context, 'Router', str(first, 'routerName')),
                const Divider(height: Gap.lg),
                _row(context, 'Saldo dipotong', formatCurrency(cost), bold: true),
                _row(context, 'Saldo sekarang', formatCurrency(newBalance), bold: true),
              ],
            ),
          ),
          const SizedBox(height: Gap.md),
          FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)),
            onPressed: () => showVoucherPrintSheet(context, vouchers),
            icon: const Icon(Icons.print_rounded, size: 20),
            label: const Text('Cetak voucher'),
          ),
          const SizedBox(height: Gap.sm),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: _text));
                    showToast(context, 'Daftar kode disalin');
                  },
                  icon: const Icon(Icons.copy_rounded, size: 18),
                  label: const Text('Salin'),
                ),
              ),
              const SizedBox(width: Gap.sm),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => Share.share(_text, subject: 'Voucher WiFi'),
                  icon: const Icon(Icons.share_rounded, size: 18),
                  label: const Text('Bagikan'),
                ),
              ),
            ],
          ),
          const SizedBox(height: Gap.sm),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(44)),
            onPressed: () => sendVoucherWhatsApp(context, _text),
            icon: const Icon(Icons.chat_rounded, size: 18),
            label: const Text('Kirim ke WhatsApp pembeli'),
          ),
          const SizedBox(height: Gap.lg),
          for (final v in vouchers) ...[
            Container(
              padding: const EdgeInsets.all(Gap.md),
              decoration: BoxDecoration(color: c.surface, border: Border.all(color: c.outlineVariant), borderRadius: BorderRadius.circular(AppTheme.radiusCard)),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SelectableText(str(v, 'code') ?? '-', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, letterSpacing: 1)),
                        if (str(v, 'password') != null && str(v, 'password') != str(v, 'code')) Text('Password: ${str(v, 'password')}', style: TextStyle(fontSize: 13, color: c.onSurfaceVariant)),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Cetak',
                    onPressed: () => showVoucherPrintSheet(context, [v]),
                    icon: const Icon(Icons.print_outlined, size: 20),
                  ),
                ],
              ),
            ),
            const SizedBox(height: Gap.xs),
          ],
        ],
      ),
    );
  }
}


/// Minta nomor pembeli lalu buka WhatsApp dengan pesan voucher terisi.
Future<void> sendVoucherWhatsApp(BuildContext context, String message) async {
  final ctl = TextEditingController();
  final phone = await showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Kirim ke WhatsApp'),
      content: TextField(controller: ctl, keyboardType: TextInputType.phone, autofocus: true, decoration: const InputDecoration(labelText: 'Nomor WhatsApp pembeli', hintText: '08xxxxxxxxxx')),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
        FilledButton(onPressed: () => Navigator.pop(ctx, ctl.text.trim()), child: const Text('Kirim')),
      ],
    ),
  );
  if (phone == null || phone.isEmpty) return;
  var n = phone.replaceAll(RegExp(r'[^0-9]'), '');
  if (n.startsWith('0')) n = '62${n.substring(1)}';
  final ok = await launchUrl(Uri.parse('https://wa.me/$n?text=${Uri.encodeComponent(message)}'), mode: LaunchMode.externalApplication);
  if (!ok && context.mounted) showToast(context, 'WhatsApp tidak bisa dibuka.');
}
