import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import '../../models/pppoe_user.dart';
import '../../core/crud/crud_list_screen.dart';
import '../resources/pppoe_resources.dart';
import 'pppoe_bulk.dart';
import 'pppoe_detail_screen.dart';
import 'pppoe_provider.dart';
import 'pppoe_user_form.dart';

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

  /// Long-press a row to start selecting; bulk actions then act on these.
  final Set<String> _selected = {};

  void _toggle(String id) => setState(() => _selected.contains(id) ? _selected.remove(id) : _selected.add(id));

  Future<void> _bulk(Future<bool> Function(BuildContext, List<String>) action) async {
    final done = await action(context, _selected.toList());
    if (done && mounted) {
      setState(_selected.clear);
      context.read<PppoeProvider>().load();
    }
  }

  Future<void> _tool(String v) async {
    final p = context.read<PppoeProvider>();
    var reload = false;
    switch (v) {
      case 'profiles':
        await CrudListScreen.open(context, pppoeProfilesConfig());
      case 'areas':
        await CrudListScreen.open(context, pppoeAreasConfig());
      case 'addons':
        await CrudListScreen.open(context, addonTypesConfig());
      case 'import_mt':
        reload = await PppoeTools.importFromMikrotik(context);
      case 'import_file':
        reload = await PppoeTools.importFile(context);
      case 'template':
        await PppoeTools.downloadTemplate(context);
      case 'export':
        await PppoeTools.exportUsers(context);
      case 'audit':
        await PppoeTools.syncAudit(context);
        reload = true;
      case 'sync_radius':
        reload = await PppoeTools.syncAllToRadius(context);
      case 'migrate':
        reload = await PppoeTools.migrateRouterToRadius(context);
    }
    if (reload && mounted) p.load();
  }

  PopupMenuItem<String> _menuItem(String v, IconData icon, String label) => PopupMenuItem(
    value: v,
    child: ListTile(leading: Icon(icon), title: Text(label), contentPadding: EdgeInsets.zero),
  );

  PreferredSizeWidget _appBar(PppoeProvider p) {
    if (_selected.isNotEmpty) {
      return AppBar(
        leading: IconButton(icon: const Icon(Icons.close_rounded), onPressed: () => setState(_selected.clear)),
        title: Text('${_selected.length} dipilih'),
        actions: [
          IconButton(
            tooltip: 'Pilih semua yang tampil',
            icon: const Icon(Icons.select_all_rounded),
            onPressed: () => setState(() => _selected.addAll(p.users.map((u) => u.id))),
          ),
          PopupMenuButton<String>(
            onSelected: (v) => _bulk(switch (v) {
              'status' => bulkChangeStatus,
              'edit' => bulkEdit,
              'notify' => sendNotice,
              _ => bulkDelete,
            }),
            itemBuilder: (_) => [
              _menuItem('status', Icons.toggle_on_rounded, 'Ubah status'),
              _menuItem('edit', Icons.edit_note_rounded, 'Ubah router / tagihan'),
              _menuItem('notify', Icons.campaign_rounded, 'Kirim notifikasi'),
              _menuItem('delete', Icons.delete_outline_rounded, 'Hapus'),
            ],
          ),
        ],
      );
    }
    return AppBar(
      title: Text(p.total > 0 ? 'Pelanggan (${p.total})' : 'Pelanggan'),
      actions: [
        PopupMenuButton<String>(
          tooltip: 'Alat',
          onSelected: _tool,
          itemBuilder: (_) => [
            _menuItem('profiles', Icons.speed_rounded, 'Paket PPPoE'),
            _menuItem('areas', Icons.map_rounded, 'Area'),
            _menuItem('addons', Icons.extension_rounded, 'Add-on layanan'),
            const PopupMenuDivider(),
            _menuItem('import_mt', Icons.download_rounded, 'Impor dari MikroTik'),
            _menuItem('import_file', Icons.upload_file_rounded, 'Impor dari Excel/CSV'),
            _menuItem('template', Icons.grid_on_rounded, 'Unduh template impor'),
            _menuItem('export', Icons.ios_share_rounded, 'Ekspor CSV'),
            const PopupMenuDivider(),
            _menuItem('audit', Icons.compare_arrows_rounded, 'Audit sinkron MikroTik'),
            _menuItem('sync_radius', Icons.sync_rounded, 'Sinkron massal ke RADIUS'),
            _menuItem('migrate', Icons.swap_horiz_rounded, 'Migrasi router ke RADIUS'),
          ],
        ),
      ],
    );
  }

  static const _filters = [('', 'Semua'), ('active', 'Aktif'), ('isolated', 'Terisolir'), ('blocked', 'Diblokir'), ('suspended', 'Suspend'), ('stop', 'Stop')];

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

    return PopScope(
      canPop: _selected.isEmpty,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) setState(_selected.clear);
      },
      child: Scaffold(
        appBar: _appBar(p),
        floatingActionButton: _selected.isNotEmpty
            ? null
            : FloatingActionButton.extended(
                onPressed: () async {
                  if (await openCreateCustomer(context) && context.mounted) context.read<PppoeProvider>().load();
                },
                icon: const Icon(Icons.person_add_alt_1_rounded),
                label: const Text('Pelanggan'),
              ),
        body: Column(
          children: [
            SearchField(hint: 'Cari nama, username, HP, ID pelanggan', onChanged: _onSearchChanged),
            FilterChipRow(options: _filters, selected: p.statusFilter ?? '', onSelected: (v) => p.setStatusFilter(v.isEmpty ? null : v)),
            Expanded(
              child: DataStateView(
                loading: p.loading && p.users.isEmpty,
                error: p.users.isEmpty ? p.error : null,
                onRetry: p.load,
                isEmpty: p.users.isEmpty,
                emptyIcon: Icons.people_outline_rounded,
                emptyMessage: p.search.isNotEmpty ? 'Tidak ada yang cocok dengan "${p.search}"' : 'Belum ada pelanggan di filter ini',
                emptyHint: p.search.isNotEmpty
                    ? 'Coba nama, nomor HP, atau ID pelanggan yang lain.'
                    : 'Pilih filter lain di atas untuk melihat pelanggan lain.',
                child: RefreshableList(
                  controller: _scrollController,
                  onRefresh: p.load,
                  loadingMore: p.loadingMore,
                  hasFab: true,
                  itemCount: p.users.length,
                  itemBuilder: (context, i) {
                    final u = p.users[i];
                    return _UserTile(user: u, selecting: _selected.isNotEmpty, selected: _selected.contains(u.id), onToggle: () => _toggle(u.id));
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _UserTile extends StatelessWidget {
  const _UserTile({required this.user, required this.selecting, required this.selected, required this.onToggle});
  final PppoeUser user;
  final bool selecting;
  final bool selected;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final muted = context.colors.onSurfaceVariant;
    return EntityTile(
      icon: Icons.person_rounded,
      tone: statusTone(user.status),
      title: user.name,
      subtitle: '${user.username} · ${user.profileName ?? '-'}',
      meta: [user.customerId, user.areaName].whereType<String>().join(' · '),
      onLongPress: onToggle,
      leading: selecting ? Checkbox(value: selected, onChanged: (_) => onToggle()) : null,
      onTap: selecting
          ? onToggle
          : () async {
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
