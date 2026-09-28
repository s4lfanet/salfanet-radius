import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import '../../models/registration.dart';
import 'registration_detail_screen.dart';
import 'registration_provider.dart';

class RegistrationListScreen extends StatefulWidget {
  const RegistrationListScreen({super.key});

  @override
  State<RegistrationListScreen> createState() => _RegistrationListScreenState();
}

class _RegistrationListScreenState extends State<RegistrationListScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<RegistrationProvider>().load());
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<RegistrationProvider>();
    final s = p.stats;
    String withCount(String label, int? n) => n != null && n > 0 ? '$label · $n' : label;

    return Scaffold(
      appBar: AppBar(title: const Text('Registrasi Pelanggan')),
      body: Column(
        children: [
          FilterChipRow(
            options: [
              ('PENDING', withCount('Menunggu', s?.pending)),
              ('APPROVED', withCount('Disetujui', s?.approved)),
              ('INSTALLED', withCount('Terpasang', s?.installed)),
              ('ACTIVE', withCount('Aktif', s?.active)),
              ('REJECTED', withCount('Ditolak', s?.rejected)),
            ],
            selected: p.status,
            onSelected: p.setStatus,
          ),
          Expanded(
            child: DataStateView(
              loading: p.loading,
              error: p.error,
              onRetry: p.load,
              isEmpty: p.registrations.isEmpty,
              emptyIcon: Icons.person_add_disabled_outlined,
              emptyMessage: p.status == 'PENDING' ? 'Tidak ada registrasi yang menunggu' : 'Tidak ada registrasi di status ini',
              emptyHint: p.status == 'PENDING' ? 'Pendaftaran baru dari halaman /daftar akan muncul di sini.' : null,
              child: RefreshableList(
                onRefresh: p.load,
                itemCount: p.registrations.length,
                itemBuilder: (context, i) => _Tile(reg: p.registrations[i]),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.reg});
  final Registration reg;

  @override
  Widget build(BuildContext context) {
    return EntityTile(
      icon: Icons.person_add_alt_1_rounded,
      tone: statusTone(reg.status),
      title: reg.name,
      subtitle: '${reg.profileName ?? '-'} · ${reg.areaName ?? 'Area belum ditentukan'}',
      meta: '${reg.phone} · ${formatRelativeTime(reg.createdAt)}',
      trailing: StatusPill.status(reg.status),
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => RegistrationDetailScreen(registration: reg))),
    );
  }
}
