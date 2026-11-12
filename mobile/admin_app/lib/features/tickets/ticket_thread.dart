import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/theme/app_theme.dart';
import '../../models/ticket.dart';
import 'ticket_attachments.dart';

final _dayFormat = DateFormat('EEEE, d MMMM yyyy', 'id_ID');
final _timeFormat = DateFormat('HH:mm', 'id_ID');

const senderLabels = {'CUSTOMER': 'Pelanggan', 'ADMIN': 'Admin', 'TECHNICIAN': 'Teknisi', 'SYSTEM': 'Sistem'};

/// The conversation of one ticket: the customer's report first, then every reply, grouped by day.
/// Messages from [viewer]'s side sit on the right.
List<Widget> buildTicketThread(BuildContext context, {required Ticket ticket, required List<TicketMessage> messages, required String viewer}) {
  final opening = TicketMessage(
    id: '__opening',
    senderType: 'CUSTOMER',
    senderName: ticket.customerName,
    message: ticket.description,
    createdAt: ticket.createdAt,
    attachments: ticket.attachments,
  );
  final items = [opening, ...messages];
  final out = <Widget>[];
  String? lastDay;
  for (final msg in items) {
    final day = DateFormat('yyyy-MM-dd').format(msg.createdAt);
    if (day != lastDay) {
      out.add(_DaySeparator(label: _dayFormat.format(msg.createdAt)));
      lastDay = day;
    }
    out.add(msg.senderType == 'SYSTEM'
        ? _SystemLine(message: msg)
        : TicketBubble(message: msg, own: msg.senderType == viewer, isOpening: identical(msg, opening)));
  }
  return out;
}

class _DaySeparator extends StatelessWidget {
  const _DaySeparator({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    final line = Expanded(child: Divider(color: context.colors.outlineVariant));
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Gap.sm),
      child: Row(
        children: [
          line,
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: Gap.sm),
            child: Text(label, style: TextStyle(fontSize: 12, color: context.colors.onSurfaceVariant)),
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
    return Padding(
      padding: const EdgeInsets.only(bottom: Gap.sm),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: Gap.md, vertical: 6),
          decoration: BoxDecoration(color: context.colors.surfaceContainerHighest, borderRadius: BorderRadius.circular(AppTheme.radiusControl)),
          child: Text(
            '${message.message} · ${_timeFormat.format(message.createdAt)}',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: context.colors.onSurfaceVariant),
          ),
        ),
      ),
    );
  }
}

class TicketBubble extends StatelessWidget {
  const TicketBubble({super.key, required this.message, required this.own, this.isOpening = false});
  final TicketMessage message;
  final bool own;
  final bool isOpening;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final warning = context.tone(Tone.warning);
    final Color bg;
    final Color border;
    if (message.isInternal) {
      bg = warning.withValues(alpha: dark ? 0.16 : 0.08);
      border = warning.withValues(alpha: 0.45);
    } else if (own) {
      bg = context.colors.primary.withValues(alpha: dark ? 0.20 : 0.08);
      border = context.colors.primary.withValues(alpha: 0.25);
    } else {
      bg = context.colors.surface;
      border = context.colors.outlineVariant;
    }
    final muted = TextStyle(fontSize: 12, color: context.colors.onSurfaceVariant);
    final role = senderLabels[message.senderType] ?? message.senderType;

    return Align(
      alignment: own ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: Gap.sm),
        padding: const EdgeInsets.fromLTRB(Gap.md, 10, Gap.md, 8),
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.84),
        decoration: BoxDecoration(
          color: bg,
          border: Border.all(color: border),
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(AppTheme.radiusCard),
            topRight: const Radius.circular(AppTheme.radiusCard),
            bottomLeft: Radius.circular(own ? AppTheme.radiusCard : 4),
            bottomRight: Radius.circular(own ? 4 : AppTheme.radiusCard),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 6,
              runSpacing: 2,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(message.senderName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
                Text(isOpening ? '$role · Laporan awal' : role, style: muted),
                if (message.isInternal)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.lock_outline_rounded, size: 13, color: warning),
                      const SizedBox(width: 3),
                      Text('Catatan internal', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: warning)),
                    ],
                  ),
              ],
            ),
            if (!message.isPhotoOnly && message.message.trim().isNotEmpty) ...[
              const SizedBox(height: 4),
              SelectableText(message.message, style: const TextStyle(fontSize: 14, height: 1.45)),
            ],
            if (message.attachments.isNotEmpty) TicketAttachments(paths: message.attachments, showLabel: false),
            const SizedBox(height: 4),
            Align(
              alignment: Alignment.centerRight,
              child: Text(_timeFormat.format(message.createdAt), style: muted.copyWith(fontSize: 11)),
            ),
          ],
        ),
      ),
    );
  }
}
