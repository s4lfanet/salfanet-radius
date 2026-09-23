import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/formatters.dart';
import '../../models/ticket.dart';
import 'create_ticket_screen.dart';
import 'ticket_detail_screen.dart';
import 'ticket_provider.dart';

class TicketsScreen extends StatefulWidget {
  const TicketsScreen({super.key});

  @override
  State<TicketsScreen> createState() => _TicketsScreenState();
}

class _TicketsScreenState extends State<TicketsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<TicketProvider>().loadTickets();
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<TicketProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text('Tiket Bantuan')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CreateTicketScreen())),
        icon: const Icon(Icons.add),
        label: const Text('Tiket Baru'),
      ),
      body: RefreshIndicator(
        onRefresh: () => provider.loadTickets(),
        child: _buildBody(provider),
      ),
    );
  }

  Widget _buildBody(TicketProvider provider) {
    if (provider.loading && provider.tickets.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (provider.error != null && provider.tickets.isEmpty) {
      return ListView(children: [
        const SizedBox(height: 100),
        const Icon(Icons.error_outline, size: 48, color: Colors.grey),
        const SizedBox(height: 12),
        Center(child: Text(provider.error!, textAlign: TextAlign.center)),
        const SizedBox(height: 16),
        Center(child: OutlinedButton(onPressed: provider.loadTickets, child: const Text('Coba Lagi'))),
      ]);
    }
    if (provider.tickets.isEmpty) {
      return ListView(children: const [
        SizedBox(height: 120),
        Center(child: Icon(Icons.support_agent_outlined, size: 56, color: Colors.grey)),
        SizedBox(height: 12),
        Center(child: Text('Belum ada tiket bantuan')),
      ]);
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 88),
      itemCount: provider.tickets.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, index) => _TicketTile(ticket: provider.tickets[index]),
    );
  }
}

class _TicketTile extends StatelessWidget {
  const _TicketTile({required this.ticket});
  final Ticket ticket;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (label, color) = _statusVisual(ticket.status, scheme);

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => TicketDetailScreen(ticketId: ticket.id))),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(ticket.subject, style: const TextStyle(fontWeight: FontWeight.bold))),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(999)),
                    child: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 12)),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text('#${ticket.ticketNumber} · ${formatDate(ticket.createdAt)}', style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12)),
            ],
          ),
        ),
      ),
    );
  }

  (String, Color) _statusVisual(String status, ColorScheme scheme) {
    switch (status.toUpperCase()) {
      case 'OPEN':
        return ('Terbuka', const Color(0xFFF79009));
      case 'IN_PROGRESS':
        return ('Diproses', scheme.primary);
      case 'RESOLVED':
        return ('Selesai', const Color(0xFF12B76A));
      case 'CLOSED':
        return ('Ditutup', scheme.onSurfaceVariant);
      default:
        return (status, scheme.onSurfaceVariant);
    }
  }
}
