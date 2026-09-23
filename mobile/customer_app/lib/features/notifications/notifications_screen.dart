import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/formatters.dart';
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
        child: provider.loading && provider.events.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : provider.events.isEmpty
                ? ListView(children: const [
                    SizedBox(height: 120),
                    Center(child: Icon(Icons.notifications_none, size: 56, color: Colors.grey)),
                    SizedBox(height: 12),
                    Center(child: Text('Belum ada notifikasi')),
                  ])
                : ListView.separated(
                    itemCount: provider.events.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (context, index) => _EventTile(event: provider.events[index]),
                  ),
      ),
    );
  }
}

class _EventTile extends StatelessWidget {
  const _EventTile({required this.event});
  final NotificationEvent event;

  IconData get _icon {
    switch (event.type) {
      case 'payment_success':
        return Icons.check_circle_outline;
      case 'payment_rejected':
        return Icons.cancel_outlined;
      case 'ticket_reply':
        return Icons.chat_bubble_outline;
      case 'ticket_resolved':
        return Icons.task_alt;
      case 'package_changed':
        return Icons.swap_horiz;
      default:
        return Icons.notifications_none;
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: event.isRead ? scheme.surfaceContainerHighest : scheme.primaryContainer,
        child: Icon(_icon, size: 20, color: event.isRead ? scheme.onSurfaceVariant : scheme.onPrimaryContainer),
      ),
      title: Text(event.title, style: TextStyle(fontWeight: event.isRead ? FontWeight.normal : FontWeight.bold)),
      subtitle: Text(event.message),
      trailing: Text(formatDate(event.timestamp), style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant)),
      isThreeLine: true,
    );
  }
}
