import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

/// Bukti pembayaran transfer — photos customers uploaded, with review
/// status, as the web portal's proofs page lists them.
class ProofsScreen extends StatefulWidget {
  const ProofsScreen({super.key});

  @override
  State<ProofsScreen> createState() => _ProofsScreenState();
}

class _ProofsScreenState extends State<ProofsScreen> {
  static const _filters = <(String, String)>[
    ('all', 'Semua'),
    ('pending', 'Menunggu'),
    ('approved', 'Disetujui'),
    ('rejected', 'Ditolak'),
  ];

  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _proofs = [];
  String _filter = 'all';

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
      final res = await ApiClient.instance.get('/api/collector/proofs', query: {'filter': _filter});
      final list = res is Map ? res['proofs'] : null;
      setState(() => _proofs = [for (final p in list is List ? list : const []) Map<String, dynamic>.from(p as Map)]);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Bukti Pembayaran')),
      body: Column(
        children: [
          const SizedBox(height: Gap.sm),
          FilterChipRow(options: _filters, selected: _filter, onSelected: (v) { _filter = v; _load(); }),
          const SizedBox(height: Gap.sm),
          Expanded(
            child: DataStateView(
              loading: _loading,
              error: _error,
              isEmpty: _proofs.isEmpty,
              emptyIcon: Icons.receipt_outlined,
              emptyMessage: 'Tidak ada bukti',
              emptyHint: 'Bukti transfer pelanggan akan tampil di sini.',
              onRetry: _load,
              child: RefreshableList(
                itemCount: _proofs.length,
                onRefresh: _load,
                itemBuilder: (_, i) {
                  final p = _proofs[i];
                  final status = '${p['status'] ?? 'pending'}';
                  return EntityTile(
                    icon: Icons.receipt_outlined,
                    tone: statusTone(status),
                    title: (p['fullname'] ?? p['username'] ?? '-').toString(),
                    subtitle: '${p['invoice_number'] ?? ''} · ${p['submitted_at']?.toString().split('T').first ?? ''}',
                    trailing: AmountTrailing(amount: formatCurrency(num.tryParse('${p['amount']}') ?? 0), pill: StatusPill.status(status)),
                    onTap: () => showDetailSheet<void>(
                      context,
                      header: DetailHeader(
                        icon: Icons.receipt_outlined,
                        tone: statusTone(status),
                        title: (p['fullname'] ?? p['username'] ?? '-').toString(),
                        subtitle: p['invoice_number']?.toString(),
                        status: StatusPill.status(status),
                        figure: formatCurrency(num.tryParse('${p['amount']}') ?? 0),
                        figureLabel: 'Nominal bukti',
                      ),
                      sections: [
                        DetailSection(title: 'Bukti', rows: const [], trailing: ProofImage(source: str(p, 'proof_image'), baseUrl: ApiClient.instance.baseUrl)),
                        DetailSection(title: 'Info', rows: [
                          InfoRow('Pelanggan', str(p, 'username')),
                          InfoRow('Telepon', str(p, 'phone')),
                          InfoRow('Paket', str(p, 'profileName')),
                          InfoRow('Area', str(p, 'areaName')),
                          InfoRow('Dikirim', str(p, 'submitted_at')?.split('T').first),
                          InfoRow('Ditinjau', str(p, 'reviewed_at')?.split('T').first),
                          if (status.toLowerCase() == 'rejected') InfoRow('Alasan tolak', str(p, 'reject_reason')),
                        ]),
                      ],
                    ),
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
