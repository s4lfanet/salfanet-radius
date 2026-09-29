import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import '../../models/ticket.dart';
import '../activity_log/activity_log_screen.dart';
import '../agents/agent_deposit_list_screen.dart';
import '../../core/crud/crud_list_screen.dart';
import '../resources/hotspot_resources.dart';
import '../approvals/approval_list_screen.dart';
import '../invoices/invoice_list_screen.dart';
import '../invoices/invoice_provider.dart';
import '../manual_payments/manual_payment_list_screen.dart';
import '../pppoe/pppoe_detail_screen.dart';
import '../pppoe/pppoe_list_screen.dart';
import '../pppoe/pppoe_provider.dart';
import '../registrations/registration_list_screen.dart';
import '../sessions/session_list_screen.dart';
import '../tickets/ticket_detail_screen.dart';
import '../tickets/ticket_list_screen.dart';
import '../tickets/ticket_provider.dart';
import 'notifications_provider.dart';

const _typeIcons = <String, IconData>{
  'invoice_overdue': Icons.receipt_long_rounded,
  'invoice_generated': Icons.description_rounded,
  'new_registration': Icons.person_add_alt_1_rounded,
  'payment_received': Icons.payments_rounded,
  'manual_payment_submitted': Icons.receipt_rounded,
  'manual_payment_approved': Icons.task_alt_rounded,
  'manual_payment_rejected': Icons.cancel_outlined,
  'agent_deposit_approved': Icons.account_balance_wallet_rounded,
  'agent_deposit_rejected': Icons.account_balance_wallet_outlined,
  'ticket_reply': Icons.forum_rounded,
  'user_expired': Icons.event_busy_rounded,
  'system_alert': Icons.warning_amber_rounded,
};

Tone _typeTone(String type) {
  if (type.contains('rejected') || type == 'user_expired' || type == 'system_alert') return Tone.danger;
  if (type.contains('overdue')) return Tone.warning;
  if (type.contains('payment') || type.contains('approved')) return Tone.success;
  if (type.contains('registration')) return Tone.accent;
  return Tone.primary;
}

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<NotificationsProvider>().load());
  }

  /// Resolves the web-panel path stored in `notification.link` to the
  /// matching mobile screen. Returns null for links with no mobile screen
  /// (settings pages etc.) — those rows just get marked read.
  Future<Widget?> _screenFor(String link) async {
    final uri = Uri.parse(link);
    final p = uri.path;
    final q = uri.queryParameters;
    if (p.startsWith('/admin/tickets/')) {
      final id = p.split('/').last;
      try {
        final res = await ApiClient.instance.get('/api/tickets', query: {'id': id});
        if (res is List && res.isNotEmpty) {
          final ticket = Ticket.fromJson((res.first as Map).cast<String, dynamic>());
          return ChangeNotifierProvider(
            create: (_) => TicketProvider(),
            child: TicketDetailScreen(ticket: ticket),
          );
        }
      } on ApiException catch (_) {}
      return const TicketListScreen();
    }
    if (p == '/admin/tickets') return const TicketListScreen();
    if (p == '/admin/manual-payments') return const ManualPaymentListScreen();
    if (p == '/admin/session' || p.startsWith('/admin/sessions')) return const SessionListScreen();
    if (p == '/admin/hotspot/agent/deposits') return const AgentDepositListScreen();
    if (p == '/admin/hotspot/agent') return CrudListScreen(config: agentsConfig());
    if (p == '/admin/pppoe/registrations') return const RegistrationListScreen();
    if (p == '/admin/pppoe/approvals') return const ApprovalListScreen();
    if (p == '/admin/logs/activity') return const ActivityLogScreen();
    if (p == '/admin/pppoe/users' && q['id'] != null) return PppoeDetailScreen(userId: q['id']!);
    if (p == '/admin/pppoe/users') {
      return ChangeNotifierProvider(create: (_) => PppoeProvider()..search = q['search'] ?? '', child: const PppoeListScreen());
    }
    if (p == '/admin/isolated-users') {
      return ChangeNotifierProvider(
        create: (_) => PppoeProvider(),
        child: const PppoeListScreen(initialStatus: 'isolated'),
      );
    }
    if (p.startsWith('/admin/invoices')) {
      return ChangeNotifierProvider(create: (_) => InvoiceProvider(), child: const InvoiceListScreen());
    }
    return null;
  }

  Future<void> _open(Map<String, dynamic> n) async {
    final provider = context.read<NotificationsProvider>();
    provider.markRead(n['id'].toString());
    final link = str(n, 'link');
    if (link == null) return;
    final screen = await _screenFor(link);
    if (screen != null && mounted) {
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<NotificationsProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifikasi'),
        actions: [
          if (p.unreadCount > 0) TextButton(onPressed: p.markAllRead, child: const Text('Tandai dibaca')),
          if (p.notifications.any((n) => n['isRead'] == true))
            IconButton(
              tooltip: 'Hapus yang sudah dibaca',
              icon: const Icon(Icons.delete_sweep_rounded),
              onPressed: () async {
                final ok = await confirmAction(
                  context,
                  title: 'Hapus Notifikasi?',
                  message: 'Semua notifikasi yang sudah dibaca dihapus.',
                  confirmLabel: 'Hapus',
                  destructive: true,
                );
                if (ok && context.mounted) await runAction(context, p.deleteRead, success: 'Notifikasi dihapus.');
              },
            ),
          const SizedBox(width: Gap.xs),
        ],
      ),
      body: DataStateView(
        loading: p.loading,
        error: p.notifications.isEmpty ? p.error : null,
        onRetry: p.load,
        isEmpty: p.notifications.isEmpty,
        emptyIcon: Icons.notifications_none_rounded,
        emptyMessage: 'Belum ada notifikasi',
        emptyHint: 'Pembayaran masuk, registrasi baru, dan balasan tiket akan muncul di sini.',
        child: RefreshableList(
          onRefresh: p.load,
          itemCount: p.notifications.length,
          itemBuilder: (context, i) {
            final n = p.notifications[i];
            final type = str(n, 'type') ?? '';
            final unread = n['isRead'] != true;
            final created = dateOf(n, 'createdAt');
            return Dismissible(
              key: ValueKey(n['id']),
              direction: DismissDirection.endToStart,
              background: Container(
                alignment: Alignment.centerRight,
                padding: const EdgeInsets.only(right: Gap.xl),
                child: Icon(Icons.delete_outline_rounded, color: context.tone(Tone.danger)),
              ),
              confirmDismiss: (_) async {
                return runAction(context, () => p.delete(n['id'].toString()));
              },
              child: _NotificationTile(
                icon: _typeIcons[type] ?? Icons.notifications_rounded,
                tone: _typeTone(type),
                title: str(n, 'title') ?? '-',
                message: str(n, 'message') ?? '',
                time: created != null ? formatRelativeTime(created) : null,
                unread: unread,
                linked: str(n, 'link') != null,
                onTap: () => _open(n),
              ),
            );
          },
        ),
      ),
    );
  }
}

/// Notification rows need the full message (not one truncated line), so
/// they use their own layout instead of [EntityTile], with the same card,
/// padding and icon tile.
class _NotificationTile extends StatelessWidget {
  const _NotificationTile({
    required this.icon,
    required this.tone,
    required this.title,
    required this.message,
    required this.time,
    required this.unread,
    required this.linked,
    required this.onTap,
  });

  final IconData icon;
  final Tone tone;
  final String title;
  final String message;
  final String? time;
  final bool unread;
  final bool linked;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final muted = context.colors.onSurfaceVariant;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 14, 12, 14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RoleIconTile(icon: icon, color: context.tone(tone)),
              const SizedBox(width: Gap.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(title, style: TextStyle(fontSize: 14, fontWeight: unread ? FontWeight.w800 : FontWeight.w600)),
                        ),
                        if (unread) Icon(Icons.circle, size: 8, color: context.colors.primary),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(message, style: TextStyle(fontSize: 13, height: 1.4, color: unread ? context.colors.onSurface : muted)),
                    if (time != null) ...[
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Text(time!, style: TextStyle(fontSize: 11.5, color: muted)),
                          if (linked) ...[
                            const Spacer(),
                            Text(
                              'Buka',
                              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: context.colors.primary),
                            ),
                            Icon(Icons.chevron_right_rounded, size: 16, color: context.colors.primary),
                          ],
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
