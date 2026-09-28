import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import '../../models/invoice.dart';
import 'invoice_detail_screen.dart';
import 'invoice_provider.dart';

class InvoiceListScreen extends StatefulWidget {
  const InvoiceListScreen({super.key});

  @override
  State<InvoiceListScreen> createState() => _InvoiceListScreenState();
}

class _InvoiceListScreenState extends State<InvoiceListScreen> {
  Timer? _debounce;
  final _scrollController = ScrollController();

  static const _tabs = [('UNPAID', 'Belum Lunas'), ('PAID', 'Lunas'), ('all', 'Semua')];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<InvoiceProvider>().load());
    _scrollController.addListener(() {
      if (_scrollController.position.pixels > _scrollController.position.maxScrollExtent - 300) {
        context.read<InvoiceProvider>().loadMore();
      }
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _scrollController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () => context.read<InvoiceProvider>().setSearch(value.trim()));
  }

  @override
  Widget build(BuildContext context) {
    final p = context.watch<InvoiceProvider>();
    final s = p.stats;

    return Scaffold(
      appBar: AppBar(title: const Text('Tagihan')),
      body: Column(
        children: [
          if (s != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, 0),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: Gap.lg, vertical: Gap.md),
                  child: Row(
                    children: [
                      Expanded(child: LabeledFigure(label: 'Belum lunas · ${s.unpaid}', value: formatCurrency(s.totalUnpaidAmount), color: context.tone(Tone.warning), valueSize: 16)),
                      Container(width: 1, height: 36, color: context.colors.outline),
                      const SizedBox(width: Gap.lg),
                      Expanded(child: LabeledFigure(label: 'Lunas · ${s.paid}', value: formatCurrency(s.totalPaidAmount), color: context.tone(Tone.success), valueSize: 16)),
                    ],
                  ),
                ),
              ),
            ),
          SearchField(hint: 'Cari no. invoice, nama, username', onChanged: _onSearchChanged),
          FilterChipRow(options: _tabs, selected: p.status, onSelected: p.setStatus),
          Expanded(
            child: DataStateView(
              loading: p.loading && p.invoices.isEmpty,
              error: p.invoices.isEmpty ? p.error : null,
              onRetry: p.load,
              isEmpty: p.invoices.isEmpty,
              emptyIcon: Icons.receipt_long_outlined,
              emptyMessage: p.status == 'UNPAID' ? 'Semua tagihan sudah lunas' : 'Tidak ada tagihan di filter ini',
              emptyHint: p.search.isNotEmpty ? 'Tidak ada yang cocok dengan "${p.search}".' : null,
              child: RefreshableList(
                controller: _scrollController,
                onRefresh: p.load,
                loadingMore: p.loadingMore,
                itemCount: p.invoices.length,
                itemBuilder: (context, i) => _InvoiceTile(invoice: p.invoices[i]),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _InvoiceTile extends StatelessWidget {
  const _InvoiceTile({required this.invoice});
  final Invoice invoice;

  @override
  Widget build(BuildContext context) {
    return EntityTile(
      icon: Icons.receipt_long_rounded,
      tone: statusTone(invoice.status),
      title: invoice.customerName ?? invoice.invoiceNumber,
      subtitle: invoice.invoiceNumber,
      meta: invoice.isPaid && invoice.paidAt != null ? 'Dibayar ${formatDate(invoice.paidAt!)}' : 'Jatuh tempo ${formatDate(invoice.dueDate)}',
      onTap: () async {
        final changed = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => InvoiceDetailScreen(invoice: invoice)));
        if (changed == true && context.mounted) context.read<InvoiceProvider>().load();
      },
      trailing: AmountTrailing(amount: formatCurrency(invoice.amount), pill: StatusPill.status(invoice.status)),
    );
  }
}
