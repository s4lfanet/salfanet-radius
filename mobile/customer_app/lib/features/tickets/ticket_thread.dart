import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/theme/app_theme.dart';
import '../../models/ticket.dart';
import 'ticket_attachments.dart';

final _dayFormat = DateFormat('EEEE, d MMMM yyyy', 'id_ID');
final _timeFormat = DateFormat('HH:mm', 'id_ID');

const _roles = {'CUSTOMER': 'Anda', 'ADMIN': 'Admin', 'TECHNICIAN': 'Teknisi', 'SYSTEM': 'Sistem'};

/// The conversation of one ticket as the customer sees it: their report first, then every reply,
/// grouped by day. The customer's own messages sit on the right.
List<Widget> buildTicketThread(BuildContext context, {required Ticket ticket, required List<TicketMessage> messages}) {
  final opening = TicketMessage(
    id: '__opening',
    senderType: 'CUSTOMER',
    senderName: 'Anda',
    message: ticket.description,
    createdAt: ticket.createdAt,
    attachments: ticket.attachments,
  );
  final out = <Widget>[];
  String? lastDay;
  for (final msg in [opening, ...messages]) {
    final day = DateFormat('yyyy-MM-dd').format(msg.createdAt);
    if (day != lastDay) {
      out.add(_DaySeparator(label: _dayFormat.format(msg.createdAt)));
      lastDay = day;
    }
    out.add(msg.senderType.toUpperCase() == 'SYSTEM' ? _SystemLine(message: msg) : _Bubble(message: msg, isOpening: identical(msg, opening)));
  }
  return out;
}

class _DaySeparator extends StatelessWidget {
  const _DaySeparator({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final line = Expanded(child: Divider(color: scheme.outlineVariant));
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          line,
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Text(label, style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
          ),
          line,
        ],
      ),
    );
  }
}

class _SystemLine extends StatelessWidget {
  const _SystemLine({required this.message});
  final TicketMessage message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(color: scheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(AppRadius.control)),
          child: Text(
            '${message.message} · ${_timeFormat.format(message.createdAt)}',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
          ),
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message, required this.isOpening});
  final TicketMessage message;
  final bool isOpening;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final mine = message.isFromCustomer;
    final role = _roles[message.senderType.toUpperCase()] ?? message.senderType;
    final muted = TextStyle(fontSize: 12, color: scheme.onSurfaceVariant);

    // Staff are named with their role, so the customer knows who answered; their own side needs no name.
    final header = mine ? (isOpening ? 'Laporan Anda' : 'Anda') : '${message.senderName} · $role';

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.84),
        decoration: BoxDecoration(
          color: mine ? scheme.primary.withValues(alpha: dark ? 0.22 : 0.09) : scheme.surface,
          border: Border.all(color: mine ? scheme.primary.withValues(alpha: 0.28) : scheme.outlineVariant),
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(AppRadius.card),
            topRight: const Radius.circular(AppRadius.card),
            bottomLeft: Radius.circular(mine ? AppRadius.card : 4),
            bottomRight: Radius.circular(mine ? 4 : AppRadius.card),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(header, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: mine ? scheme.onSurfaceVariant : scheme.onSurface)),
            if (!message.isPhotoOnly && message.message.trim().isNotEmpty) ...[
              const SizedBox(height: 4),
              SelectableText(message.message, style: TextStyle(fontSize: 14, height: 1.45, color: scheme.onSurface)),
            ],
            if (message.attachments.isNotEmpty) TicketAttachments(paths: message.attachments, showLabel: false),
            const SizedBox(height: 4),
            Align(alignment: Alignment.centerRight, child: Text(_timeFormat.format(message.createdAt), style: muted.copyWith(fontSize: 11))),
          ],
        ),
      ),
    );
  }
}
