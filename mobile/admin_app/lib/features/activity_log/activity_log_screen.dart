import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

class ActivityLogScreen extends StatefulWidget {
  const ActivityLogScreen({super.key});

  @override
  State<ActivityLogScreen> createState() => _ActivityLogScreenState();
}

class _ActivityLogScreenState extends State<ActivityLogScreen> {
  static const _pageSize = 30;
  final List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = false;
  String? _error;
  String _search = '';
  Timer? _debounce;
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _load();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 300) _loadMore();
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _fetch({required int offset}) async {
    final res = await ApiClient.instance.get('/api/admin/activity-logs', query: {
      'limit': _pageSize,
      'offset': offset,
      if (_search.isNotEmpty) 'search': _search,
    });
    if (res is Map<String, dynamic>) {
      final page = ((res['activities'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>());
      _items.addAll(page);
      _hasMore = res['hasMore'] == true;
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = _items.isEmpty;
      _error = null;
    });
    try {
      _items.clear();
      await _fetch(offset: 0);
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || !_hasMore) return;
    setState(() => _loadingMore = true);
    try {
      await _fetch(offset: _items.length);
    } on ApiException catch (_) {
      _hasMore = false;
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  void _open(Map<String, dynamic> a) {
    final failed = a['status'] == 'failed' || a['status'] == 'error';
    showDetailSheet(
      context,
      header: DetailHeader(
        icon: Icons.history_rounded,
        tone: failed ? Tone.danger : Tone.primary,
        title: str(a, 'description') ?? str(a, 'action') ?? '-',
        subtitle: formatDateTimeOrNull(dateOf(a, 'createdAt')),
        status: StatusPill(label: failed ? 'Gagal' : 'Berhasil', tone: failed ? Tone.danger : Tone.success),
      ),
      sections: [
        DetailSection(rows: [
          InfoRow('Pengguna', str(a, 'username')),
          InfoRow('Peran', str(a, 'userRole')),
          InfoRow('Aksi', str(a, 'action')),
          InfoRow('Modul', str(a, 'module')),
          InfoRow('Alamat IP', str(a, 'ipAddress'), copyable: true),
        ]),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Log Aktivitas')),
      body: Column(
        children: [
          SearchField(
            hint: 'Cari pengguna, aksi, atau IP',
            onChanged: (v) {
              _debounce?.cancel();
              _debounce = Timer(const Duration(milliseconds: 400), () {
                _search = v.trim();
                _load();
              });
            },
          ),
          const SizedBox(height: Gap.xs),
          Expanded(
            child: DataStateView(
              loading: _loading,
              error: _error,
              onRetry: _load,
              isEmpty: _items.isEmpty,
              emptyIcon: Icons.history_rounded,
              emptyMessage: _search.isNotEmpty ? 'Tidak ada aktivitas yang cocok' : 'Belum ada aktivitas tercatat',
              child: RefreshableList(
                controller: _scroll,
                onRefresh: _load,
                loadingMore: _loadingMore,
                itemCount: _items.length,
                itemBuilder: (context, i) {
                  final a = _items[i];
                  final failed = a['status'] == 'failed' || a['status'] == 'error';
                  final t = dateOf(a, 'createdAt');
                  return EntityTile(
                    icon: Icons.history_rounded,
                    tone: failed ? Tone.danger : Tone.primary,
                    title: str(a, 'description') ?? str(a, 'action') ?? '-',
                    subtitle: [str(a, 'username'), str(a, 'module')].whereType<String>().join(' · '),
                    meta: t != null ? formatDateTime(t) : null,
                    onTap: () => _open(a),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
