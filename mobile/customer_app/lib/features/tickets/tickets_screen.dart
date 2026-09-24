import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/feature_colors.dart';
import '../../core/widgets/state_views.dart';
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

  void _openCreate() {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CreateTicketScreen()));
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<TicketProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text('Tiket Bantuan')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openCreate,
        icon: const Icon(Icons.add_rounded),
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
      return const ScrollableCenter(child: AppLoadingState(label: 'Memuat tiket...'));
    }
    if (provider.error != null && provider.tickets.isEmpty) {
      return ScrollableCenter(
        child: AppErrorState(message: provider.error!, onRetry: provider.loadTickets),
      );
    }
    if (provider.tickets.isEmpty) {
      return ScrollableCenter(
        child: AppEmptyState(
          icon: Icons.support_agent_rounded,
          accent: FeatureColors.ticket,
          title: 'Belum ada tiket',
          message: 'Kalau internet Anda lambat atau mati, buat tiket di sini. '
              'Teknisi akan menerimanya dan membalas lewat aplikasi ini.',
          action: FilledButton.icon(
            onPressed: _openCreate,
            icon: const Icon(Icons.add_rounded, size: 18),
            label: const Text('Buat Tiket Pertama'),
          ),
        ),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
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
    final brightness = Theme.of(context).brightness;
    final (label, color, icon) = _statusVisual(ticket.status, scheme, brightness);

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => TicketDetailScreen(ticketId: ticket.id)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(ticket.subject, style: Theme.of(context).textTheme.titleSmall),
                  ),
                  const SizedBox(width: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: brightness == Brightness.dark ? 0.2 : 0.12),
                      borderRadius: BorderRadius.circular(AppRadius.pill),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(icon, size: 13, color: color),
                        const SizedBox(width: 5),
                        Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 11.5)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                '#${ticket.ticketNumber} · dibuat ${formatDate(ticket.createdAt)}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Icon plus word alongside the hue, so the state survives color blindness
  /// and greyscale screenshots.
  (String, Color, IconData) _statusVisual(String status, ColorScheme scheme, Brightness brightness) {
    switch (status.toUpperCase()) {
      case 'OPEN':
        return ('Terbuka', StatusColors.warning(brightness), Icons.markunread_mailbox_rounded);
      case 'IN_PROGRESS':
        return ('Diproses', FeatureColors.ticket.of(brightness), Icons.engineering_rounded);
      case 'RESOLVED':
        return ('Selesai', StatusColors.success(brightness), Icons.check_circle_rounded);
      case 'CLOSED':
        return ('Ditutup', scheme.onSurfaceVariant, Icons.lock_rounded);
      default:
        return (status, scheme.onSurfaceVariant, Icons.help_outline_rounded);
    }
  }
}
