import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/formatters.dart';
import '../../core/theme/feature_colors.dart';
import '../../core/widgets/state_views.dart';
import '../../models/notification_event.dart';
import 'notifications_provider.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await context.read<NotificationsProvider>().load();
      if (mounted) context.read<NotificationsProvider>().markAllRead();
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<NotificationsProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text('Notifikasi')),
      body: RefreshIndicator(
        onRefresh: () => provider.load(),
        child: _buildBody(provider),
      ),
    );
  }

  Widget _buildBody(NotificationsProvider provider) {
    if (provider.loading && provider.events.isEmpty) {
      return const ScrollableCenter(child: AppLoadingState(label: 'Memuat notifikasi...'));
    }
    if (provider.error != null && provider.events.isEmpty) {
      return ScrollableCenter(
        child: AppErrorState(message: provider.error!, onRetry: provider.load),
      );
    }
    if (provider.events.isEmpty) {
      return const ScrollableCenter(
        child: AppEmptyState(
          icon: Icons.notifications_none_rounded,
          accent: FeatureColors.invoice,
          title: 'Belum ada notifikasi',
          message: 'Kabar soal pembayaran yang masuk, balasan teknisi di tiket Anda, '
              'dan pengingat jatuh tempo akan tampil di sini.',
        ),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: provider.events.length,
      separatorBuilder: (_, __) => const Divider(height: 1, indent: 72),
      itemBuilder: (context, index) => _EventTile(event: provider.events[index]),
    );
  }
}

class _EventTile extends StatelessWidget {
  const _EventTile({required this.event});
  final NotificationEvent event;

  /// Each event type keeps the hue its feature owns elsewhere in the app, so a
  /// ticket reply looks like a ticket wherever it shows up.
  (IconData, FeatureAccent) get _visual {
    switch (event.type) {
      case 'payment_success':
        return (Icons.check_circle_rounded, FeatureColors.topup);
      case 'payment_rejected':
        return (Icons.cancel_rounded, FeatureColors.referral);
      case 'ticket_reply':
        return (Icons.chat_bubble_rounded, FeatureColors.ticket);
      case 'ticket_resolved':
        return (Icons.task_alt_rounded, FeatureColors.renewal);
      case 'package_changed':
        return (Icons.trending_up_rounded, FeatureColors.upgrade);
      default:
        return (Icons.notifications_rounded, FeatureColors.invoice);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (icon, accent) = _visual;

    return Container(
      // Unread carries a tinted background as well as heavier text, so it is
      // not weight alone doing the work.
      color: event.isRead ? null : scheme.primaryContainer.withValues(alpha: 0.18),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FeatureIconTile(icon: icon, accent: accent, size: 40, radius: 13),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        event.title,
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                              fontWeight: event.isRead ? FontWeight.w600 : FontWeight.w800,
                            ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      formatDate(event.timestamp),
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  event.message,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
