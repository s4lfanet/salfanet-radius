import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

/// Notifikasi agen: voucher dibuat, deposit berhasil, saldo menipis, voucher terjual.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<Map<String, dynamic>> _items = [];
  int _unread = 0;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _items.isEmpty;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/agent/notifications');
      if (!mounted) return;
      final list = (res is Map ? res['notifications'] : null) as List?;
      setState(() {
        _items = list?.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() ?? [];
        _unread = res is Map ? (numOf(Map<String, dynamic>.from(res), 'unreadCount')).toInt() : 0;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _markAll() async {
    final ok = await runAction(context, () => ApiClient.instance.put('/api/agent/notifications', data: {'markAll': true}));
    if (ok) _load();
  }

  Future<void> _markOne(Map<String, dynamic> n) async {
    if (n['isRead'] == true) return;
    try {
      await ApiClient.instance.put('/api/agent/notifications', data: {'notificationIds': [str(n, 'id')]});
      _load();
    } on ApiException {
      // Reading is best-effort; the list stays as it is.
    }
  }

  IconData _icon(String type) {
    switch (type) {
      case 'deposit_success':
        return Icons.account_balance_wallet_outlined;
      case 'low_balance':
        return Icons.warning_amber_rounded;
      case 'voucher_sold':
        return Icons.shopping_bag_outlined;
      default:
        return Icons.confirmation_number_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifikasi'),
        actions: [if (_unread > 0) TextButton(onPressed: _markAll, child: const Text('Tandai dibaca'))],
      ),
      body: DataStateView(
        loading: _loading,
        error: _error,
        isEmpty: _items.isEmpty,
        emptyIcon: Icons.notifications_none_rounded,
        emptyMessage: 'Belum ada notifikasi',
        onRetry: _load,
        child: RefreshableList(
          itemCount: _items.length,
          onRefresh: _load,
          itemBuilder: (context, i) {
            final n = _items[i];
            final unread = n['isRead'] != true;
            return EntityTile(
              icon: _icon(str(n, 'type') ?? ''),
              tone: unread ? Tone.primary : Tone.neutral,
              title: str(n, 'title') ?? '-',
              subtitle: str(n, 'message'),
              meta: formatDateTimeOrNull(dateOf(n, 'createdAt')?.toLocal()),
              onTap: () => _markOne(n),
            );
          },
        ),
      ),
    );
  }
}
