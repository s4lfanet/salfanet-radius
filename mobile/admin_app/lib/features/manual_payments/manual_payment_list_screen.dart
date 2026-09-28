import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import '../../models/manual_payment.dart';
import 'manual_payment_detail_screen.dart';
import 'manual_payment_provider.dart';

class ManualPaymentListScreen extends StatelessWidget {
  const ManualPaymentListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(create: (_) => ManualPaymentProvider()..load(), child: const _View());
  }
}

class _View extends StatelessWidget {
  const _View();

  @override
  Widget build(BuildContext context) {
    final p = context.watch<ManualPaymentProvider>();
    return Scaffold(
      appBar: AppBar(title: const Text('Pembayaran Manual')),
      body: Column(
        children: [
          FilterChipRow(
            options: const [('PENDING', 'Menunggu'), ('APPROVED', 'Disetujui'), ('REJECTED', 'Ditolak')],
            selected: p.status,
            onSelected: p.setStatus,
          ),
          Expanded(
            child: DataStateView(
              loading: p.loading,
              error: p.error,
              onRetry: p.load,
              isEmpty: p.payments.isEmpty,
              emptyIcon: Icons.receipt_outlined,
              emptyMessage: p.status == 'PENDING' ? 'Tidak ada bukti transfer yang menunggu' : 'Belum ada data di status ini',
              emptyHint: p.status == 'PENDING' ? 'Bukti transfer yang dikirim pelanggan dari halaman bayar akan muncul di sini.' : null,
              child: RefreshableList(
                onRefresh: p.load,
                itemCount: p.payments.length,
                itemBuilder: (context, i) => _Tile(payment: p.payments[i]),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.payment});
  final ManualPayment payment;

  @override
  Widget build(BuildContext context) {
    return EntityTile(
      icon: Icons.receipt_rounded,
      tone: statusTone(payment.status),
      title: payment.customerName ?? '-',
      subtitle: '${payment.bankName} · a.n. ${payment.accountName}',
      meta: '${payment.invoiceNumber ?? '-'} · ${formatRelativeTime(payment.createdAt)}',
      trailing: AmountTrailing(amount: formatCurrency(payment.amount), pill: StatusPill.status(payment.status)),
      onTap: () => Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => ChangeNotifierProvider.value(value: context.read<ManualPaymentProvider>(), child: ManualPaymentDetailScreen(payment: payment)),
      )),
    );
  }
}
