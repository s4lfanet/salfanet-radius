import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import '../ont/ont_screen.dart';
import '../proofs/proofs_screen.dart';
import '../settlements/settlements_screen.dart';
import 'notifications_provider.dart';

/// Notifikasi kolektor: pembayaran, konfirmasi setoran, tugas cabut ONT, dan
/// info lain yang dikirim ke akun ini. Sama dengan lonceng di portal web;
/// ketuk satu untuk menandainya dibaca dan membuka halamannya.
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

  (IconData, Tone) _style(String type) {
    switch (type.toLowerCase()) {
      case 'settlement_confirmed':
      case 'settlement_unconfirmed':
      case 'payment_assigned':
      case 'payment':
        return (Icons.payments_outlined, Tone.success);
      case 'proof_approved':
      case 'proof_rejected':
      case 'proof':
        return (Icons.receipt_outlined, Tone.primary);
      case 'ont-task-new':
      case 'ont-task-cancelled':
        return (Icons.router_outlined, Tone.warning);
      case 'ticket_assigned':
        return (Icons.support_agent_rounded, Tone.primary);
      default:
        return (Icons.notifications_outlined, Tone.neutral);
    }
  }

  /// Opens the page a notification points at, when the app has one.
  Widget? _target(String? link) {
    if (link == null) return null;
    if (link.startsWith('/collector/ont')) return const OntScreen();
    if (link.startsWith('/collector/settlements')) return const SettlementsScreen();
    if (link.startsWith('/collector/proofs')) return const ProofsScreen();
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<NotificationsProvider>();
    final items = provider.events;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifikasi'),
        actions: [
          if (provider.unreadCount > 0)
            TextButton(onPressed: provider.markAllRead, child: const Text('Tandai semua dibaca')),
        ],
      ),
      body: DataStateView(
        loading: provider.loading && items.isEmpty,
        error: items.isEmpty ? provider.error : null,
        isEmpty: items.isEmpty,
        emptyIcon: Icons.notifications_none_rounded,
        emptyMessage: 'Belum ada notifikasi',
        emptyHint: 'Pembayaran, setoran, dan tugas dari admin muncul di sini.',
        onRetry: provider.load,
        child: RefreshableList(
          itemCount: items.length,
          onRefresh: provider.load,
          itemBuilder: (context, i) {
            final n = items[i];
            final unread = n['read'] != true;
            final (icon, tone) = _style('${n['type'] ?? ''}');
            final when = DateTime.tryParse('${n['timestamp'] ?? ''}');
            final target = _target(n['link']?.toString());
            return EntityTile(
              icon: icon,
              tone: tone,
              title: (n['title'] ?? 'Notifikasi').toString(),
              subtitle: (n['message'] ?? '').toString(),
              meta: when == null ? null : formatRelativeTime(when.toLocal()),
              trailing: unread ? Container(width: 10, height: 10, decoration: BoxDecoration(color: context.colors.primary, shape: BoxShape.circle)) : null,
              onTap: () {
                provider.markRead('${n['id']}');
                if (target != null) Navigator.of(context).push(MaterialPageRoute(builder: (_) => target));
              },
            );
          },
        ),
      ),
    );
  }
}
