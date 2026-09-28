import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../models/invoice.dart';
import '../pppoe/pppoe_detail_screen.dart';

/// Invoice detail with the actions the web invoice page offers: mark paid,
/// send reminder (WhatsApp/email), and share the customer payment link.
class InvoiceDetailScreen extends StatefulWidget {
  const InvoiceDetailScreen({super.key, required this.invoice});
  final Invoice invoice;

  @override
  State<InvoiceDetailScreen> createState() => _InvoiceDetailScreenState();
}

class _InvoiceDetailScreenState extends State<InvoiceDetailScreen> {
  Invoice get _invoice => widget.invoice;
  bool _acting = false;

  Future<void> _markPaid() async {
    final ok = await confirmAction(
      context,
      title: 'Tandai Lunas',
      message: '${_invoice.invoiceNumber} (${formatCurrency(_invoice.amount)}) akan ditandai lunas. Masa aktif diperpanjang dan koneksi dipulihkan bila terisolir.',
      confirmLabel: 'Tandai Lunas',
    );
    if (!ok || !mounted) return;
    setState(() => _acting = true);
    final done = await runAction(context, () => ApiClient.instance.put('/api/invoices', data: {'id': _invoice.id, 'status': 'PAID'}), success: 'Invoice ditandai lunas.');
    if (!mounted) return;
    setState(() => _acting = false);
    if (done) Navigator.pop(context, true);
  }

  Future<void> _sendReminder() async {
    final channel = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(padding: EdgeInsets.fromLTRB(Gap.page, 0, Gap.page, Gap.sm), child: Text('Kirim pengingat lewat', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
            ListTile(leading: const Icon(Icons.chat_outlined), title: const Text('WhatsApp'), onTap: () => Navigator.pop(ctx, 'whatsapp')),
            ListTile(leading: const Icon(Icons.mail_outline_rounded), title: const Text('Email'), onTap: () => Navigator.pop(ctx, 'email')),
            ListTile(leading: const Icon(Icons.forward_to_inbox_outlined), title: const Text('WhatsApp dan Email'), onTap: () => Navigator.pop(ctx, 'both')),
            const SizedBox(height: Gap.sm),
          ],
        ),
      ),
    );
    if (channel == null || !mounted) return;
    await runAction(context, () => ApiClient.instance.post('/api/invoices/send-reminder', data: {'invoiceId': _invoice.id, 'channel': channel}),
        success: 'Pengingat dikirim.');
  }

  void _shareLink() {
    final link = _invoice.paymentLink;
    if (link == null) return;
    Share.share('Tagihan ${_invoice.invoiceNumber} sebesar ${formatCurrency(_invoice.amount)}, jatuh tempo ${formatDate(_invoice.dueDate)}.\nBayar di: $link');
  }

  @override
  Widget build(BuildContext context) {
    final inv = _invoice;
    final unpaid = !inv.isPaid && inv.status.toUpperCase() != 'CANCELLED';
    return Scaffold(
      appBar: AppBar(
        title: const Text('Detail Tagihan'),
        actions: [
          if (unpaid)
            IconButton(tooltip: 'Kirim pengingat', icon: const Icon(Icons.notifications_active_outlined), onPressed: _sendReminder),
        ],
      ),
      bottomNavigationBar: unpaid
          ? ActionBar(actions: [
              ActionSpec('Tandai Lunas', Icons.check_circle_rounded, _markPaid, kind: ActionKind.success, busy: _acting),
              if (inv.paymentLink != null) ActionSpec('Bagikan Link', Icons.share_rounded, _shareLink, kind: ActionKind.neutral),
            ])
          : null,
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, Gap.xl),
        children: [
          DetailHeader(
            icon: Icons.receipt_long_rounded,
            tone: statusTone(inv.status),
            title: inv.invoiceNumber,
            subtitle: invoiceTypeLabels[inv.invoiceType] ?? inv.invoiceType,
            status: StatusPill.status(inv.status),
            figureLabel: 'Total tagihan',
            figure: formatCurrency(inv.amount),
          ),
          DetailSection(title: 'Tagihan', rows: [
            InfoRow('Jatuh Tempo', formatDate(inv.dueDate), valueColor: inv.status.toUpperCase() == 'OVERDUE' ? context.tone(Tone.danger) : null),
            InfoRow('Dibuat', formatDateOrNull(inv.createdAt)),
            InfoRow('Dibayar', formatDateTimeOrNull(inv.paidAt)),
            InfoRow('Metode', inv.paymentMethod),
            InfoRow('Sebelum Pajak', inv.baseAmount != null && inv.baseAmount != inv.amount ? formatCurrency(inv.baseAmount!) : null),
            InfoRow('Link Bayar', inv.paymentLink, copyable: true),
            InfoRow('Catatan', inv.notes),
          ]),
          DetailSection(title: 'Pelanggan', rows: [
            InfoRow('Nama', inv.customerName,
                onTap: inv.userId == null ? null : () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PppoeDetailScreen(userId: inv.userId!)))),
            InfoRow('ID Pelanggan', inv.customerId, copyable: true),
            InfoRow('Username', inv.customerUsername, copyable: true),
            InfoRow('Telepon', inv.customerPhone, copyable: true),
            InfoRow('Email', inv.customerEmail),
            InfoRow('Paket', inv.profileName),
            InfoRow('Area', inv.areaName),
          ]),
        ],
      ),
    );
  }
}
