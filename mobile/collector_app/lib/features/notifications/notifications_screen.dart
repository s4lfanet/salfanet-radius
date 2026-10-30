import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

/// Notifikasi kolektor — pembayaran masuk, konfirmasi setoran, dan info
/// yang dikirim ke akun ini (endpoint yang sama dengan lonceng di web).
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = [];

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
      final res = await ApiClient.instance.get('/api/collector/notifications');
      final list = res is Map ? (res['notifications'] ?? res['items'] ?? res['data']) : null;
      setState(() => _items = [for (final n in list is List ? list : const []) Map<String, dynamic>.from(n as Map)]);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  (IconData, Tone) _style(String type) {
    switch (type.toLowerCase()) {
      case 'payment':
      case 'payment_received':
      case 'settlement_confirmed':
        return (Icons.payments_outlined, Tone.success);
      case 'proof':
      case 'manual_payment_submitted':
        return (Icons.receipt_outlined, Tone.primary);
      case 'warning':
      case 'reminder':
        return (Icons.notifications_outlined, Tone.warning);
      default:
        return (Icons.notifications_outlined, Tone.neutral);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notifikasi')),
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
          itemBuilder: (_, i) {
            final n = _items[i];
            final (icon, tone) = _style('${n['type'] ?? ''}');
            return EntityTile(
              icon: icon,
              tone: tone,
              title: (n['title'] ?? 'Notifikasi').toString(),
              subtitle: (n['body'] ?? n['message'] ?? '').toString(),
              meta: (n['createdAt'] ?? n['created_at'])?.toString().split('T').first,
            );
          },
        ),
      ),
    );
  }
}
