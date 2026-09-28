import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import 'voucher_provider.dart';

String _validity(Map<String, dynamic>? profile) {
  final v = str(profile, 'validityValue');
  final u = str(profile, 'validityUnit');
  if (v == null || u == null) return '-';
  const units = {'MINUTES': 'menit', 'HOURS': 'jam', 'DAYS': 'hari', 'MONTHS': 'bulan'};
  return '$v ${units[u] ?? u.toLowerCase()}';
}

class VoucherListScreen extends StatelessWidget {
  const VoucherListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => VoucherProvider()
        ..load()
        ..loadOptions(),
      child: const _View(),
    );
  }
}

class _View extends StatelessWidget {
  const _View();

  Future<void> _openGenerate(BuildContext context) {
    final provider = context.read<VoucherProvider>();
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => ChangeNotifierProvider.value(value: provider, child: const _GenerateSheet()),
    );
  }

  void _open(BuildContext context, Map<String, dynamic> v) {
    final profile = mapOf(v, 'profile');
    final code = str(v, 'code') ?? '-';
    final password = str(v, 'password');
    final status = str(v, 'status') ?? 'WAITING';
    showDetailSheet(
      context,
      header: DetailHeader(
        icon: Icons.confirmation_number_rounded,
        tone: statusTone(status),
        title: code,
        subtitle: str(profile, 'name'),
        status: StatusPill.status(status),
        figureLabel: 'Harga jual',
        figure: formatCurrency(numOf(profile, 'sellingPrice')),
      ),
      sections: [
        DetailSection(title: 'Login', rows: [
          InfoRow('Kode / Username', code, copyable: true),
          InfoRow('Password', password ?? 'Sama dengan kode', copyable: password != null),
          InfoRow('Masa Berlaku', _validity(profile)),
        ]),
        DetailSection(title: 'Pemakaian', rows: [
          InfoRow('Login Pertama', formatDateTimeOrNull(dateOf(v, 'firstLoginAt'))),
          InfoRow('Kedaluwarsa', formatDateTimeOrNull(dateOf(v, 'expiresAt'))),
          InfoRow('Dipakai Oleh', str(v, 'lastUsedBy')),
        ]),
        DetailSection(title: 'Asal', rows: [
          InfoRow('Batch', str(v, 'batchCode'), copyable: true),
          InfoRow('Router', str(mapOf(v, 'router'), 'name')),
          InfoRow('Agent', str(mapOf(v, 'agent'), 'name')),
          InfoRow('Dibuat', formatDateTimeOrNull(dateOf(v, 'createdAt'))),
        ]),
      ],
      actions: (_) => [
        ActionSpec('Bagikan', Icons.share_rounded, () {
          Share.share('Voucher internet ${str(profile, 'name') ?? ''}\nKode: $code${password != null ? '\nPassword: $password' : ''}\nMasa berlaku: ${_validity(profile)}');
        }),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<VoucherProvider>();
    return Scaffold(
      appBar: AppBar(title: const Text('Voucher Hotspot')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openGenerate(context),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Buat Voucher'),
      ),
      body: Column(
        children: [
          FilterChipRow(
            options: const [('all', 'Semua'), ('WAITING', 'Belum Dipakai'), ('ACTIVE', 'Aktif'), ('EXPIRED', 'Kedaluwarsa')],
            selected: p.status,
            onSelected: p.setStatus,
          ),
          Expanded(
            child: DataStateView(
              loading: p.loading,
              error: p.error,
              onRetry: p.load,
              isEmpty: p.vouchers.isEmpty,
              emptyIcon: Icons.confirmation_number_outlined,
              emptyMessage: 'Belum ada voucher di filter ini',
              emptyHint: 'Ketuk "Buat Voucher" untuk membuat batch baru.',
              child: RefreshableList(
                onRefresh: p.load,
                itemCount: p.vouchers.length,
                itemBuilder: (context, i) {
                  final v = p.vouchers[i];
                  final profile = mapOf(v, 'profile');
                  final status = str(v, 'status') ?? 'WAITING';
                  return EntityTile(
                    icon: Icons.confirmation_number_rounded,
                    tone: statusTone(status),
                    title: str(v, 'code') ?? '-',
                    subtitle: '${str(profile, 'name') ?? '-'} · ${_validity(profile)}',
                    meta: [str(v, 'batchCode'), str(mapOf(v, 'agent'), 'name')].whereType<String>().join(' · '),
                    trailing: AmountTrailing(amount: formatCurrency(numOf(profile, 'sellingPrice')), pill: StatusPill.status(status)),
                    onTap: () => _open(context, v),
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

class _GenerateSheet extends StatefulWidget {
  const _GenerateSheet();

  @override
  State<_GenerateSheet> createState() => _GenerateSheetState();
}

class _GenerateSheetState extends State<_GenerateSheet> {
  final _quantity = TextEditingController(text: '10');
  final _prefix = TextEditingController();
  String? _profileId;
  String? _routerId;

  @override
  void dispose() {
    _quantity.dispose();
    _prefix.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final qty = int.tryParse(_quantity.text) ?? 0;
    if (qty <= 0 || _profileId == null) {
      showToast(context, 'Isi jumlah dan pilih paket dulu.');
      return;
    }
    final provider = context.read<VoucherProvider>();
    try {
      final count = await provider.generate(quantity: qty, profileId: _profileId!, routerId: _routerId, prefix: _prefix.text.trim());
      if (!mounted) return;
      Navigator.pop(context);
      showToast(context, '$count voucher dibuat.');
    } on ApiException catch (e) {
      if (mounted) showToast(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<VoucherProvider>();
    Map<String, dynamic>? selected;
    for (final x in p.profiles) {
      if (x['id']?.toString() == _profileId) selected = x;
    }
    return Padding(
      padding: EdgeInsets.fromLTRB(Gap.page, 0, Gap.page, MediaQuery.viewInsetsOf(context).bottom + Gap.lg),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Buat Voucher', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          const SizedBox(height: Gap.lg),
          DropdownButtonFormField<String>(
            value: _profileId,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Paket'),
            items: p.profiles
                .map((x) => DropdownMenuItem(value: x['id']?.toString(), child: Text('${x['name']} · ${formatCurrency(numOf(x, 'sellingPrice'))}')))
                .toList(),
            onChanged: (v) => setState(() => _profileId = v),
          ),
          if (selected != null)
            Padding(
              padding: const EdgeInsets.only(top: Gap.xs, left: 4),
              child: Text('Masa berlaku ${_validity(selected)}', style: TextStyle(fontSize: 12, color: context.colors.onSurfaceVariant)),
            ),
          const SizedBox(height: Gap.md),
          Row(
            children: [
              Expanded(child: TextField(controller: _quantity, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Jumlah'))),
              const SizedBox(width: Gap.md),
              Expanded(
                child: TextField(controller: _prefix, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'Awalan (opsional)')),
              ),
            ],
          ),
          const SizedBox(height: Gap.md),
          DropdownButtonFormField<String>(
            value: _routerId,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Router (opsional)'),
            items: p.routers.map((r) => DropdownMenuItem(value: r['id']?.toString(), child: Text(r['name']?.toString() ?? '-'))).toList(),
            onChanged: (v) => setState(() => _routerId = v),
          ),
          const SizedBox(height: Gap.xl),
          FilledButton(
            onPressed: p.generating ? null : _submit,
            child: p.generating
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Buat Voucher'),
          ),
        ],
      ),
    );
  }
}
