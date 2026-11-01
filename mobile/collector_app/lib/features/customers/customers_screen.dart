import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/location/route_launcher.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

/// The collector's working list — mirrors the web portal's customers page:
/// search, status and area/router filters, the same columns per customer
/// (package, router, area, expiry, address, payment status), and the same
/// per-customer actions (Tagih, Telepon, WhatsApp, Rute).
class CustomersScreen extends StatefulWidget {
  const CustomersScreen({super.key});

  @override
  State<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends State<CustomersScreen> {
  static const _pageSize = 25;

  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _users = [];
  String _filter = 'all';
  String _query = '';
  int _shown = _pageSize;
  String _areaId = '';
  String _routerId = '';
  List<({String id, String name})> _areas = const [];
  List<({String id, String name})> _routers = const [];
  String _company = '';

  @override
  void initState() {
    super.initState();
    _loadScope();
    _load();
  }

  /// Areas and routers assigned to this collector (same source as the web
  /// ScopeFilter) and the company name used in the WhatsApp reminder.
  Future<void> _loadScope() async {
    try {
      final res = await ApiClient.instance.get('/api/collector/auth/session');
      final filters = res is Map ? res['filters'] : null;
      List<({String id, String name})> pick(dynamic v) => [
            for (final o in v is List ? v : const [])
              if (o is Map && o['id'] != null) (id: '${o['id']}', name: '${o['name'] ?? o['id']}'),
          ];
      if (mounted && filters is Map) {
        setState(() {
          _areas = pick(filters['areas']);
          _routers = pick(filters['routers']);
        });
      }
    } on ApiException {
      // The list still works without the scope selects.
    }
    try {
      final res = await ApiClient.instance.get('/api/public/company');
      final name = res is Map && res['company'] is Map ? (res['company'] as Map)['name']?.toString() : null;
      if (mounted && name != null) setState(() => _company = name);
    } on ApiException {
      // The reminder falls back to a message without the company name.
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/collector/users', query: {
        'filter': 'all',
        if (_areaId.isNotEmpty) 'areaId': _areaId,
        if (_routerId.isNotEmpty) 'routerId': _routerId,
      });
      final list = res is Map ? res['users'] : null;
      final users = [for (final u in list is List ? list : const []) Map<String, dynamic>.from(u as Map)]
        ..sort((a, b) => _nameOf(a).toLowerCase().compareTo(_nameOf(b).toLowerCase()));
      setState(() {
        _users = users;
        _shown = _pageSize;
      });
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  static String _nameOf(Map<String, dynamic> u) => (u['name'] ?? u['username'] ?? '').toString();
  static bool _isIsolir(Map<String, dynamic> u) => const ['isolated', 'suspended'].contains('${u['status']}');
  static num _n(dynamic v) => num.tryParse('$v') ?? 0;

  bool _matchesFilter(Map<String, dynamic> u, String f) => switch (f) {
        'active' => u['status'] == 'active',
        'isolir' => _isIsolir(u),
        'unpaid' => _n(u['unpaid_count']) > 0,
        'paid' => u['pay_status'] == 'paid',
        _ => true,
      };

  List<Map<String, dynamic>> get _visible {
    final q = _query.trim().toLowerCase();
    return _users.where((u) {
      if (!_matchesFilter(u, _filter)) return false;
      if (q.isEmpty) return true;
      return ['name', 'username', 'customerId', 'phone', 'address'].any((k) => '${u[k] ?? ''}'.toLowerCase().contains(q));
    }).toList();
  }

  List<(String, String)> get _filters {
    int count(String f) => _users.where((u) => _matchesFilter(u, f)).length;
    return [
      ('all', 'Semua ${count('all')}'),
      ('active', 'Aktif ${count('active')}'),
      ('isolir', 'Isolir ${count('isolir')}'),
      ('unpaid', 'Belum lunas ${count('unpaid')}'),
      ('paid', 'Lunas ${count('paid')}'),
    ];
  }

  Widget _scopeSelect(String hint, IconData icon, String value, List<({String id, String name})> options, ValueChanged<String> onChanged) {
    return DropdownButtonFormField<String>(
      key: ValueKey('$hint-$value'),
      initialValue: value,
      isExpanded: true,
      decoration: InputDecoration(prefixIcon: Icon(icon, size: 20), isDense: true),
      items: [
        DropdownMenuItem(value: '', child: Text(hint, overflow: TextOverflow.ellipsis)),
        for (final o in options) DropdownMenuItem(value: o.id, child: Text(o.name, overflow: TextOverflow.ellipsis)),
      ],
      onChanged: (v) => onChanged(v ?? ''),
    );
  }

  @override
  Widget build(BuildContext context) {
    final users = _visible;
    final shown = users.take(_shown).toList();
    final totalUnpaid = users.fold<num>(0, (s, u) => s + _n(u['unpaid_amount']));
    final scope = context.colors;
    return Scaffold(
      appBar: AppBar(title: const Text('Pelanggan')),
      body: Column(
        children: [
          SearchField(hint: 'Cari nama, ID, username, No. HP, alamat', onChanged: (v) => setState(() {
                _query = v;
                _shown = _pageSize;
              })),
          const SizedBox(height: Gap.xs),
          FilterChipRow(options: _filters, selected: _filter, onSelected: (v) => setState(() {
                _filter = v;
                _shown = _pageSize;
              })),
          if (_areas.isNotEmpty || _routers.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(Gap.page, 0, Gap.page, Gap.sm),
              child: Row(
                children: [
                  if (_areas.isNotEmpty)
                    Expanded(
                      child: _scopeSelect('Semua area', Icons.place_outlined, _areaId, _areas, (v) {
                        _areaId = v;
                        _load();
                      }),
                    ),
                  if (_areas.isNotEmpty && _routers.isNotEmpty) const SizedBox(width: Gap.sm),
                  if (_routers.isNotEmpty)
                    Expanded(
                      child: _scopeSelect('Semua router', Icons.router_outlined, _routerId, _routers, (v) {
                        _routerId = v;
                        _load();
                      }),
                    ),
                ],
              ),
            ),
          if (!_loading && _error == null && users.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(Gap.page + 2, 0, Gap.page, Gap.sm),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text.rich(
                  TextSpan(
                    text: '${users.length} pelanggan',
                    children: [
                      if (totalUnpaid > 0) ...[
                        const TextSpan(text: ' · tunggakan '),
                        TextSpan(text: formatCurrency(totalUnpaid), style: TextStyle(fontWeight: FontWeight.w700, color: context.tone(Tone.danger))),
                      ],
                    ],
                  ),
                  style: TextStyle(fontSize: 12.5, color: scope.onSurfaceVariant),
                ),
              ),
            ),
          Expanded(
            child: DataStateView(
              loading: _loading,
              error: _error,
              isEmpty: users.isEmpty,
              emptyIcon: Icons.people_alt_outlined,
              emptyMessage: _users.isEmpty ? 'Belum ada pelanggan di wilayah tugas Anda' : 'Tidak ada yang cocok',
              emptyHint: _users.isEmpty ? 'Minta admin memeriksa area dan router/NAS Anda di Kelola Kolektor.' : 'Ubah kata kunci atau pilih filter Semua.',
              onRetry: _load,
              child: RefreshableList(
                itemCount: shown.length + (shown.length < users.length ? 1 : 0),
                onRefresh: _load,
                itemBuilder: (_, i) {
                  if (i >= shown.length) {
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: Gap.sm),
                      child: OutlinedButton(
                        onPressed: () => setState(() => _shown += _pageSize),
                        child: Text('Tampilkan lebih banyak (${users.length - shown.length} lagi)'),
                      ),
                    );
                  }
                  return _CustomerCard(user: shown[i], company: _company, onChanged: _load);
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Same message the web portal pre-fills: a payment reminder when invoices
/// are open, otherwise a plain greeting.
String collectorWaText(Map<String, dynamic> c, String company) {
  final who = '${c['name'] ?? c['username'] ?? ''}';
  final from = company.isEmpty ? '' : ' dari $company';
  final count = num.tryParse('${c['unpaid_count']}') ?? 0;
  if (count > 0) {
    final id = '${c['customerId'] ?? c['username']}';
    final profile = c['profile'] is Map ? (c['profile'] as Map)['name'] : null;
    final pkg = profile != null ? ', paket $profile' : '';
    final bills = count > 1 ? ' ($count tagihan)' : '';
    final amount = formatCurrency(num.tryParse('${c['unpaid_amount']}') ?? 0);
    return [
      'Halo Bapak/Ibu $who,',
      '',
      'Kami$from ingin mengingatkan tagihan internet Anda (ID pelanggan $id$pkg) sebesar $amount$bills belum dibayar.',
      '',
      'Pembayaran bisa melalui kolektor kami atau transfer. Jika sudah membayar, mohon abaikan pesan ini.',
      '',
      'Terima kasih.',
    ].join('\n');
  }
  return company.isEmpty ? 'Halo Bapak/Ibu $who,\n\n' : 'Halo Bapak/Ibu $who, kami dari $company.\n\n';
}

/// wa.me wants the number with country code and no symbols.
String _waNumber(String phone) {
  final d = phone.replaceAll(RegExp(r'\D'), '');
  return d.startsWith('0') ? '62${d.substring(1)}' : d;
}

class _CustomerCard extends StatelessWidget {
  const _CustomerCard({required this.user, required this.company, required this.onChanged});

  final Map<String, dynamic> user;
  final String company;
  final VoidCallback onChanged;

  num _n(dynamic v) => num.tryParse('$v') ?? 0;

  (String, Tone) _payStatus() {
    final s = (user['pay_status'] ?? (_n(user['unpaid_count']) > 0 ? 'unpaid' : 'none')).toString();
    if (s == 'unpaid') {
      return user['has_overdue'] == true ? ('Terlambat', Tone.danger) : ('Belum lunas', Tone.warning);
    }
    if (s == 'paid') return ('Lunas', Tone.success);
    return ('Belum ada tagihan', Tone.neutral);
  }

  Widget _line(BuildContext context, IconData icon, String text, {int maxLines = 1}) {
    final muted = context.colors.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(padding: const EdgeInsets.only(top: 1), child: Icon(icon, size: 15, color: muted)),
          const SizedBox(width: 8),
          Expanded(child: Text(text, maxLines: maxLines, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: muted))),
        ],
      ),
    );
  }

  Widget _action(IconData icon, String label, VoidCallback onTap, {bool primary = false}) {
    const pad = EdgeInsets.symmetric(horizontal: 12);
    final style = ButtonStyle(
      padding: const WidgetStatePropertyAll(pad),
      minimumSize: const WidgetStatePropertyAll(Size(0, 40)),
      visualDensity: VisualDensity.compact,
    );
    final child = Row(mainAxisSize: MainAxisSize.min, children: [Icon(icon, size: 16), const SizedBox(width: 6), Text(label, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700))]);
    return primary ? FilledButton(onPressed: onTap, style: style, child: child) : OutlinedButton(onPressed: onTap, style: style, child: child);
  }

  @override
  Widget build(BuildContext context) {
    final muted = context.colors.onSurfaceVariant;
    final unpaidCount = _n(user['unpaid_count']);
    final unpaid = _n(user['unpaid_amount']);
    final (payLabel, payTone) = _payStatus();
    final profile = user['profile'] is Map ? user['profile'] as Map : null;
    final area = user['area'] is Map ? '${(user['area'] as Map)['name'] ?? ''}' : '';
    final router = user['router'] is Map ? '${(user['router'] as Map)['name'] ?? ''}' : '';
    final expired = DateTime.tryParse('${user['expiredAt'] ?? ''}');
    final lastPaid = DateTime.tryParse('${user['last_paid_at'] ?? ''}');
    final phone = '${user['phone'] ?? ''}'.trim();
    final lat = num.tryParse('${user['latitude']}');
    final lng = num.tryParse('${user['longitude']}');
    final name = _CustomersScreenState._nameOf(user);
    final ids = [user['customerId'], user['username']].where((s) => s != null && '$s'.isNotEmpty).join(' · ');
    final where = [router, area].where((s) => s.isNotEmpty).join(' · ');

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => openCustomerSheet(context, user, onChanged),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name.isEmpty ? '-' : name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                        if (ids.isNotEmpty) Text(ids, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: muted)),
                      ],
                    ),
                  ),
                  const SizedBox(width: Gap.sm),
                  StatusPill.status('${user['status'] ?? ''}'),
                ],
              ),
              const SizedBox(height: 4),
              if (profile != null) _line(context, Icons.wifi_rounded, '${profile['name']} · ${formatCurrency(_n(profile['price']))}/bln'),
              if (where.isNotEmpty) _line(context, Icons.router_outlined, where),
              if (expired != null) _line(context, Icons.event_outlined, 'Aktif s/d ${formatDate(expired.toLocal())}'),
              if ('${user['address'] ?? ''}'.isNotEmpty) _line(context, Icons.place_outlined, '${user['address']}', maxLines: 2),
              if (phone.isNotEmpty) _line(context, Icons.phone_outlined, phone),
              const Padding(padding: EdgeInsets.symmetric(vertical: Gap.md), child: Divider(height: 1)),
              Row(
                children: [
                  StatusPill(label: payLabel, tone: payTone),
                  const Spacer(),
                  if (unpaidCount > 0)
                    Text.rich(
                      TextSpan(
                        text: formatCurrency(unpaid),
                        style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: context.tone(Tone.danger)),
                        children: [TextSpan(text: ' · ${unpaidCount.toInt()} tagihan', style: TextStyle(fontWeight: FontWeight.w500, fontSize: 12, color: muted))],
                      ),
                    )
                  else if (lastPaid != null)
                    Text('Dibayar ${formatDate(lastPaid.toLocal())}', style: TextStyle(fontSize: 12, color: muted)),
                ],
              ),
              const SizedBox(height: Gap.md),
              Wrap(
                spacing: Gap.sm,
                runSpacing: Gap.sm,
                children: [
                  if (unpaidCount > 0) _action(Icons.receipt_long_rounded, 'Tagih', () => openCustomerSheet(context, user, onChanged), primary: true),
                  if (phone.isNotEmpty) ...[
                    _action(Icons.call_rounded, 'Telepon', () => launchUrl(Uri.parse('tel:$phone'))),
                    _action(Icons.chat_rounded, 'WhatsApp', () {
                      final text = Uri.encodeComponent(collectorWaText(user, company));
                      launchUrl(Uri.parse('https://wa.me/${_waNumber(phone)}?text=$text'), mode: LaunchMode.externalApplication);
                    }),
                  ],
                  if (lat != null && lng != null)
                    _action(Icons.directions_rounded, 'Rute', () => openRouteTo(context, lat, lng)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Shared with BillingScreen — the detail sheet is the same everywhere a
/// customer row is tapped.
Future<void> openCustomerSheet(BuildContext context, Map<String, dynamic> user, VoidCallback onChanged) {
  return showDetailSheet<void>(
    context,
    header: DetailHeader(
      icon: Icons.person_rounded,
      tone: (num.tryParse('${user['unpaid_count']}') ?? 0) > 0 ? Tone.warning : Tone.success,
      title: (user['name'] ?? user['username'] ?? '-').toString(),
      subtitle: [user['username'], user['customerId']].whereType<String>().where((s) => s.isNotEmpty).join(' · '),
      status: StatusPill.status('${user['status'] ?? ''}'),
      figure: (num.tryParse('${user['unpaid_amount']}') ?? 0) > 0 ? formatCurrency(num.tryParse('${user['unpaid_amount']}') ?? 0) : null,
      figureLabel: 'Tagihan terbuka',
    ),
    sections: _customerSections(context, user),
    actions: (sheetContext) => _customerActions(sheetContext, user, onChanged),
  );
}

List<Widget> _customerSections(BuildContext context, Map<String, dynamic> user) {
  final profile = user['profile'] is Map ? user['profile'] : const {};
  final invoices = [for (final i in user['invoices'] is List ? user['invoices'] : const []) Map<String, dynamic>.from(i as Map)];
  final unpaid = invoices.where((i) => ['PENDING', 'OVERDUE', 'pending', 'overdue'].contains('${i['status']}')).toList();

  return [
    DetailSection(
      title: 'Info',
      rows: [
        InfoRow('Telepon', str(user, 'phone')),
        InfoRow('Alamat', str(user, 'address')),
        InfoRow('Paket', profile['name'] != null ? '${profile['name']} · ${formatCurrency(num.tryParse('${profile['price']}') ?? 0)}' : null),
        InfoRow('Area', user['area'] is Map ? str(user['area'], 'name') : null),
        InfoRow('Router', user['router'] is Map ? str(user['router'], 'name') : null),
        InfoRow('Jatuh tempo', str(user, 'expiredAt')?.split('T').first),
      ],
    ),
    if (unpaid.isNotEmpty)
      DetailSection(
        title: 'Tagihan Terbuka (${unpaid.length})',
        rows: const [],
        trailing: Column(
          children: [
            for (final inv in unpaid)
              ListTile(
                dense: true,
                leading: Icon(Icons.receipt_long_outlined, size: 20, color: context.tone('${inv['status']}'.toUpperCase() == 'OVERDUE' ? Tone.danger : Tone.warning)),
                title: Text('${inv['number'] ?? inv['invoiceNumber'] ?? 'Tagihan'}', style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis),
                subtitle: Text('${inv['period'] ?? inv['dueDate'] ?? ''}'.toString(), style: const TextStyle(fontSize: 11.5)),
                trailing: Text(formatCurrency(num.tryParse('${inv['amount']}') ?? 0), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
              ),
          ],
        ),
      ),
  ];
}

List<ActionSpec> _customerActions(BuildContext sheetContext, Map<String, dynamic> user, VoidCallback onChanged) {
  final unpaidCount = num.tryParse('${user['unpaid_count']}') ?? 0;
  final invoices = [for (final i in user['invoices'] is List ? user['invoices'] : const []) Map<String, dynamic>.from(i as Map)];
  final open = invoices.where((i) => ['PENDING', 'OVERDUE', 'pending', 'overdue'].contains('${i['status']}')).toList();
  final firstOpen = open.isNotEmpty ? open.first : null;
  final hasCoords = user['latitude'] != null && user['longitude'] != null;

  return [
    if (unpaidCount > 0 && firstOpen != null) ...[
      ActionSpec(
        'Tandai Lunas',
        Icons.check_circle_rounded,
        () => _markPaid(sheetContext, user, firstOpen, onChanged),
        kind: ActionKind.success,
      ),
      ActionSpec(
        'Janji Bayar',
        Icons.event_rounded,
        () => _promise(sheetContext, user, firstOpen, onChanged),
        kind: ActionKind.warning,
      ),
      ActionSpec(
        'Kirim Link',
        Icons.send_rounded,
        () => _sendInvoice(sheetContext, firstOpen),
        kind: ActionKind.neutral,
      ),
    ],
    if (hasCoords)
      ActionSpec(
        'Peta',
        Icons.map_outlined,
        () => launchUrl(Uri.parse('https://www.google.com/maps?q=${user['latitude']},${user['longitude']}'), mode: LaunchMode.externalApplication),
        kind: ActionKind.neutral,
      ),
    if (const ['isolated', 'suspended'].contains('${user['status']}'))
      ActionSpec(
        'Ajukan Cabut ONT',
        Icons.router_outlined,
        () => requestOntRemoval(sheetContext, user, onChanged),
        kind: ActionKind.warning,
      ),
  ];
}

Future<void> _markPaid(BuildContext context, Map<String, dynamic> user, Map<String, dynamic> inv, VoidCallback onChanged) async {
  final method = await showModalBottomSheet<String>(
    context: context,
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final m in [('cash', 'Tunai (cash)'), ('transfer', 'Transfer bank')])
            ListTile(
              leading: Icon(m.$1 == 'cash' ? Icons.payments_outlined : Icons.account_balance_outlined),
              title: Text(m.$2),
              onTap: () => Navigator.pop(ctx, m.$1),
            ),
        ],
      ),
    ),
  );
  if (method == null || !context.mounted) return;
  final ok = await confirmAction(
    context,
    title: 'Tandai lunas?',
    message: '${inv['number'] ?? 'Tagihan'} ${formatCurrency(num.tryParse('${inv['amount']}') ?? 0)} — ${user['name'] ?? user['username']}\nMetode: $method',
    confirmLabel: 'Ya, lunas',
  );
  if (!ok || !context.mounted) return;
  final done = await runAction(context, () async {
    await ApiClient.instance.post('/api/collector/mark-paid', data: {'invoiceId': inv['id'], 'paymentMethod': method});
  }, success: 'Pembayaran dicatat.');
  if (done && context.mounted) {
    Navigator.of(context).maybePop();
    onChanged();
  }
}

Future<void> _promise(BuildContext context, Map<String, dynamic> user, Map<String, dynamic> inv, VoidCallback onChanged) async {
  final picked = await showDatePicker(
    context: context,
    initialDate: DateTime.now().add(const Duration(days: 1)),
    firstDate: DateTime.now(),
    lastDate: DateTime.now().add(const Duration(days: 60)),
    helpText: 'Tanggal janji bayar',
  );
  if (picked == null || !context.mounted) return;

  // The backend rejects promises without coordinates — GPS is the proof
  // the collector actually visited the address.
  Position? pos;
  try {
    pos = await Geolocator.getCurrentPosition();
  } catch (_) {
    try {
      await Geolocator.requestPermission();
      pos = await Geolocator.getCurrentPosition();
    } catch (_) {}
  }
  if (!context.mounted) return;
  if (pos == null) {
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Lokasi GPS wajib — aktifkan izin lokasi lalu coba lagi.')));
    return;
  }

  final done = await runAction(context, () async {
    await ApiClient.instance.post('/api/collector/promise', data: {
      'userId': user['id'],
      'invoiceId': inv['id'],
      'promiseDate': picked.toIso8601String(),
      'latitude': pos!.latitude,
      'longitude': pos.longitude,
    });
  }, success: 'Janji bayar dicatat.');
  if (done && context.mounted) {
    Navigator.of(context).maybePop();
    onChanged();
  }
}

Future<void> _sendInvoice(BuildContext context, Map<String, dynamic> inv) async {
  final ok = await confirmAction(
    context,
    title: 'Kirim link pembayaran?',
    message: 'Invoice ${inv['number'] ?? ''} akan dikirim ke pelanggan via WhatsApp.',
    confirmLabel: 'Kirim',
  );
  if (!ok || !context.mounted) return;
  await runAction(context, () async {
    await ApiClient.instance.post('/api/collector/send-invoice', data: {'invoiceId': inv['id']});
  }, success: 'Link pembayaran dikirim.');
}

/// Ajukan pencabutan ONT — backend only accepts isolated/suspended
/// customers, which is why this action appears only on their sheets.
Future<void> requestOntRemoval(BuildContext context, Map<String, dynamic> user, VoidCallback onChanged) async {
  final notes = await _askNotes(context, user);
  if (notes == null || !context.mounted) return;
  final done = await runAction(context, () async {
    await ApiClient.instance.post('/api/collector/ont-removals', data: {'username': user['username'], 'notes': notes});
  }, success: 'Pengajuan cabut ONT tercatat.');
  if (done && context.mounted) {
    Navigator.of(context).maybePop();
    onChanged();
  }
}

/// Notes are optional; null means cancelled. Empty string is allowed.
Future<String?> _askNotes(BuildContext context, Map<String, dynamic> user) {
  final controller = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Ajukan Cabut ONT'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${user['name'] ?? user['username']}', style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: Gap.sm),
          TextField(
            controller: controller,
            maxLines: 3,
            decoration: const InputDecoration(hintText: 'Catatan (opsional): kondisi ONT, alasan, dsb.'),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
        FilledButton(onPressed: () => Navigator.pop(ctx, controller.text), child: const Text('Ajukan')),
      ],
    ),
  );
}
