import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

/// The collector's working list — mirrors the web portal's customers page:
/// search by name/username, filter by payment state, then per-customer
/// actions (mark paid, payment promise with GPS, resend invoice link).
class CustomersScreen extends StatefulWidget {
  const CustomersScreen({super.key});

  @override
  State<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends State<CustomersScreen> {
  static const _filters = <(String, String)>[
    ('all', 'Semua'),
    ('unpaid', 'Belum lunas'),
    ('paid', 'Lunas'),
  ];

  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _users = [];
  String _filter = 'all';
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
      final res = await ApiClient.instance.get('/api/collector/users', query: {'filter': _filter == 'unpaid' ? 'unpaid' : 'all'});
      final list = res is Map ? res['users'] : null;
      var users = [for (final u in list is List ? list : const []) Map<String, dynamic>.from(u as Map)];
      if (_filter == 'paid') users = users.where((u) => u['pay_status'] == 'paid').toList();
      setState(() => _users = users);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _visible {
    if (_query.isEmpty) return _users;
    final q = _query.toLowerCase();
    return _users.where((u) {
      return '${u['name']}'.toLowerCase().contains(q) ||
          '${u['username']}'.toLowerCase().contains(q) ||
          '${u['customerId']}'.toLowerCase().contains(q) ||
          '${u['phone']}'.contains(q);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final users = _visible;
    return Scaffold(
      appBar: AppBar(title: const Text('Pelanggan')),
      body: Column(
        children: [
          SearchField(hint: 'Cari nama / username / ID…', onChanged: (v) => setState(() => _query = v)),
          const SizedBox(height: Gap.sm),
          FilterChipRow(options: _filters, selected: _filter, onSelected: (v) { _filter = v; _load(); }),
          const SizedBox(height: Gap.sm),
          Expanded(
            child: DataStateView(
              loading: _loading,
              error: _error,
              isEmpty: users.isEmpty,
              emptyIcon: Icons.people_alt_outlined,
              emptyMessage: _query.isEmpty ? 'Tidak ada pelanggan' : 'Tidak ditemukan "$_query"',
              emptyHint: _query.isEmpty ? 'Belum ada pelanggan di area/router Anda.' : null,
              onRetry: _load,
              child: RefreshableList(
                itemCount: users.length,
                onRefresh: _load,
                itemBuilder: (_, i) => _CustomerTile(user: users[i], onChanged: _load),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CustomerTile extends StatelessWidget {
  const _CustomerTile({required this.user, required this.onChanged});

  final Map<String, dynamic> user;
  final VoidCallback onChanged;

  (String, Tone) _payStatus() {
    final s = (user['pay_status'] ?? (num.tryParse('${user['unpaid_count']}') ?? 0) > 0 ? 'unpaid' : 'none').toString();
    if (s == 'unpaid') {
      return user['has_overdue'] == true ? ('Terlambat', Tone.danger) : ('Belum lunas', Tone.warning);
    }
    if (s == 'paid') return ('Lunas', Tone.success);
    return ('Tanpa tagihan', Tone.neutral);
  }

  @override
  Widget build(BuildContext context) {
    final unpaid = num.tryParse('${user['unpaid_amount']}') ?? 0;
    final (label, tone) = _payStatus();
    final profile = user['profile'] is Map ? user['profile']['name']?.toString() : null;
    final area = user['area'] is Map ? user['area']['name']?.toString() : null;
    return EntityTile(
      icon: Icons.person_rounded,
      tone: tone,
      title: (user['name'] ?? user['username'] ?? '-').toString(),
      subtitle: [user['username'], profile, area].whereType<String>().where((s) => s.isNotEmpty).join(' · '),
      meta: user['customerId']?.toString(),
      trailing: AmountTrailing(amount: unpaid > 0 ? formatCurrency(unpaid) : '', pill: StatusPill(label: label, tone: tone)),
      onTap: () => openCustomerSheet(context, user, onChanged),
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
        InfoRow(label: 'Telepon', value: str(user, 'phone')),
        InfoRow(label: 'Alamat', value: str(user, 'address')),
        InfoRow(label: 'Paket', value: profile['name'] != null ? '${profile['name']} · ${formatCurrency(num.tryParse('${profile['price']}') ?? 0)}' : null),
        InfoRow(label: 'Area', value: user['area'] is Map ? str(user['area'], 'name') : null),
        InfoRow(label: 'Router', value: user['router'] is Map ? str(user['router'], 'name') : null),
        InfoRow(label: 'Jatuh tempo', value: str(user, 'expiredAt')?.split('T').first),
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
