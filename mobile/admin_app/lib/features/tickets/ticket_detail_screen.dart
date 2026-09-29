import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../models/ticket.dart';
import '../auth/auth_provider.dart';
import 'ticket_list_screen.dart' show ticketStatusOptions, priorityTone, priorityLabel;
import 'ticket_provider.dart';
import 'ticket_tools.dart';

class TicketDetailScreen extends StatefulWidget {
  const TicketDetailScreen({super.key, required this.ticket});
  final Ticket ticket;

  @override
  State<TicketDetailScreen> createState() => _TicketDetailScreenState();
}

class _TicketDetailScreenState extends State<TicketDetailScreen> {
  late final TicketMessagesProvider _messages = TicketMessagesProvider(widget.ticket.id)..load();
  final _replyController = TextEditingController();
  final _scroll = ScrollController();
  bool _internal = false;
  late String _status = widget.ticket.status;

  Ticket get t => widget.ticket;

  @override
  void dispose() {
    _messages.dispose();
    _replyController.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _replyController.text.trim();
    if (text.isEmpty) return;
    final name = context.read<AuthProvider>().user?.name ?? 'Admin';
    final ok = await runAction(context, () => _messages.reply(senderName: name, message: text, isInternal: _internal));
    if (ok) {
      _replyController.clear();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
      });
    }
  }

  Future<void> _changeStatus(String next) async {
    if (next == _status) return;
    final provider = context.read<TicketProvider>();
    final ok = await runAction(context, () => provider.updateTicketStatus(t.id, next), success: 'Status tiket: ${statusLabel(next)}');
    if (ok && mounted) setState(() => _status = next);
  }

  Future<void> _whatsapp() async {
    var n = t.customerPhone.replaceAll(RegExp(r'[^0-9]'), '');
    if (n.isEmpty) return;
    if (n.startsWith('0')) n = '62${n.substring(1)}';
    await launchUrl(Uri.parse('https://wa.me/$n'), mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider.value(
      value: _messages,
      child: Scaffold(
        appBar: AppBar(
          title: Text('Tiket #${t.ticketNumber}'),
          actions: [
            IconButton(
              tooltip: 'Edit',
              icon: const Icon(Icons.edit_rounded),
              onPressed: () async {
                if (await editTicket(context, t.raw) && context.mounted) {
                  context.read<TicketProvider>().load();
                  Navigator.pop(context);
                }
              },
            ),
            IconButton(
              tooltip: 'Hapus',
              icon: const Icon(Icons.delete_outline_rounded),
              onPressed: () async {
                if (await deleteTicket(context, t.raw) && context.mounted) {
                  context.read<TicketProvider>().load();
                  Navigator.pop(context);
                }
              },
            ),
            PopupMenuButton<String>(
              tooltip: 'Ubah status',
              icon: const Icon(Icons.swap_horiz_rounded),
              onSelected: _changeStatus,
              itemBuilder: (_) => [
                for (final (value, label) in ticketStatusOptions) CheckedPopupMenuItem(value: value, checked: value == _status, child: Text(label)),
              ],
            ),
          ],
        ),
        body: Column(
          children: [
            Expanded(
              child: Consumer<TicketMessagesProvider>(
                builder: (context, m, _) => RefreshIndicator(
                  onRefresh: m.load,
                  child: ListView(
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, Gap.lg),
                    children: [
                      DetailHeader(
                        icon: Icons.support_agent_rounded,
                        tone: priorityTone(t.priority),
                        title: t.subject,
                        subtitle: 'Dibuka ${formatDateTime(t.createdAt)}',
                        status: Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            StatusPill.status(_status),
                            const SizedBox(height: 6),
                            StatusPill(label: priorityLabel(t.priority), tone: priorityTone(t.priority)),
                          ],
                        ),
                      ),
                      DetailSection(
                        title: 'Keluhan',
                        rows: [InfoRow('Deskripsi', t.description), InfoRow('Kategori', t.categoryName), InfoRow('Estimasi', t.estimatedRepair)],
                      ),
                      DetailSection(
                        title: 'Pelanggan',
                        rows: [
                          InfoRow('Nama', t.customerName),
                          InfoRow('Telepon', t.customerPhone, copyable: true, onTap: _whatsapp),
                        ],
                      ),
                      const SizedBox(height: Gap.lg),
                      SectionHeader('Percakapan'),
                      if (m.loading && m.messages.isEmpty)
                        const Padding(
                          padding: EdgeInsets.all(Gap.xl),
                          child: Center(child: CircularProgressIndicator()),
                        )
                      else if (m.error != null && m.messages.isEmpty)
                        Text(m.error!, style: TextStyle(color: context.tone(Tone.danger)))
                      else if (m.messages.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: Gap.lg),
                          child: Text(
                            'Belum ada balasan. Balasan Anda dikirim ke pelanggan lewat WhatsApp.',
                            style: TextStyle(color: context.colors.onSurfaceVariant, fontSize: 13),
                          ),
                        )
                      else
                        ...m.messages.map((msg) => _Bubble(message: msg)),
                    ],
                  ),
                ),
              ),
            ),
            _Composer(controller: _replyController, internal: _internal, onInternalChanged: (v) => setState(() => _internal = v), onSend: _send),
          ],
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({required this.controller, required this.internal, required this.onInternalChanged, required this.onSend});
  final TextEditingController controller;
  final bool internal;
  final ValueChanged<bool> onInternalChanged;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    final sending = context.watch<TicketMessagesProvider>().sending;
    return Container(
      decoration: BoxDecoration(
        color: context.colors.surface,
        border: Border(top: BorderSide(color: context.colors.outline)),
      ),
      padding: const EdgeInsets.fromLTRB(Gap.md, Gap.sm, Gap.md, Gap.sm),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: TextField(
                    controller: controller,
                    minLines: 1,
                    maxLines: 4,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: InputDecoration(hintText: internal ? 'Catatan internal (tidak dikirim ke pelanggan)' : 'Tulis balasan ke pelanggan'),
                  ),
                ),
                const SizedBox(width: Gap.sm),
                IconButton.filled(
                  onPressed: sending ? null : onSend,
                  style: IconButton.styleFrom(minimumSize: const Size(48, 48)),
                  icon: sending ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send_rounded),
                ),
              ],
            ),
            InkWell(
              onTap: () => onInternalChanged(!internal),
              child: Padding(
                padding: const EdgeInsets.only(top: Gap.xs),
                child: Row(
                  children: [
                    SizedBox(
                      height: 32,
                      width: 32,
                      child: Checkbox(value: internal, onChanged: (v) => onInternalChanged(v ?? false)),
                    ),
                    Text('Catatan internal staf', style: TextStyle(fontSize: 12.5, color: context.colors.onSurfaceVariant)),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message});
  final TicketMessage message;

  @override
  Widget build(BuildContext context) {
    final fromCustomer = message.senderType == 'CUSTOMER';
    final dark = Theme.of(context).brightness == Brightness.dark;
    final Color bg;
    if (message.isInternal) {
      bg = context.tone(Tone.warning).withValues(alpha: dark ? 0.16 : 0.10);
    } else if (fromCustomer) {
      bg = context.colors.surface;
    } else {
      bg = context.colors.primary.withValues(alpha: dark ? 0.20 : 0.09);
    }
    return Align(
      alignment: fromCustomer ? Alignment.centerLeft : Alignment.centerRight,
      child: Container(
        margin: const EdgeInsets.only(bottom: Gap.sm),
        padding: const EdgeInsets.fromLTRB(Gap.md, 10, Gap.md, 10),
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.8),
        decoration: BoxDecoration(
          color: bg,
          border: fromCustomer ? Border.all(color: context.colors.outline) : null,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(AppTheme.radiusCard),
            topRight: const Radius.circular(AppTheme.radiusCard),
            bottomLeft: Radius.circular(fromCustomer ? 4 : AppTheme.radiusCard),
            bottomRight: Radius.circular(fromCustomer ? AppTheme.radiusCard : 4),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                  child: Text(message.senderName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
                ),
                if (message.isInternal) ...[
                  const SizedBox(width: 6),
                  Text(
                    'Internal',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: context.tone(Tone.warning)),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 3),
            Text(message.message, style: const TextStyle(fontSize: 14, height: 1.4)),
            const SizedBox(height: 4),
            Text(formatDateTime(message.createdAt), style: TextStyle(fontSize: 11, color: context.colors.onSurfaceVariant)),
          ],
        ),
      ),
    );
  }
}
