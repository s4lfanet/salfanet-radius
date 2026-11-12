import 'dart:async';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../models/ticket.dart';
import '../auth/auth_provider.dart';
import 'ticket_list_screen.dart' show ticketStatusOptions, priorityTone, priorityLabel;
import 'ticket_attachments.dart';
import 'ticket_provider.dart';
import 'ticket_tools.dart';
import '../../core/guides/guides.dart';

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
  final List<_PendingFile> _pending = [];
  Timer? _refresh;
  late String _status = widget.ticket.status;

  Ticket get t => widget.ticket;

  @override
  void initState() {
    super.initState();
    // Replies, photos and notes from the customer or a technician show up without pulling to refresh.
    _refresh = Timer.periodic(const Duration(seconds: 20), (_) {
      if (mounted && !_messages.sending) _messages.load();
    });
  }

  @override
  void dispose() {
    _refresh?.cancel();
    _messages.dispose();
    _replyController.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _toast(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  Future<void> _attach() async {
    if (_pending.length >= 5) {
      _toast('Paling banyak 5 lampiran per balasan.');
      return;
    }
    final source = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Ambil foto'),
              onTap: () => Navigator.pop(sheetContext, 'camera'),
            ),
            ListTile(
              leading: const Icon(Icons.folder_outlined),
              title: const Text('Pilih dari penyimpanan'),
              subtitle: const Text('Foto atau PDF, maksimal 10 MB'),
              onTap: () => Navigator.pop(sheetContext, 'file'),
            ),
          ],
        ),
      ),
    );
    if (source == null || !mounted) return;

    String? path;
    String? name;
    if (source == 'camera') {
      final shot = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 80);
      path = shot?.path;
      name = shot?.name;
    } else {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
      );
      final file = result?.files.single;
      path = file?.path;
      name = file?.name;
    }
    if (path == null || name == null || !mounted) return;

    if (await File(path).length() > 10 * 1024 * 1024) {
      _toast('Ukuran file melebihi 10 MB.');
      return;
    }

    // Uploaded as soon as it is picked, so sending the reply is one short request.
    final item = _PendingFile(path, name);
    setState(() => _pending.add(item));
    try {
      final url = await _messages.uploadAttachment(path, name);
      if (!mounted) return;
      setState(() {
        item.url = url;
        item.uploading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        item.uploading = false;
        item.error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        item.uploading = false;
        item.error = 'Gagal mengunggah.';
      });
    }
  }

  Future<void> _send() async {
    final text = _replyController.text.trim();
    if (text.isEmpty && _pending.isEmpty) return;
    if (_pending.any((p) => p.uploading)) {
      _toast('Tunggu foto selesai diunggah.');
      return;
    }
    if (_pending.any((p) => p.error != null)) {
      _toast('Ada foto yang gagal diunggah. Hapus foto itu lalu coba lagi.');
      return;
    }
    final urls = [for (final p in _pending) p.url!];
    final name = context.read<AuthProvider>().user?.name ?? 'Admin';
    final ok = await runAction(context, () => _messages.reply(senderName: name, message: text, isInternal: _internal, attachments: urls));
    if (ok) {
      _replyController.clear();
      setState(_pending.clear);
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
            const GuideAction(),
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
                      TicketAttachments(paths: t.attachments),
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
            _Composer(
              controller: _replyController,
              internal: _internal,
              onInternalChanged: (v) => setState(() => _internal = v),
              onSend: _send,
              pending: _pending,
              onAttach: _attach,
              onRemovePending: (item) => setState(() => _pending.remove(item)),
            ),
          ],
        ),
      ),
    );
  }
}

/// A photo chosen for the reply. It uploads as soon as it is picked, so sending is one request.
class _PendingFile {
  _PendingFile(this.path, this.name);
  final String path;
  final String name;
  String? url;
  String? error;
  bool uploading = true;

  bool get isPdf => name.toLowerCase().endsWith('.pdf');
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.internal,
    required this.onInternalChanged,
    required this.onSend,
    required this.pending,
    required this.onAttach,
    required this.onRemovePending,
  });
  final TextEditingController controller;
  final bool internal;
  final ValueChanged<bool> onInternalChanged;
  final VoidCallback onSend;
  final List<_PendingFile> pending;
  final VoidCallback onAttach;
  final ValueChanged<_PendingFile> onRemovePending;

  @override
  Widget build(BuildContext context) {
    final sending = context.watch<TicketMessagesProvider>().sending;
    return Container(
      decoration: BoxDecoration(
        color: context.colors.surface,
        border: Border(top: BorderSide(color: context.colors.outlineVariant)),
      ),
      padding: const EdgeInsets.fromLTRB(Gap.md, Gap.sm, Gap.md, Gap.sm),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (pending.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: Gap.sm),
                child: SizedBox(
                  height: 72,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: pending.length,
                    separatorBuilder: (_, __) => const SizedBox(width: Gap.sm),
                    itemBuilder: (_, index) => _PendingTile(item: pending[index], onRemove: () => onRemovePending(pending[index])),
                  ),
                ),
              ),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                IconButton(
                  tooltip: 'Tambah foto',
                  onPressed: sending ? null : onAttach,
                  style: IconButton.styleFrom(minimumSize: const Size(48, 48)),
                  icon: const Icon(Icons.attach_file_rounded),
                ),
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
                  tooltip: 'Kirim',
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

class _PendingTile extends StatelessWidget {
  const _PendingTile({required this.item, required this.onRemove});
  final _PendingFile item;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final failed = item.error != null;
    return Tooltip(
      message: failed ? item.error! : item.name,
      child: SizedBox(
        width: 72,
        height: 72,
        child: Stack(
          children: [
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: context.colors.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: failed ? context.tone(Tone.danger) : context.colors.outlineVariant, width: failed ? 2 : 1),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(9),
                  child: item.isPdf
                      ? Icon(Icons.picture_as_pdf_rounded, color: context.colors.error)
                      : Image.file(
                          File(item.path),
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Icon(Icons.broken_image_outlined, color: context.colors.onSurfaceVariant),
                        ),
                ),
              ),
            ),
            if (item.uploading)
              const Positioned.fill(
                child: Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2))),
              ),
            Positioned(
              top: 0,
              right: 0,
              child: SizedBox(
                width: 44,
                height: 44,
                child: IconButton(
                  tooltip: 'Hapus lampiran',
                  onPressed: onRemove,
                  padding: EdgeInsets.zero,
                  alignment: Alignment.topRight,
                  icon: CircleAvatar(
                    radius: 10,
                    backgroundColor: context.colors.inverseSurface,
                    child: Icon(Icons.close_rounded, size: 13, color: context.colors.onInverseSurface),
                  ),
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
          border: fromCustomer ? Border.all(color: context.colors.outlineVariant) : null,
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
            if (message.attachments.isNotEmpty) TicketAttachments(paths: message.attachments, showLabel: false),
            if (!message.isPhotoOnly) Text(message.message, style: const TextStyle(fontSize: 14, height: 1.4)),
            const SizedBox(height: 4),
            Text(formatDateTime(message.createdAt), style: TextStyle(fontSize: 11, color: context.colors.onSurfaceVariant)),
          ],
        ),
      ),
    );
  }
}
