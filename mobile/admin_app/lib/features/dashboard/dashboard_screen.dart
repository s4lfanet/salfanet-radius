import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/crud/crud_list_screen.dart';
import '../../core/forms/form_screen.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import '../../models/dashboard_stats.dart';
import '../activity_log/activity_log_screen.dart';
import '../auth/auth_provider.dart';
import '../invoices/invoice_list_screen.dart';
import '../invoices/invoice_provider.dart';
import '../keuangan/keuangan_screen.dart';
import '../manual_payments/manual_payment_list_screen.dart';
import '../more/more_menu_screen.dart' show WhatsappSendScreen;
import '../network_map/network_map_screen.dart';
import '../notifications/notifications_provider.dart';
import '../notifications/notifications_screen.dart';
import '../pppoe/pppoe_detail_screen.dart';
import '../pppoe/pppoe_list_screen.dart';
import '../pppoe/pppoe_provider.dart';
import '../pppoe/pppoe_user_form.dart';
import '../qris_cashier/qris_cashier_screen.dart';
import '../registrations/registration_list_screen.dart';
import '../reports/report_screens.dart';
import '../resources/hotspot_resources.dart';
import '../resources/radius_resources.dart';
import '../sessions/session_list_screen.dart';
import '../tickets/ticket_list_screen.dart';
import 'dashboard_provider.dart';
import '../../core/guides/guides.dart';

/// The dashboard's job is "what needs me today": the "Perlu Tindakan"
/// block and the invoices about to fall due are the page; revenue is the
/// one headline figure; network, sales and ledger panels are supporting
/// context. Every figure opens the list behind it, like the web cards do.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<DashboardProvider>().load();
      context.read<NotificationsProvider>().load();
    });
  }

  Future<void> _refresh() async {
    await Future.wait([context.read<DashboardProvider>().load(), context.read<NotificationsProvider>().load()]);
  }

  void _open(Widget screen) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));

  /// Opens a screen with the web page it mirrors, for its Panduan button.
  void _openGuided(String path, Widget screen) => _open(GuideScope(path: path, child: screen));

  Future<void> _newCustomer() async {
    if (await openCreateCustomer(context) && mounted) _refresh();
  }

  /// The voucher form straight away; after generating, the voucher list,
  /// where the new batch can be shared or printed.
  Future<void> _newVouchers() async {
    final c = vouchersConfig();
    final saved = await openForm(context, title: c.createLabel ?? 'Buat Voucher', fields: c.fields!(null), onSubmit: c.create!, success: 'Voucher dibuat.');
    if (saved && mounted) _openGuided('/admin/hotspot/voucher', CrudListScreen(config: vouchersConfig()));
  }

  // Lists opened from here get their own provider so a filter set from the
  // dashboard doesn't leak into the Pelanggan / Tagihan tabs.
  void _openCustomers({String? status}) => _open(
    ChangeNotifierProvider(
      create: (_) => PppoeProvider(),
      child: PppoeListScreen(initialStatus: status),
    ),
  );
  void _openInvoices({String status = 'UNPAID', String search = ''}) => _open(
    ChangeNotifierProvider(
      create: (_) => InvoiceProvider()
        ..status = status
        ..search = search,
      child: const InvoiceListScreen(),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final dash = context.watch<DashboardProvider>();
    final unread = context.watch<NotificationsProvider>().unreadCount;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          const GuideAction(),
          IconButton(
            tooltip: 'Notifikasi',
            onPressed: () => _open(const NotificationsScreen()),
            icon: Badge(isLabelVisible: unread > 0, label: Text(unread > 99 ? '99+' : '$unread'), child: const Icon(Icons.notifications_outlined)),
          ),
          const SizedBox(width: Gap.xs),
        ],
      ),
      body: DataStateView(
        loading: dash.loading && dash.stats == null,
        error: dash.stats == null ? dash.error : null,
        onRetry: _refresh,
        isEmpty: false,
        emptyIcon: Icons.dashboard_outlined,
        emptyMessage: '',
        child: dash.stats == null ? const SizedBox.shrink() : RefreshIndicator(onRefresh: _refresh, child: _content(context, dash)),
      ),
    );
  }

  Widget _content(BuildContext context, DashboardProvider dash) {
    final s = dash.stats!;
    final user = context.watch<AuthProvider>().user;
    bool can(String key) => user?.can(key) ?? true;
    final upcoming = s.upcomingInvoices;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(Gap.page, Gap.xs, Gap.page, listBottomPadding(context)),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'Halo, ${user?.name.split(' ').first ?? ''}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, height: 1.2),
              ),
            ),
            _MonthPicker(selected: s.monthKey, label: s.periodLabel, onSelected: (m) => context.read<DashboardProvider>().setMonth(m)),
          ],
        ),
        const SizedBox(height: Gap.lg),

        // Only the shortcuts this account may use (same keys as the menus).
        _QuickActions(
          actions: [
            if (can('customers.create')) _Quick(Icons.person_add_alt_1_rounded, Tone.primary, 'Pelanggan Baru', _newCustomer),
            if (can('vouchers.generate')) _Quick(Icons.confirmation_number_rounded, Tone.violet, 'Buat Voucher', _newVouchers),
            if (can('settings.payment')) _Quick(Icons.qr_code_2_rounded, Tone.success, 'Kasir QRIS', () => _open(const QrisCashierScreen())),
            if (can('invoices.edit')) _Quick(Icons.fact_check_rounded, Tone.warning, 'Cek Transfer', () => _openGuided('/admin/manual-payments', const ManualPaymentListScreen())),
            if (can('sessions.view')) _Quick(Icons.wifi_tethering_rounded, Tone.accent, 'Sesi Online', () => _openGuided('/admin/sessions/pppoe', const SessionListScreen())),
            if (can('customers.view')) _Quick(Icons.support_agent_rounded, Tone.danger, 'Tiket', () => _openGuided('/admin/tickets', const TicketListScreen())),
            if (can('whatsapp.send')) _Quick(Icons.chat_rounded, Tone.success, 'Kirim WhatsApp', () => _openGuided('/admin/settings/whatsapp', const WhatsappSendScreen())),
            if (can('network.view')) _Quick(Icons.map_rounded, Tone.primary, 'Peta Jaringan', () => _openGuided('/admin/network/map', const NetworkMapScreen())),
          ],
        ),
        const SizedBox(height: Gap.xl),

        const SectionHeader('Perlu Tindakan'),
        _RowsCard(
          dividerIndent: 68,
          children: [
            if (can('registrations.view'))
            _ActionRow(
              icon: Icons.person_add_alt_1_rounded,
              tone: Tone.accent,
              label: 'Registrasi baru',
              hint: 'Menunggu disetujui',
              count: s.newRegistrations,
              onTap: () => _open(const RegistrationListScreen()),
            ),
            if (can('invoices.view'))
            _ActionRow(
              icon: Icons.receipt_long_rounded,
              tone: Tone.warning,
              label: 'Tagihan belum dibayar',
              hint: upcoming.isEmpty
                  ? 'Tidak ada yang jatuh tempo minggu ini'
                  : '${upcoming.length >= 20 ? '20+' : upcoming.length} jatuh tempo dalam 7 hari atau sudah lewat',
              count: s.unpaidInvoicesCount,
              onTap: _openInvoices,
            ),
            if (can('customers.view'))
            _ActionRow(
              icon: Icons.block_rounded,
              tone: Tone.danger,
              label: 'Pelanggan terisolir',
              hint: s.suspendedCount > 0 ? '${s.suspendedCount} lainnya sedang suspend' : 'Koneksi dibatasi karena tagihan',
              count: s.isolatedCount,
              onTap: () => _open(CrudListScreen(config: isolatedUsersConfig())),
            ),
            if (dash.pendingManualPayments != null && can('invoices.edit'))
              _ActionRow(
                icon: Icons.fact_check_rounded,
                tone: Tone.success,
                label: 'Transfer menunggu dicek',
                hint: 'Bukti transfer dari pelanggan',
                count: dash.pendingManualPayments!,
                onTap: () => _openGuided('/admin/manual-payments', const ManualPaymentListScreen()),
              ),
          ],
        ),

        const SizedBox(height: Gap.xl),
        _RevenueHero(stats: s, onTap: () => _open(const KeuanganScreen())),

        if (upcoming.isNotEmpty) ...[
          const SizedBox(height: Gap.xl),
          SectionHeader('Jatuh Tempo 7 Hari', action: 'Semua tagihan', onAction: _openInvoices),
          _RowsCard(
            children: [
              for (final inv in upcoming.take(5))
                _DueRow(invoice: inv, onTap: () => _openInvoices(search: str(inv, 'invoiceNumber') ?? '')),
            ],
          ),
        ],

        if (dash.payments.isNotEmpty) ...[
          const SizedBox(height: Gap.xl),
          SectionHeader('Pembayaran Terbaru', action: 'Tagihan lunas', onAction: () => _openInvoices(status: 'PAID')),
          _RowsCard(
            children: [
              for (final p in dash.payments)
                _PaymentRow(payment: p, onTap: () => _openInvoices(status: 'PAID', search: str(p, 'invoiceNumber') ?? '')),
            ],
          ),
        ],

        const SizedBox(height: Gap.xl),
        const SectionHeader('Jaringan'),
        Row(
          children: [
            Expanded(
              child: _MetricCard(
                icon: Icons.people_alt_rounded,
                tone: Tone.primary,
                value: '${s.totalPppoeUsers}',
                label: 'Pelanggan',
                detail: '${s.activePppoeUsers} aktif',
                onTap: () => _openCustomers(),
              ),
            ),
            const SizedBox(width: Gap.md),
            Expanded(
              child: _MetricCard(
                icon: Icons.wifi_tethering_rounded,
                tone: Tone.success,
                value: '${s.activeSessionsPPPoE + s.activeSessionsHotspot}',
                label: 'Sesi online',
                detail: 'PPPoE ${s.activeSessionsPPPoE} · Hotspot ${s.activeSessionsHotspot}',
                onTap: () => _open(const SessionListScreen()),
              ),
            ),
          ],
        ),
        const SizedBox(height: Gap.md),
        Row(
          children: [
            Expanded(
              child: _MetricCard(
                icon: Icons.confirmation_number_rounded,
                tone: Tone.violet,
                value: '${s.unusedVouchers}',
                label: 'Stok voucher',
                detail: 'Belum dipakai',
                onTap: () => _open(CrudListScreen(config: vouchersConfig())),
              ),
            ),
            const SizedBox(width: Gap.md),
            Expanded(
              child: _MetricCard(
                icon: Icons.verified_user_rounded,
                tone: s.radiusRejectToday > s.radiusAcceptToday ? Tone.danger : Tone.accent,
                value: '${s.radiusAcceptToday}',
                label: 'Login RADIUS',
                detail: 'Hari ini · ${s.radiusRejectToday} ditolak',
                onTap: () => _open(CrudListScreen(config: authLogConfig())),
              ),
            ),
          ],
        ),
        const SizedBox(height: Gap.md),
        Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: Gap.md),
            child: Row(
              children: [
                Expanded(child: _ServiceStatus(label: 'RADIUS', online: s.radiusOnline)),
                Container(width: 1, height: 34, color: context.colors.outlineVariant),
                Expanded(child: _ServiceStatus(label: 'Database', online: s.databaseOnline)),
                Container(width: 1, height: 34, color: context.colors.outlineVariant),
                Expanded(child: _ServiceStatus(label: 'API', online: s.apiOnline)),
              ],
            ),
          ),
        ),

        if (s.agentSales.isNotEmpty) ...[
          const SizedBox(height: Gap.xl),
          SectionHeader('Penjualan Agent', action: 'Laporan agent', onAction: () => _open(const AgentReportScreen())),
          _RowsCard(
            children: [
              _TotalRow(label: '${s.agentSalesCount} voucher terjual ${s.periodLabel}', value: formatCurrency(s.agentSalesRevenue)),
              for (final a in s.agentSales)
                _PlainRow(title: str(a, 'agentName') ?? '-', subtitle: '${numOf(a, 'sold')} voucher', value: formatCurrency(numOf(a, 'revenue'))),
            ],
          ),
        ],

        if (dash.newCustomers.isNotEmpty) ...[
          const SizedBox(height: Gap.xl),
          SectionHeader('Pelanggan Baru · ${dash.newCustomers.length}'),
          _RowsCard(
            children: [
              for (final c in dash.newCustomers.take(5))
                _PlainRow(
                  title: str(c, 'name') ?? str(c, 'username') ?? '-',
                  subtitle: [str(mapOf(c, 'profile'), 'name'), str(mapOf(c, 'area'), 'name')].whereType<String>().join(' · '),
                  value: formatDateOrNull(dateOf(c, 'createdAt')) ?? '',
                  onTap: () => _open(PppoeDetailScreen(userId: '${c['id']}')),
                ),
            ],
          ),
        ],

        if (dash.incomeExpense.any((m) => numOf(m, 'income') != 0 || numOf(m, 'expense') != 0)) ...[
          const SizedBox(height: Gap.xl),
          SectionHeader('Kas 6 Bulan', action: 'Keuangan', onAction: () => _open(const KeuanganScreen())),
          _RowsCard(children: [for (final m in dash.incomeExpense.reversed) _LedgerRow(month: m)]),
        ],

        if (s.activities.isNotEmpty) ...[
          const SizedBox(height: Gap.xl),
          SectionHeader('Aktivitas Terbaru', action: 'Lihat semua', onAction: () => _open(const ActivityLogScreen())),
          _RowsCard(
            dividerIndent: Gap.lg,
            children: [
              for (var i = 0; i < s.activities.length && i < 5; i++) _ActivityRow(activity: (s.activities[i] as Map).cast<String, dynamic>()),
            ],
          ),
        ],
      ],
    );
  }
}

/// Month the revenue, agent and new-customer panels cover. The web
/// dashboard has the same picker; the app lists the last 12 months.
class _MonthPicker extends StatelessWidget {
  const _MonthPicker({required this.selected, required this.label, required this.onSelected});
  final String selected;
  final String label;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final key = DateFormat('yyyy-MM');
    final name = DateFormat('MMMM yyyy', 'id_ID');
    final months = [for (var i = 0; i < 12; i++) DateTime(now.year, now.month - i)];
    return PopupMenuButton<String>(
      tooltip: 'Pilih bulan',
      onSelected: (v) => onSelected(v == key.format(now) ? null : v),
      itemBuilder: (_) => [
        for (final m in months) CheckedPopupMenuItem(value: key.format(m), checked: key.format(m) == selected, child: Text(name.format(m))),
      ],
      child: Container(
        constraints: const BoxConstraints(minHeight: 44),
        padding: const EdgeInsets.only(left: Gap.md, right: Gap.sm),
        decoration: BoxDecoration(
          border: Border.all(color: context.colors.outline),
          borderRadius: BorderRadius.circular(AppTheme.radiusControl),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
            const SizedBox(width: 2),
            Icon(Icons.expand_more_rounded, size: 20, color: context.colors.onSurfaceVariant),
          ],
        ),
      ),
    );
  }
}

class _Quick {
  const _Quick(this.icon, this.tone, this.label, this.onTap);
  final IconData icon;
  final Tone tone;
  final String label;
  final VoidCallback onTap;
}

/// Aksi Cepat: the tasks staff open many times a day that are not already
/// a bottom tab, one tap each. Same tinted icon tile as the Lainnya menu.
class _QuickActions extends StatelessWidget {
  const _QuickActions({required this.actions});
  final List<_Quick> actions;

  static const _columns = 4;

  @override
  Widget build(BuildContext context) {
    final rows = <List<_Quick>>[
      for (var i = 0; i < actions.length; i += _columns) actions.sublist(i, (i + _columns).clamp(0, actions.length)),
    ];
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Gap.xs, vertical: Gap.sm),
        child: Column(
          children: [
            for (final row in rows)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (var i = 0; i < _columns; i++)
                    Expanded(child: i < row.length ? _QuickButton(action: row[i]) : const SizedBox.shrink()),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _QuickButton extends StatelessWidget {
  const _QuickButton({required this.action});
  final _Quick action;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: action.label,
      excludeSemantics: true,
      child: InkWell(
        onTap: action.onTap,
        borderRadius: BorderRadius.circular(AppTheme.radiusControl),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 2, vertical: Gap.sm),
          child: Column(
            children: [
              RoleIconTile(icon: action.icon, color: context.tone(action.tone), size: 44),
              const SizedBox(height: 6),
              Text(
                action.label,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, height: 1.25),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A card of rows split by hairlines, the shape every dashboard list uses.
class _RowsCard extends StatelessWidget {
  const _RowsCard({required this.children, this.dividerIndent = Gap.lg});
  final List<Widget> children;
  final double dividerIndent;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          for (var i = 0; i < children.length; i++) ...[if (i > 0) Divider(indent: dividerIndent), children[i]],
        ],
      ),
    );
  }
}

/// The single focal figure (DESIGN.md: one accent at the key moment). Solid
/// brand fill, not a gradient — gradients are reserved for the login mark.
class _RevenueHero extends StatelessWidget {
  const _RevenueHero({required this.stats, required this.onTap});
  final DashboardStats stats;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    const onBrand = Colors.white;
    final soft = Colors.white.withValues(alpha: 0.92);
    final today = stats.isCurrentMonth;
    return Material(
      color: AppTheme.brand,
      borderRadius: BorderRadius.circular(AppTheme.radiusCard),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Gap.xl, Gap.xl, Gap.xl, Gap.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Pendapatan invoice ${stats.periodLabel}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: soft, fontSize: 12.5, fontWeight: FontWeight.w600),
                    ),
                  ),
                  Icon(Icons.chevron_right_rounded, color: soft, size: 20),
                ],
              ),
              const SizedBox(height: Gap.xs),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  stats.invoiceRevenueFormatted,
                  style: const TextStyle(color: onBrand, fontSize: 28, fontWeight: FontWeight.w800, height: 1.15),
                ),
              ),
              const SizedBox(height: Gap.lg),
              Container(height: 1, color: Colors.white.withValues(alpha: 0.28)),
              const SizedBox(height: Gap.md),
              Row(
                children: [
                  if (today) Expanded(child: _HeroStat(label: 'Invoice hari ini', value: stats.invoiceRevenueTodayFormatted)),
                  if (today) const SizedBox(width: Gap.sm),
                  if (today) Expanded(child: _HeroStat(label: 'Voucher hari ini', value: stats.voucherRevenueTodayFormatted)),
                  if (today) const SizedBox(width: Gap.sm),
                  Expanded(child: _HeroStat(label: 'Voucher sebulan', value: stats.voucherRevenueFormatted)),
                  if (!today) Expanded(child: _HeroStat(label: 'Invoice terbit', value: '${stats.invoiceCountMonth}')),
                ],
              ),
              const SizedBox(height: Gap.md),
              Text(
                '${stats.invoiceCountMonth} invoice terbit · total sepanjang waktu ${stats.totalAllTimeRevenueFormatted}',
                maxLines: 2,
                style: TextStyle(color: soft, fontSize: 11.5, height: 1.35),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeroStat extends StatelessWidget {
  const _HeroStat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, maxLines: 2, style: TextStyle(color: Colors.white.withValues(alpha: 0.92), fontSize: 11, height: 1.25)),
        const SizedBox(height: 2),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(value, style: const TextStyle(color: Colors.white, fontSize: 13.5, fontWeight: FontWeight.w700)),
        ),
      ],
    );
  }
}

class _ActionRow extends StatelessWidget {
  const _ActionRow({required this.icon, required this.tone, required this.label, required this.hint, required this.count, required this.onTap});
  final IconData icon;
  final Tone tone;
  final String label;
  final String hint;
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.tone(tone);
    final idle = count == 0;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.md, Gap.md, Gap.md),
        child: Row(
          children: [
            RoleIconTile(icon: icon, color: idle ? context.tone(Tone.neutral) : c, size: 40),
            const SizedBox(width: Gap.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(hint, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: context.colors.onSurfaceVariant)),
                ],
              ),
            ),
            const SizedBox(width: Gap.sm),
            Text('$count', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: idle ? context.colors.onSurfaceVariant : c)),
            const SizedBox(width: Gap.xs),
            Icon(Icons.chevron_right_rounded, color: context.colors.onSurfaceVariant, size: 20),
          ],
        ),
      ),
    );
  }
}

/// One invoice about to fall due. The day count is the deciding field, so
/// it sits on the right in the row's tone.
class _DueRow extends StatelessWidget {
  const _DueRow({required this.invoice, required this.onTap});
  final Map<String, dynamic> invoice;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final days = numOf(invoice, 'daysUntilDue').toInt();
    final (label, tone) = days < 0
        ? ('Lewat ${-days} hari', Tone.danger)
        : days == 0
        ? ('Hari ini', Tone.warning)
        : ('$days hari lagi', Tone.neutral);
    return _PlainRow(
      title: str(invoice, 'customerName') ?? '-',
      subtitle: '${str(invoice, 'invoiceNumber') ?? '-'} · ${formatCurrency(numOf(invoice, 'amount'))}',
      value: label,
      valueTone: tone,
      onTap: onTap,
    );
  }
}

class _PaymentRow extends StatelessWidget {
  const _PaymentRow({required this.payment, required this.onTap});
  final Map<String, dynamic> payment;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final paid = dateOf(payment, 'paidAt');
    return _PlainRow(
      title: str(payment, 'customerName') ?? '-',
      subtitle: [str(payment, 'actorLabel'), if (paid != null) formatRelativeTime(paid)].whereType<String>().join(' · '),
      value: formatCurrency(numOf(payment, 'amount')),
      valueTone: Tone.success,
      onTap: onTap,
    );
  }
}

class _LedgerRow extends StatelessWidget {
  const _LedgerRow({required this.month});
  final Map<String, dynamic> month;

  @override
  Widget build(BuildContext context) {
    final income = numOf(month, 'income');
    final expense = numOf(month, 'expense');
    final net = income - expense;
    return _PlainRow(
      title: str(month, 'month') ?? '-',
      subtitleLines: 2,
      subtitle: ['Masuk ${formatCurrency(income)}', 'Keluar ${formatCurrency(expense)}'].join('\n'),
      value: '${net < 0 ? '−' : '+'}${formatCurrency(net.abs())}',
      valueTone: net < 0 ? Tone.danger : Tone.success,
    );
  }
}

class _TotalRow extends StatelessWidget {
  const _TotalRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: context.colors.surfaceContainerHighest,
      padding: const EdgeInsets.symmetric(horizontal: Gap.lg, vertical: Gap.md),
      child: Row(
        children: [
          Expanded(child: Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
          const SizedBox(width: Gap.sm),
          Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

/// Title + one-line detail on the left, the figure that matters on the
/// right. Shared by every dashboard list so they scan the same way.
class _PlainRow extends StatelessWidget {
  const _PlainRow({required this.title, required this.subtitle, required this.value, this.valueTone, this.onTap, this.subtitleLines = 2});
  final String title;
  final String subtitle;
  final String value;
  final Tone? valueTone;
  final VoidCallback? onTap;
  final int subtitleLines;

  @override
  Widget build(BuildContext context) {
    final muted = context.colors.onSurfaceVariant;
    final row = Padding(
      padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.md, Gap.md, Gap.md),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
                if (subtitle.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(subtitle, maxLines: subtitleLines, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: muted, height: 1.35)),
                ],
              ],
            ),
          ),
          const SizedBox(width: Gap.sm),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 130),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerRight,
              child: Text(
                value,
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: valueTone == null || valueTone == Tone.neutral ? null : context.tone(valueTone!)),
              ),
            ),
          ),
          if (onTap != null) Icon(Icons.chevron_right_rounded, color: muted, size: 20) else const SizedBox(width: Gap.xs),
        ],
      ),
    );
    return onTap == null ? row : InkWell(onTap: onTap, child: row);
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.icon, required this.tone, required this.value, required this.label, required this.detail, required this.onTap});
  final IconData icon;
  final Tone tone;
  final String value;
  final String label;
  final String detail;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(Gap.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RoleIconTile(icon: icon, color: context.tone(tone), size: 36),
              const SizedBox(height: Gap.md),
              Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, height: 1.1)),
              const SizedBox(height: 2),
              Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              const SizedBox(height: 2),
              Text(detail, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: context.colors.onSurfaceVariant)),
            ],
          ),
        ),
      ),
    );
  }
}

class _ServiceStatus extends StatelessWidget {
  const _ServiceStatus({required this.label, required this.online});
  final String label;
  final bool online;

  @override
  Widget build(BuildContext context) {
    final c = context.tone(online ? Tone.success : Tone.danger);
    return Column(
      children: [
        Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: context.colors.onSurfaceVariant)),
        const SizedBox(height: 4),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(online ? Icons.check_circle_rounded : Icons.error_rounded, size: 15, color: c),
            const SizedBox(width: 4),
            Text(online ? 'Online' : 'Offline', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c)),
          ],
        ),
      ],
    );
  }
}

class _ActivityRow extends StatelessWidget {
  const _ActivityRow({required this.activity});
  final Map<String, dynamic> activity;

  @override
  Widget build(BuildContext context) {
    final time = dateOf(activity, 'time');
    final failed = activity['status'] == 'error' || activity['status'] == 'failed';
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Gap.lg, vertical: Gap.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Marks a real state: red when the logged action failed.
          Padding(
            padding: const EdgeInsets.only(top: 5),
            child: Icon(Icons.circle, size: 7, color: context.tone(failed ? Tone.danger : Tone.primary)),
          ),
          const SizedBox(width: Gap.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  str(activity, 'action') ?? '-',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, height: 1.35),
                ),
                const SizedBox(height: 2),
                Text(
                  [str(activity, 'user'), if (time != null) formatRelativeTime(time)].whereType<String>().join(' · '),
                  style: TextStyle(fontSize: 11.5, color: context.colors.onSurfaceVariant),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
