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
import 'ticket_thread.dart';
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

  /// Pull to refresh: fetches again without replacing the screen with a spinner.
  Future<void> _reload() async {
    final provider = context.read<TicketProvider>();
    try {
      final results = await Future.wait([provider.fetchTicketDetail(widget.ticketId), provider.fetchMessages(widget.ticketId)]);
      if (!mounted) return;
      setState(() {
        _ticket = (results[0] as Ticket?) ?? _ticket;
        _messages = results[1] as List<TicketMessage>;
      });
    } catch (_) {
      _toast('Gagal memuat ulang. Periksa koneksi internet.');
    }
  }

  Future<void> _refreshMessages() async {
    if (!mounted || _loading || _sending) return;
    try {
      final provider = context.read<TicketProvider>();
      final latest = await provider.fetchMessages(widget.ticketId);
      // The status can change with a reply (for example to waiting for the customer).
      final ticket = await provider.fetchTicketDetail(widget.ticketId);
      if (!mounted) return;
      if (ticket != null && (ticket.status != _ticket?.status || ticket.estimatedRepair != _ticket?.estimatedRepair)) setState(() => _ticket = ticket);
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
    final ticket = _ticket;
    return Scaffold(
      appBar: AppBar(title: Text(ticket == null ? 'Detail Tiket' : 'Tiket #${ticket.ticketNumber}')),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null || ticket == null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(_error ?? 'Tiket tidak ditemukan.', textAlign: TextAlign.center),
                          const SizedBox(height: 12),
                          OutlinedButton(onPressed: _load, child: const Text('Coba lagi')),
                        ],
                      ),
                    ),
                  )
                : Column(
                    children: [
                      Expanded(
                        child: RefreshIndicator(
                          onRefresh: _reload,
                          child: ListView(
                            controller: _scrollController,
                            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                            children: [
                              _TicketHeader(ticket: ticket),
                              const SizedBox(height: 20),
                              Text(
                                'Percakapan',
                                style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: Theme.of(context).colorScheme.onSurfaceVariant),
                              ),
                              const SizedBox(height: 4),
                              ...buildTicketThread(context, ticket: ticket, messages: _messages),
                              if (_messages.isEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(top: 4),
                                  child: Text(
                                    'Belum ada balasan dari petugas. Anda akan diberi tahu saat ada balasan.',
                                    style: TextStyle(fontSize: 13, color: Theme.of(context).colorScheme.onSurfaceVariant),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                      if (ticket.canReply)
                        _Composer(
                          controller: _messageController,
                          sending: _sending,
                          pending: _pending,
                          onSend: _send,
                          onAttach: _attach,
                          onRemove: (item) => setState(() => _pending.remove(item)),
                        )
                      else
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(14),
                          color: Theme.of(context).colorScheme.surfaceContainerHighest,
                          child: Text(
                            'Tiket ini sudah ditutup. Buat tiket baru jika ada masalah lain.',
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 13, color: Theme.of(context).colorScheme.onSurfaceVariant),
                          ),
                        ),
                    ],
                  ),
      ),
    );
  }
}

/// What the customer can expect next, said in their terms.
String _statusHint(String status) {
  switch (status.toUpperCase()) {
    case 'OPEN':
      return 'Laporan Anda sudah diterima dan menunggu ditangani petugas.';
    case 'IN_PROGRESS':
      return 'Petugas sedang menangani laporan Anda.';
    case 'WAITING_CUSTOMER':
      return 'Petugas menunggu jawaban Anda. Balas di bawah agar penanganan bisa dilanjutkan.';
    case 'RESOLVED':
      return 'Petugas menandai masalah ini selesai. Balas jika masalah masih terjadi.';
    case 'CLOSED':
      return 'Tiket ini sudah ditutup.';
    default:
      return '';
  }
}

String _priorityLabel(String p) => const {'URGENT': 'Mendesak', 'HIGH': 'Tinggi', 'MEDIUM': 'Sedang', 'LOW': 'Rendah'}[p.toUpperCase()] ?? p;

class _TicketHeader extends StatelessWidget {
  const _TicketHeader({required this.ticket});
  final Ticket ticket;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final muted = TextStyle(fontSize: 13, color: scheme.onSurfaceVariant);
    final done = ['RESOLVED', 'CLOSED'].contains(ticket.status.toUpperCase());
    final rows = <(String, String)>[
      ('Ditangani', ticket.isAssigned ? (ticket.assignedToName ?? 'Petugas') : 'Belum ada petugas'),
      if (ticket.estimatedRepair != null && !done) ('Perkiraan perbaikan', ticket.estimatedRepair!),
      if (ticket.category != null) ('Kategori', ticket.category!.name),
      ('Prioritas', _priorityLabel(ticket.priority)),
      if (ticket.resolvedAt != null) ('Selesai', formatDateTime(ticket.resolvedAt!)),
      if (ticket.locationTag != null && ticket.locationTag!.isNotEmpty) ('Lokasi', ticket.locationTag!),
    ];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                TicketStatusPill(status: ticket.status),
                const Spacer(),
                Text('Dibuat ${formatDate(ticket.createdAt)}', style: muted.copyWith(fontSize: 12)),
              ],
            ),
            const SizedBox(height: 12),
            Text(ticket.subject, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, height: 1.3)),
            const SizedBox(height: 6),
            Text(_statusHint(ticket.status), style: muted),
            const SizedBox(height: 12),
            Divider(color: scheme.outlineVariant, height: 1),
            const SizedBox(height: 8),
            for (final (label, value) in rows)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(width: 132, child: Text(label, style: muted)),
                    Expanded(child: Text(value, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600))),
                  ],
                ),
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
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (pending.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text('Foto belum terkirim. Tekan Kirim.', style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
            ),
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
                style: IconButton.styleFrom(minimumSize: const Size(48, 48)),
                icon: const Icon(Icons.add_a_photo_outlined),
              ),
              Expanded(
                child: TextField(
                  controller: controller,
                  minLines: 1,
                  maxLines: 4,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(hintText: 'Tulis balasan untuk petugas'),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                tooltip: 'Kirim',
                onPressed: sending ? null : onSend,
                style: IconButton.styleFrom(minimumSize: const Size(48, 48)),
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
