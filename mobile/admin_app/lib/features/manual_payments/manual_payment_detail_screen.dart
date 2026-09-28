import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../models/manual_payment.dart';
import 'manual_payment_provider.dart';

class ManualPaymentDetailScreen extends StatefulWidget {
  const ManualPaymentDetailScreen({super.key, required this.payment});
  final ManualPayment payment;

  @override
  State<ManualPaymentDetailScreen> createState() => _ManualPaymentDetailScreenState();
}

class _ManualPaymentDetailScreenState extends State<ManualPaymentDetailScreen> {
  bool _acting = false;
  ManualPayment get p => widget.payment;

  Future<void> _approve() async {
    final ok = await confirmAction(
      context,
      title: 'Setujui Pembayaran',
      message: 'Pastikan ${formatCurrency(p.amount)} dari ${p.accountName} (${p.bankName}) sudah masuk ke rekening. Invoice ${p.invoiceNumber ?? ''} akan ditandai lunas.',
      confirmLabel: 'Setujui',
    );
    if (!ok || !mounted) return;
    setState(() => _acting = true);
    final provider = context.read<ManualPaymentProvider>();
    final done = await runAction(context, () => provider.approve(p.id), success: 'Pembayaran disetujui.');
    if (!mounted) return;
    setState(() => _acting = false);
    if (done) Navigator.pop(context);
  }

  Future<void> _reject() async {
    final reason = await askReason(context, title: 'Tolak Pembayaran', label: 'Alasan (dikirim ke pelanggan)');
    if (reason == null || !mounted) return;
    setState(() => _acting = true);
    final provider = context.read<ManualPaymentProvider>();
    final done = await runAction(context, () => provider.reject(p.id, reason), success: 'Pembayaran ditolak.');
    if (!mounted) return;
    setState(() => _acting = false);
    if (done) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final pending = p.status == 'PENDING';
    return Scaffold(
      appBar: AppBar(title: const Text('Detail Pembayaran')),
      bottomNavigationBar: pending
          ? ActionBar(actions: [
              ActionSpec('Setujui', Icons.check_rounded, _approve, kind: ActionKind.success, busy: _acting),
              ActionSpec('Tolak', Icons.close_rounded, _acting ? null : _reject, kind: ActionKind.danger),
            ])
          : null,
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, Gap.xl),
        children: [
          DetailHeader(
            icon: Icons.receipt_rounded,
            tone: statusTone(p.status),
            title: p.customerName ?? '-',
            subtitle: p.customerUsername,
            status: StatusPill.status(p.status),
            figureLabel: 'Jumlah transfer',
            figure: formatCurrency(p.amount),
          ),
          DetailSection(title: 'Transfer', rows: [
            InfoRow('Bank / E-Wallet', p.bankName),
            InfoRow('No. Rekening', p.accountNumber, copyable: true),
            InfoRow('Atas Nama', p.accountName),
            InfoRow('Tgl Transfer', formatDate(p.paymentDate)),
            InfoRow('Dikirim', formatDateTime(p.createdAt)),
            InfoRow('Catatan', p.notes),
          ]),
          DetailSection(title: 'Tagihan', rows: [
            InfoRow('Invoice', p.invoiceNumber, copyable: true),
            InfoRow('Telepon', p.customerPhone, copyable: true),
            InfoRow('Alasan Ditolak', p.rejectionReason, valueColor: context.tone(Tone.danger)),
          ]),
          ProofImage(source: p.receiptImage, baseUrl: ApiClient.instance.baseUrl, relativePrefix: '/uploads/payment-proofs/'),
        ],
      ),
    );
  }
}
