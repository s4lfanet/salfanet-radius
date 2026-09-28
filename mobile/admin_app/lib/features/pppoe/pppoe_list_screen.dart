import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import '../../models/pppoe_user.dart';
import 'pppoe_detail_screen.dart';
import 'pppoe_provider.dart';

class PppoeListScreen extends StatefulWidget {
  const PppoeListScreen({super.key, this.initialStatus});

  /// Lets other screens (dashboard "Terisolir" card) open the list
  /// pre-filtered.
  final String? initialStatus;

  @override
  State<PppoeListScreen> createState() => _PppoeListScreenState();
}

class _PppoeListScreenState extends State<PppoeListScreen> {
  Timer? _debounce;
  Timer? _onlinePoll;
  final _scrollController = ScrollController();

  static const _filters = [
    ('', 'Semua'),
    ('active', 'Aktif'),
    ('isolated', 'Terisolir'),
    ('suspended', 'Suspend'),
    ('stop', 'Stop'),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final p = context.read<PppoeProvider>();
      if (widget.initialStatus != null) {
        p.setStatusFilter(widget.initialStatus);
      } else {
        p.load();
      }
    });
    // Same cadence idea as the web list's online-status polling, so a
    // customer who connects shows up without a manual refresh.
    _onlinePoll = Timer.periodic(const Duration(seconds: 30), (_) {
      // Only while this tab is on screen: the shell's IndexedStack keeps it
      // mounted (with tickers disabled) when another tab is showing.
      if (mounted && TickerMode.of(context)) context.read<PppoeProvider>().refreshOnline();
    });
    _scrollController.addListener(() {
      if (_scrollController.position.pixels > _scrollController.position.maxScrollExtent - 300) {
        context.read<PppoeProvider>().loadMore();
      }
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _onlinePoll?.cancel();
    _scrollController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () => context.read<PppoeProvider>().setSearch(value.trim()));
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PppoeProvider>();

    return Scaffold(
      appBar: AppBar(title: Text(p.total > 0 ? 'Pelanggan (${p.total})' : 'Pelanggan')),
      body: Column(
        children: [
          SearchField(hint: 'Cari nama, username, HP, ID pelanggan', onChanged: _onSearchChanged),
          FilterChipRow(
            options: _filters,
            selected: p.statusFilter ?? '',
            onSelected: (v) => p.setStatusFilter(v.isEmpty ? null : v),
          ),
          Expanded(
            child: DataStateView(
              loading: p.loading && p.users.isEmpty,
              error: p.users.isEmpty ? p.error : null,
              onRetry: p.load,
              isEmpty: p.users.isEmpty,
              emptyIcon: Icons.people_outline_rounded,
              emptyMessage: p.search.isNotEmpty ? 'Tidak ada yang cocok dengan "${p.search}"' : 'Belum ada pelanggan di filter ini',
              emptyHint: p.search.isNotEmpty ? 'Coba nama, nomor HP, atau ID pelanggan yang lain.' : 'Pilih filter lain di atas untuk melihat pelanggan lain.',
              child: RefreshableList(
                controller: _scrollController,
                onRefresh: p.load,
                loadingMore: p.loadingMore,
                itemCount: p.users.length,
                itemBuilder: (context, i) => _UserTile(user: p.users[i]),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _UserTile extends StatelessWidget {
  const _UserTile({required this.user});
  final PppoeUser user;

  @override
  Widget build(BuildContext context) {
    final muted = context.colors.onSurfaceVariant;
    return EntityTile(
      icon: Icons.person_rounded,
      tone: statusTone(user.status),
      title: user.name,
      subtitle: '${user.username} · ${user.profileName ?? '-'}',
      meta: [user.customerId, user.areaName].whereType<String>().join(' · '),
      onTap: () async {
        await Navigator.of(context).push(MaterialPageRoute(builder: (_) => PppoeDetailScreen(userId: user.id)));
        if (context.mounted) context.read<PppoeProvider>().load();
      },
      trailing: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: [
          StatusPill.status(user.status),
          const SizedBox(height: 6),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.circle, size: 7, color: user.isOnline ? context.tone(Tone.success) : muted.withValues(alpha: 0.5)),
              const SizedBox(width: 4),
              Text(user.isOnline ? 'Online' : 'Offline', style: TextStyle(fontSize: 11, color: user.isOnline ? context.tone(Tone.success) : muted)),
            ],
          ),
        ],
      ),
    );
  }
}
