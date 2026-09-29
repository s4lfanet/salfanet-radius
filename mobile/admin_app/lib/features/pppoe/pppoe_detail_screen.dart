import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import '../../models/invoice.dart';
import '../../models/pppoe_user.dart';
import '../invoices/invoice_detail_screen.dart';
import 'online_status.dart';
import 'pppoe_user_form.dart';

/// Mirrors the web panel's customer detail (admin/pppoe/users/[id]): full
/// field set, active session, invoice history and session history, plus the
/// status / billing actions staff take from there.
class PppoeDetailScreen extends StatefulWidget {
  const PppoeDetailScreen({super.key, required this.userId});
  final String userId;

  @override
  State<PppoeDetailScreen> createState() => _PppoeDetailScreenState();
}

class _PppoeDetailScreenState extends State<PppoeDetailScreen> {
  PppoeUser? _user;
  Map<String, dynamic>? _raw;
  Map<String, dynamic>? _activeSession;
  List<Invoice> _invoices = [];
  List<Map<String, dynamic>> _sessions = [];
  bool _loading = true;
  bool _acting = false;
  bool _showPassword = false;
  String? _error;

  bool get _hasUnpaid => _invoices.any((i) => !i.isPaid && i.status.toUpperCase() != 'CANCELLED');

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _user == null;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/pppoe/users/${widget.userId}');
      if (res is Map<String, dynamic>) {
        _raw = (res['user'] as Map).cast<String, dynamic>();
        _user = PppoeUser.fromJson(_raw!);
        _activeSession = (res['activeSession'] as Map?)?.cast<String, dynamic>();
      }
      // History sections are secondary: a failure there shouldn't blank the
      // whole screen, so they load independently and fail quietly.
      await Future.wait([_loadInvoices(), _loadSessions(), _loadOnline()]);
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// The detail endpoint only reports radacct; confirm with the same
  /// radacct + live-MikroTik check the web list uses.
  Future<void> _loadOnline() async {
    final u = _user;
    if (u == null) return;
    if (_activeSession != null) {
      u.isOnline = true;
      return;
    }
    final online = await fetchOnlineUsernames([u.username]);
    if (online != null) u.isOnline = u.status != 'stop' && online.contains(u.username);
  }

  Future<void> _loadInvoices() async {
    try {
      final res = await ApiClient.instance.get('/api/invoices', query: {'userId': widget.userId, 'status': 'all', 'limit': 12});
      if (res is Map<String, dynamic>) {
        _invoices = ((res['invoices'] as List?) ?? []).map((e) => Invoice.fromJson((e as Map).cast<String, dynamic>())).toList();
      }
    } on ApiException catch (_) {}
  }

  Future<void> _loadSessions() async {
    try {
      final res = await ApiClient.instance.get('/api/pppoe/users/${widget.userId}/activity', query: {'type': 'sessions', 'limit': 10});
      if (res is Map<String, dynamic>) {
        _sessions = ((res['data'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
      }
    } on ApiException catch (_) {}
  }

  Future<void> _changeStatus(String status) async {
    final u = _user!;
    final copy = {
      'active': ('Aktifkan Pelanggan', 'Koneksi ${u.name} akan dipulihkan ke paket normal.', false),
      'isolated': ('Isolir Pelanggan', 'Koneksi ${u.name} akan dibatasi ke profil isolir sampai tagihan dibayar.', true),
      'blocked': ('Blokir Pelanggan', 'Akun ${u.name} diblokir dan sesi yang aktif diputus.', true),
      'stop': ('Stop Layanan', 'Layanan ${u.name} dihentikan sepenuhnya dan akun PPPoE dinonaktifkan.', true),
    }[status]!;
    final ok = await confirmAction(context, title: copy.$1, message: copy.$2, confirmLabel: 'Ya, lanjutkan', destructive: copy.$3);
    if (!ok || !mounted) return;
    setState(() => _acting = true);
    final done = await runAction(
      context,
      () => ApiClient.instance.put('/api/pppoe/users/status', data: {'userId': widget.userId, 'status': status}),
      success: 'Status diubah menjadi ${statusLabel(status)}.',
    );
    if (mounted) setState(() => _acting = false);
    if (done) _load();
  }

  Future<void> _markPaid() async {
    final unpaid = _invoices.where((i) => !i.isPaid && i.status.toUpperCase() != 'CANCELLED').toList();
    final total = unpaid.fold<int>(0, (s, i) => s + i.amount);
    final ok = await confirmAction(
      context,
      title: 'Tandai Lunas',
      message: '${unpaid.length} tagihan (${formatCurrency(total)}) akan ditandai lunas dan koneksi dipulihkan bila sedang terisolir.',
      confirmLabel: 'Tandai Lunas',
    );
    if (!ok || !mounted) return;
    setState(() => _acting = true);
    final done = await runAction(context, () => ApiClient.instance.post('/api/pppoe/users/${widget.userId}/mark-paid'), success: 'Tagihan ditandai lunas.');
    if (mounted) setState(() => _acting = false);
    if (done) _load();
  }

  Future<void> _sendInvoiceReminder() async {
    final ok = await confirmAction(
      context,
      title: 'Kirim Pengingat Tagihan',
      message: 'Kirim info tagihan terbaru ke WhatsApp ${_user!.phone}?',
      confirmLabel: 'Kirim',
    );
    if (!ok || !mounted) return;
    await runAction(
      context,
      () => ApiClient.instance.post(
        '/api/pppoe/users/send-notification',
        data: {
          'userIds': [widget.userId],
          'notificationType': 'invoice',
          'notificationMethod': 'whatsapp',
        },
      ),
      success: 'Pengingat dikirim.',
    );
  }

  PopupMenuItem<String> _item(String value, IconData icon, String label, {bool danger = false}) {
    final c = danger ? context.tone(Tone.danger) : null;
    return PopupMenuItem(
      value: value,
      child: ListTile(
        leading: Icon(icon, color: c),
        title: Text(label, style: TextStyle(color: c)),
      ),
    );
  }

  /// Reloads after an action that reported success.
  Future<void> _after(Future<bool> action) async {
    if (await action && mounted) _load();
  }

  Future<void> _onMenu(String v) async {
    final raw = _raw!;
    switch (v) {
      case 'remind':
        return _sendInvoiceReminder();
      case 'extend':
        return _after(extendCustomer(context, raw));
      case 'topup':
        return _after(topUpCustomer(context, raw));
      case 'promise':
        return _after(promiseToPay(context, raw));
      case 'cancelPromise':
        return _after(cancelPromise(context, raw));
      case 'addons':
        await CustomerAddonsSheet.open(context, widget.userId);
        return _load();
      case 'sync':
        return _after(runAction(context, () => ApiClient.instance.post('/api/pppoe/users/${widget.userId}/sync-radius'), success: 'Disinkron ke RADIUS.'));
      case 'notify':
        await sendCustomerNotice(context, raw);
        return;
      case 'delete':
        if (await deleteCustomer(context, raw) && mounted) Navigator.of(context).pop(true);
        return;
      default:
        return _changeStatus(v);
    }
  }

  Future<void> _launch(Uri uri) async {
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication) && mounted) {
      showToast(context, 'Tidak ada aplikasi untuk membuka tautan ini.');
    }
  }

  String _waNumber(String phone) {
    var n = phone.replaceAll(RegExp(r'[^0-9]'), '');
    if (n.startsWith('0')) n = '62${n.substring(1)}';
    return n;
  }

  @override
  Widget build(BuildContext context) {
    final u = _user;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Detail Pelanggan'),
        actions: [
          if (u != null)
            IconButton(tooltip: 'Edit', icon: const Icon(Icons.edit_rounded), onPressed: _acting ? null : () => _after(openEditCustomer(context, _raw!))),
          if (u != null)
            PopupMenuButton<String>(
              tooltip: 'Aksi lainnya',
              enabled: !_acting,
              onSelected: _onMenu,
              itemBuilder: (_) => [
                if (u.status != 'active') _item('active', Icons.play_circle_outline_rounded, 'Aktifkan'),
                if (u.status != 'isolated') _item('isolated', Icons.pause_circle_outline_rounded, 'Isolir'),
                if (u.status != 'blocked') _item('blocked', Icons.block_rounded, 'Blokir'),
                if (u.status != 'stop') _item('stop', Icons.stop_circle_outlined, 'Stop Layanan'),
                const PopupMenuDivider(),
                _item('extend', Icons.update_rounded, 'Perpanjang'),
                _item('topup', Icons.account_balance_wallet_rounded, 'Top Up Saldo'),
                _item('promise', Icons.event_available_rounded, 'Janji Bayar'),
                _item('cancelPromise', Icons.event_busy_rounded, 'Batalkan Janji Bayar'),
                _item('addons', Icons.extension_rounded, 'Add-on'),
                _item('sync', Icons.sync_rounded, 'Sinkron ke RADIUS'),
                const PopupMenuDivider(),
                _item('remind', Icons.send_outlined, 'Kirim Info Tagihan'),
                _item('notify', Icons.campaign_outlined, 'Kirim Notifikasi'),
                const PopupMenuDivider(),
                _item('delete', Icons.delete_outline_rounded, 'Hapus Pelanggan', danger: true),
              ],
            ),
        ],
      ),
      bottomNavigationBar: u == null
          ? null
          : ActionBar(
              actions: [
                if (_hasUnpaid) ...[
                  ActionSpec('Tandai Lunas', Icons.payments_rounded, _markPaid, kind: ActionKind.success, busy: _acting),
                  ActionSpec('WhatsApp', Icons.chat_rounded, () => _launch(Uri.parse('https://wa.me/${_waNumber(u.phone)}')), kind: ActionKind.neutral),
                ] else ...[
                  ActionSpec('WhatsApp', Icons.chat_rounded, () => _launch(Uri.parse('https://wa.me/${_waNumber(u.phone)}'))),
                  ActionSpec(
                    'Telepon',
                    Icons.call_rounded,
                    () => _launch(Uri(scheme: 'tel', path: u.phone)),
                    kind: ActionKind.neutral,
                  ),
                ],
              ],
            ),
      body: DataStateView(
        loading: _loading,
        error: u == null ? _error : null,
        onRetry: _load,
        isEmpty: false,
        emptyIcon: Icons.person_outline,
        emptyMessage: '',
        child: u == null ? const SizedBox.shrink() : _content(u),
      ),
    );
  }

  Widget _content(PppoeUser u) {
    final unpaidTotal = _invoices.where((i) => !i.isPaid && i.status.toUpperCase() != 'CANCELLED').fold<int>(0, (s, i) => s + i.amount);
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, listBottomPadding(context)),
        children: [
          DetailHeader(
            icon: Icons.person_rounded,
            tone: statusTone(u.status),
            title: u.name,
            subtitle: [u.customerId, u.username].whereType<String>().join(' · '),
            status: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                StatusPill.status(u.status),
                const SizedBox(height: 6),
                StatusPill(label: u.isOnline ? 'Online' : 'Offline', tone: u.isOnline ? Tone.success : Tone.neutral),
              ],
            ),
            figureLabel: unpaidTotal > 0 ? 'Tagihan belum dibayar' : null,
            figure: unpaidTotal > 0 ? formatCurrency(unpaidTotal) : null,
          ),
          DetailSection(
            title: 'Akun PPPoE',
            rows: [
              InfoRow('Username', u.username, copyable: true),
              InfoRow(
                'Password',
                u.password == null ? null : (_showPassword ? u.password : '••••••••'),
                copyable: _showPassword,
                trailing: u.password == null
                    ? null
                    : InkResponse(
                        radius: 18,
                        onTap: () => setState(() => _showPassword = !_showPassword),
                        child: Icon(
                          _showPassword ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                          size: 18,
                          color: context.colors.onSurfaceVariant,
                        ),
                      ),
              ),
              InfoRow('Paket', u.profilePrice != null ? '${u.profileName ?? '-'} · ${formatCurrency(u.profilePrice!)}' : u.profileName),
              InfoRow('Tipe', u.subscriptionType == 'PREPAID' ? 'Prabayar' : (u.subscriptionType == 'POSTPAID' ? 'Pascabayar' : u.subscriptionType)),
              InfoRow('Tanggal Tagihan', u.subscriptionType == 'POSTPAID' && u.billingDay != null ? 'Setiap tanggal ${u.billingDay}' : null),
              InfoRow('Jatuh Tempo', formatDateOrNull(u.expiredAt)),
              InfoRow('Saldo', u.balance != null && u.balance! > 0 ? formatCurrency(u.balance!) : null),
            ],
          ),
          DetailSection(
            title: 'Kontak',
            rows: [
              InfoRow(
                'Telepon',
                u.phone,
                copyable: true,
                onTap: () => _launch(Uri(scheme: 'tel', path: u.phone)),
              ),
              InfoRow('Email', u.email, copyable: true),
              InfoRow('Alamat', u.address),
              InfoRow(
                'Lokasi',
                u.hasLocation ? 'Buka di Google Maps' : null,
                onTap: u.hasLocation ? () => _launch(Uri.parse('https://www.google.com/maps/search/?api=1&query=${u.latitude},${u.longitude}')) : null,
              ),
            ],
          ),
          DetailSection(
            title: 'Jaringan',
            rows: [
              InfoRow('Area', u.areaName),
              InfoRow('Router', u.routerName),
              InfoRow('ODP', u.odp),
              InfoRow('IP Statis', u.ipAddress, copyable: true),
              InfoRow('MAC Address', u.macAddress, copyable: true),
              InfoRow('Terdaftar', formatDateOrNull(u.createdAt)),
              InfoRow('Tgl Pemasangan', formatDateOrNull(u.installDate)),
              InfoRow('Catatan', u.comment),
            ],
          ),
          if (_activeSession != null)
            DetailSection(
              title: 'Sesi Aktif',
              rows: [
                InfoRow('IP Aktif', str(_activeSession, 'framedipaddress'), copyable: true),
                InfoRow('MAC Client', str(_activeSession, 'callingstationid')),
                InfoRow('NAS', str(_activeSession, 'nasipaddress')),
                InfoRow('Mulai', formatDateTimeOrNull(dateOf(_activeSession, 'acctstarttime'))),
              ],
            ),
          const SizedBox(height: Gap.lg),
          SectionHeader('Riwayat Invoice'),
          if (_invoices.isEmpty)
            _emptyNote('Belum ada invoice untuk pelanggan ini.')
          else
            ..._invoices.map(
              (inv) => Padding(
                padding: const EdgeInsets.only(bottom: Gap.sm),
                child: EntityTile(
                  icon: Icons.receipt_long_rounded,
                  tone: statusTone(inv.status),
                  title: inv.invoiceNumber,
                  subtitle: inv.isPaid && inv.paidAt != null ? 'Dibayar ${formatDate(inv.paidAt!)}' : 'Jatuh tempo ${formatDate(inv.dueDate)}',
                  trailing: AmountTrailing(amount: formatCurrency(inv.amount), pill: StatusPill.status(inv.status)),
                  onTap: () async {
                    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => InvoiceDetailScreen(invoice: inv)));
                    _load();
                  },
                ),
              ),
            ),
          const SizedBox(height: Gap.lg),
          SectionHeader('Riwayat Sesi'),
          if (_sessions.isEmpty)
            _emptyNote('Belum ada riwayat sesi.')
          else
            Card(
              child: Column(
                children: [
                  for (var i = 0; i < _sessions.length; i++) ...[
                    if (i > 0) const Divider(indent: Gap.lg, endIndent: Gap.lg),
                    _SessionRow(session: _sessions[i]),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _emptyNote(String text) => Card(
    child: Padding(
      padding: const EdgeInsets.all(Gap.lg),
      child: Text(text, style: TextStyle(color: context.colors.onSurfaceVariant, fontSize: 13)),
    ),
  );
}

class _SessionRow extends StatelessWidget {
  const _SessionRow({required this.session});
  final Map<String, dynamic> session;

  @override
  Widget build(BuildContext context) {
    final online = session['isOnline'] == true;
    final start = dateOf(session, 'startTime');
    final stop = dateOf(session, 'stopTime');
    final muted = context.colors.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Gap.lg, vertical: Gap.md),
      child: Row(
        children: [
          Icon(online ? Icons.circle : Icons.circle_outlined, size: 10, color: online ? context.tone(Tone.success) : muted),
          const SizedBox(width: Gap.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(start != null ? formatDateTime(start) : '-', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(
                  online ? 'Masih terhubung' : '${str(session, 'durationFormatted') ?? '-'}${stop != null ? ' · selesai ${formatDateTime(stop)}' : ''}',
                  style: TextStyle(fontSize: 11.5, color: muted),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(str(session, 'total') ?? '-', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
              Text('↓${str(session, 'download') ?? '-'}', style: TextStyle(fontSize: 11, color: muted)),
            ],
          ),
        ],
      ),
    );
  }
}
