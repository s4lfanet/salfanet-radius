import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

/// Agent/reseller directory with the same per-agent numbers the web agent
/// list shows (balance, stock, sales this month and all time). Creating or
/// editing agents stays on the web.
class AgentListScreen extends StatefulWidget {
  const AgentListScreen({super.key});

  @override
  State<AgentListScreen> createState() => _AgentListScreenState();
}

class _AgentListScreenState extends State<AgentListScreen> {
  List<Map<String, dynamic>> _agents = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _agents.isEmpty;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/hotspot/agents');
      if (res is Map<String, dynamic>) {
        _agents = ((res['agents'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
      }
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _wa(String phone) {
    var n = phone.replaceAll(RegExp(r'[^0-9]'), '');
    if (n.startsWith('0')) n = '62${n.substring(1)}';
    return n;
  }

  void _open(Map<String, dynamic> a) {
    final stats = mapOf(a, 'stats');
    final month = mapOf(stats, 'currentMonth');
    final all = mapOf(stats, 'allTime');
    final active = a['isActive'] == true;
    final phone = str(a, 'phone') ?? '';
    showDetailSheet(
      context,
      header: DetailHeader(
        icon: Icons.storefront_rounded,
        tone: active ? Tone.primary : Tone.neutral,
        title: str(a, 'name') ?? '-',
        subtitle: phone,
        status: StatusPill(label: active ? 'Aktif' : 'Nonaktif', tone: active ? Tone.success : Tone.neutral),
        figureLabel: 'Saldo',
        figure: formatCurrency(numOf(a, 'balance')),
      ),
      sections: [
        DetailSection(title: 'Penjualan', rows: [
          InfoRow('Bulan ini', '${numOf(month, 'count')} voucher · komisi ${formatCurrency(numOf(month, 'total'))}'),
          InfoRow('Sepanjang waktu', '${numOf(all, 'count')} voucher · komisi ${formatCurrency(numOf(all, 'total'))}'),
          InfoRow('Stok belum terjual', '${numOf(a, 'voucherStock')} voucher'),
          InfoRow('Total dibuat', '${numOf(stats, 'generated')} voucher'),
        ]),
        DetailSection(title: 'Akun', rows: [
          InfoRow('Saldo minimum', formatCurrency(numOf(a, 'minBalance'))),
          InfoRow('Router', str(mapOf(a, 'router'), 'name')),
          InfoRow('Email', str(a, 'email')),
          InfoRow('Alamat', str(a, 'address')),
          InfoRow('Login terakhir', formatDateTimeOrNull(dateOf(a, 'lastLogin'))),
          InfoRow('Terdaftar', formatDateOrNull(dateOf(a, 'createdAt'))),
        ]),
      ],
      actions: phone.isEmpty
          ? null
          : (_) => [
                ActionSpec('WhatsApp', Icons.chat_rounded, () => launchUrl(Uri.parse('https://wa.me/${_wa(phone)}'), mode: LaunchMode.externalApplication)),
                ActionSpec('Telepon', Icons.call_rounded, () => launchUrl(Uri(scheme: 'tel', path: phone)), kind: ActionKind.neutral),
              ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Agent Hotspot')),
      body: DataStateView(
        loading: _loading,
        error: _error,
        onRetry: _load,
        isEmpty: _agents.isEmpty,
        emptyIcon: Icons.storefront_outlined,
        emptyMessage: 'Belum ada agent',
        emptyHint: 'Agent/reseller voucher ditambahkan dari panel web.',
        child: RefreshableList(
          onRefresh: _load,
          itemCount: _agents.length,
          itemBuilder: (context, i) {
            final a = _agents[i];
            final active = a['isActive'] == true;
            final month = mapOf(mapOf(a, 'stats'), 'currentMonth');
            return EntityTile(
              icon: Icons.storefront_rounded,
              tone: active ? Tone.primary : Tone.neutral,
              title: str(a, 'name') ?? '-',
              subtitle: '${numOf(month, 'count')} terjual bulan ini · stok ${numOf(a, 'voucherStock')}',
              meta: str(a, 'phone'),
              trailing: AmountTrailing(
                amount: formatCurrency(numOf(a, 'balance')),
                pill: active ? null : const StatusPill(label: 'Nonaktif', tone: Tone.neutral),
              ),
              onTap: () => _open(a),
            );
          },
        ),
      ),
    );
  }
}
