import 'dart:async';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../models/ticket.dart';
import '../auth/auth_provider.dart';
import 'ticket_attachments.dart';
import 'ticket_provider.dart';
import 'tickets_screen.dart';

const _maxFiles = 5;
const _maxFileBytes = 10 * 1024 * 1024;

class TicketDetailScreen extends StatefulWidget {
  const TicketDetailScreen({super.key, required this.ticketId});
  final String ticketId;

  @override
  State<TicketDetailScreen> createState() => _TicketDetailScreenState();
}

class _TicketDetailScreenState extends State<TicketDetailScreen> {
  Ticket? _ticket;
  List<TicketMessage> _messages = [];
  bool _loading = true;
  String? _error;
  bool _sending = false;
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();
  final List<_PendingFile> _pending = [];
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _load();
    // Replies and photos from staff show up without leaving and reopening the ticket.
    _refreshTimer = Timer.periodic(const Duration(seconds: 20), (_) => _refreshMessages());
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final provider = context.read<TicketProvider>();
      final results = await Future.wait([
        provider.fetchTicketDetail(widget.ticketId),
        provider.fetchMessages(widget.ticketId),
      ]);
      setState(() {
        _ticket = results[0] as Ticket?;
        _messages = results[1] as List<TicketMessage>;
      });
    } catch (_) {
      setState(() => _error = 'Gagal memuat detail tiket.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _refreshMessages() async {
    if (!mounted || _loading || _sending) return;
    try {
      final latest = await context.read<TicketProvider>().fetchMessages(widget.ticketId);
      if (!mounted) return;
      final changed = latest.length != _messages.length || (latest.isNotEmpty && latest.last.id != _messages.last.id);
      if (changed) {
        setState(() => _messages = latest);
        _scrollToEnd();
      }
    } catch (_) {
      // The next tick tries again. The screen keeps what it already shows.
    }
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _toast(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  Future<void> _attach() async {
    final provider = context.read<TicketProvider>();
    if (_pending.length >= _maxFiles) {
      _toast('Paling banyak $_maxFiles lampiran per balasan.');
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

    if (await File(path).length() > _maxFileBytes) {
      _toast('Ukuran file melebihi 10 MB.');
      return;
    }

    // Uploaded as soon as it is picked, so sending the reply is one short request.
    final item = _PendingFile(path, name);
    setState(() => _pending.add(item));
    try {
      final url = await provider.uploadAttachment(File(path));
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
    final text = _messageController.text.trim();
    final urls = [for (final p in _pending) if (p.url != null) p.url!];
    if (text.isEmpty && urls.isEmpty && _pending.isEmpty) return;
    if (_pending.any((p) => p.uploading)) {
      _toast('Tunggu foto selesai diunggah.');
      return;
    }
    if (_pending.any((p) => p.error != null)) {
      _toast('Ada foto yang gagal diunggah. Hapus foto itu lalu coba lagi.');
      return;
    }
    final customer = context.read<AuthProvider>().customer;
    if (customer == null) return;

    setState(() => _sending = true);
    try {
      final message = await context.read<TicketProvider>().sendMessage(
            ticketId: widget.ticketId,
            message: text,
            sender: customer,
            attachments: urls,
          );
      setState(() {
        _messages = [..._messages, message];
        _messageController.clear();
        _pending.clear();
      });
      _scrollToEnd();
    } on ApiException catch (e) {
      _toast(e.message);
    } catch (_) {
      _toast('Gagal mengirim pesan');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_ticket?.ticketNumber ?? 'Detail Tiket')),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(child: Text(_error!))
                : Column(
                    children: [
                      if (_ticket != null) _TicketHeader(ticket: _ticket!),
                      Expanded(
                        child: ListView.builder(
                          controller: _scrollController,
                          padding: const EdgeInsets.all(16),
                          itemCount: _messages.length,
                          itemBuilder: (context, index) => _MessageBubble(message: _messages[index]),
                        ),
                      ),
                      if (_ticket?.isOpen ?? true)
                        _Composer(
                          controller: _messageController,
                          sending: _sending,
                          pending: _pending,
                          onSend: _send,
                          onAttach: _attach,
                          onRemove: (item) => setState(() => _pending.remove(item)),
                        ),
                    ],
                  ),
      ),
    );
  }
}

class _TicketHeader extends StatelessWidget {
  const _TicketHeader({required this.ticket});
  final Ticket ticket;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: scheme.surfaceContainer, border: Border(bottom: BorderSide(color: scheme.outlineVariant))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: Text(ticket.subject, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16))),
              const SizedBox(width: 10),
              TicketStatusPill(status: ticket.status),
            ],
          ),
          const SizedBox(height: 4),
          Text(ticket.description, style: TextStyle(color: scheme.onSurfaceVariant)),
          TicketAttachments(paths: ticket.attachments),
          const SizedBox(height: 6),
          Text('Dibuat ${formatDateTime(ticket.createdAt)}', style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12)),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message});
  final TicketMessage message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isMine = message.isFromCustomer;

    return Align(
      alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
        decoration: BoxDecoration(
          color: isMine ? scheme.primary : scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!isMine)
              Text(message.senderName, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: scheme.onSurfaceVariant)),
            if (message.attachments.isNotEmpty) TicketAttachments(paths: message.attachments, showLabel: false),
            if (!message.isPhotoOnly) Text(message.message, style: TextStyle(color: isMine ? scheme.onPrimary : scheme.onSurface)),
            const SizedBox(height: 4),
            Text(
              formatDateTime(message.createdAt),
              style: TextStyle(fontSize: 10, color: (isMine ? scheme.onPrimary : scheme.onSurfaceVariant).withValues(alpha: 0.7)),
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
    required this.sending,
    required this.pending,
    required this.onSend,
    required this.onAttach,
    required this.onRemove,
  });
  final TextEditingController controller;
  final bool sending;
  final List<_PendingFile> pending;
  final VoidCallback onSend;
  final VoidCallback onAttach;
  final ValueChanged<_PendingFile> onRemove;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      decoration: BoxDecoration(color: scheme.surface, border: Border(top: BorderSide(color: scheme.outlineVariant))),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (pending.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: SizedBox(
                height: 72,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: pending.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (_, index) => _PendingTile(item: pending[index], onRemove: () => onRemove(pending[index])),
                ),
              ),
            ),
          Row(
            children: [
              IconButton(
                tooltip: 'Tambah foto',
                onPressed: sending ? null : onAttach,
                icon: const Icon(Icons.attach_file_rounded),
              ),
              Expanded(
                child: TextField(
                  controller: controller,
                  minLines: 1,
                  maxLines: 4,
                  decoration: const InputDecoration(hintText: 'Tulis pesan...'),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                tooltip: 'Kirim',
                onPressed: sending ? null : onSend,
                icon: sending
                    ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.send),
              ),
            ],
          ),
        ],
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
    final scheme = Theme.of(context).colorScheme;
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
                  color: scheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: failed ? scheme.error : scheme.outlineVariant, width: failed ? 2 : 1),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(9),
                  child: item.isPdf
                      ? Icon(Icons.picture_as_pdf_rounded, color: scheme.error)
                      : Image.file(
                          File(item.path),
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Icon(Icons.broken_image_outlined, color: scheme.onSurfaceVariant),
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
                    backgroundColor: scheme.inverseSurface,
                    child: Icon(Icons.close_rounded, size: 13, color: scheme.onInverseSurface),
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
