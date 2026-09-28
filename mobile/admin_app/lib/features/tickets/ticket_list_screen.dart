import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import '../../models/ticket.dart';
import 'ticket_detail_screen.dart';
import 'ticket_provider.dart';

const ticketStatusOptions = [
  ('OPEN', 'Baru'),
  ('IN_PROGRESS', 'Diproses'),
  ('WAITING_CUSTOMER', 'Menunggu Pelanggan'),
  ('RESOLVED', 'Selesai'),
  ('CLOSED', 'Ditutup'),
];

Tone priorityTone(String priority) {
  switch (priority.toUpperCase()) {
    case 'URGENT':
      return Tone.danger;
    case 'HIGH':
      return Tone.warning;
    case 'LOW':
      return Tone.neutral;
    default:
      return Tone.primary;
  }
}

String priorityLabel(String priority) =>
    const {'URGENT': 'Mendesak', 'HIGH': 'Tinggi', 'MEDIUM': 'Sedang', 'LOW': 'Rendah'}[priority.toUpperCase()] ?? priority;

class TicketListScreen extends StatelessWidget {
  const TicketListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(create: (_) => TicketProvider()..load(), child: const _View());
  }
}

class _View extends StatelessWidget {
  const _View();

  @override
  Widget build(BuildContext context) {
    final p = context.watch<TicketProvider>();
    return Scaffold(
      appBar: AppBar(title: const Text('Tiket Bantuan')),
      body: Column(
        children: [
          FilterChipRow(options: ticketStatusOptions, selected: p.status, onSelected: p.setStatus),
          Expanded(
            child: DataStateView(
              loading: p.loading,
              error: p.error,
              onRetry: p.load,
              isEmpty: p.tickets.isEmpty,
              emptyIcon: Icons.support_agent_outlined,
              emptyMessage: 'Tidak ada tiket di status ini',
              emptyHint: p.status == 'OPEN' ? 'Tiket baru dari pelanggan akan muncul di sini.' : null,
              child: RefreshableList(
                onRefresh: p.load,
                itemCount: p.tickets.length,
                itemBuilder: (context, i) => _Tile(ticket: p.tickets[i]),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.ticket});
  final Ticket ticket;

  @override
  Widget build(BuildContext context) {
    return EntityTile(
      icon: Icons.support_agent_rounded,
      tone: priorityTone(ticket.priority),
      title: ticket.subject,
      subtitle: '${ticket.customerName} · #${ticket.ticketNumber}',
      meta: [
        formatRelativeTime(ticket.createdAt),
        if (ticket.messageCount > 0) '${ticket.messageCount} balasan',
        if (ticket.categoryName != null) ticket.categoryName!,
      ].join(' · '),
      trailing: StatusPill(label: priorityLabel(ticket.priority), tone: priorityTone(ticket.priority)),
      onTap: () async {
        final provider = context.read<TicketProvider>();
        await Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => ChangeNotifierProvider.value(value: provider, child: TicketDetailScreen(ticket: ticket)),
        ));
        provider.load();
      },
    );
  }
}
