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
import 'ticket_thread.dart';
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

  Future<void> _call() async {
    final n = t.customerPhone.replaceAll(RegExp(r'[^0-9+]'), '');
    if (n.isEmpty) return;
    await launchUrl(Uri.parse('tel:$n'));
  }

  Future<void> _openMap() async {
    await launchUrl(Uri.parse('https://maps.google.com/?q=${t.latitude},${t.longitude}'), mode: LaunchMode.externalApplication);
  }

  Future<void> _pickStatus() async {
    final next = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(Gap.page, 0, Gap.page, Gap.sm),
              child: Text('Ubah status tiket', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            ),
            for (final (value, label) in ticketStatusOptions)
              ListTile(
                title: Text(label),
                trailing: value == _status ? Icon(Icons.check_rounded, color: context.colors.primary) : null,
                selected: value == _status,
                onTap: () => Navigator.pop(sheetContext, value),
              ),
          ],
        ),
      ),
    );
    if (next != null) await _changeStatus(next);
  }

  @override
  Widget build(BuildContext context) {
    final muted = TextStyle(fontSize: 13, color: context.colors.onSurfaceVariant);
    return ChangeNotifierProvider.value(
      value: _messages,
      child: Scaffold(
        appBar: AppBar(
          title: Text('Tiket #${t.ticketNumber}'),
          actions: [
            const GuideAction(),
            PopupMenuButton<String>(
              tooltip: 'Lainnya',
              onSelected: (value) async {
                final changed = value == 'edit' ? await editTicket(context, t.raw) : await deleteTicket(context, t.raw);
                if (changed && context.mounted) {
                  context.read<TicketProvider>().load();
                  Navigator.pop(context);
                }
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'edit', child: ListTile(leading: Icon(Icons.edit_outlined), title: Text('Edit tiket'), contentPadding: EdgeInsets.zero)),
                PopupMenuItem(value: 'delete', child: ListTile(leading: Icon(Icons.delete_outline_rounded), title: Text('Hapus tiket'), contentPadding: EdgeInsets.zero)),
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
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(Gap.lg),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Wrap(
                                spacing: 6,
                                runSpacing: 6,
                                children: [
                                  StatusPill.status(_status),
                                  StatusPill(label: 'Prioritas ${priorityLabel(t.priority).toLowerCase()}', tone: priorityTone(t.priority)),
                                ],
                              ),
                              const SizedBox(height: Gap.md),
                              Text(t.subject, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, height: 1.3)),
                              const SizedBox(height: 4),
                              Text('Dibuka ${formatDateTime(t.createdAt)}${t.categoryName != null ? ' · ${t.categoryName}' : ''}', style: muted),
                              const SizedBox(height: Gap.md),
                              SizedBox(
                                width: double.infinity,
                                child: OutlinedButton.icon(
                                  onPressed: _pickStatus,
                                  icon: const Icon(Icons.swap_horiz_rounded),
                                  label: const Text('Ubah status'),
                                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(44)),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      DetailSection(
                        title: 'Pelanggan',
                        rows: [
                          InfoRow('Nama', t.customerName),
                          InfoRow('Username', t.raw['customer'] is Map ? (t.raw['customer'] as Map)['username']?.toString() : null, copyable: true),
                          InfoRow('Telepon', t.customerPhone, copyable: true),
                        ],
                        trailing: t.customerPhone.isEmpty
                            ? null
                            : Padding(
                                padding: const EdgeInsets.all(Gap.md),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: OutlinedButton.icon(onPressed: _call, icon: const Icon(Icons.call_outlined), label: const Text('Telepon')),
                                    ),
                                    const SizedBox(width: Gap.sm),
                                    Expanded(
                                      child: OutlinedButton.icon(onPressed: _whatsapp, icon: const Icon(Icons.chat_outlined), label: const Text('WhatsApp')),
                                    ),
                                  ],
                                ),
                              ),
                      ),
                      DetailSection(
                        title: 'Penanganan',
                        rows: [
                          InfoRow('Ditangani', t.isAssigned ? (t.assignedToName ?? 'Petugas') : 'Belum ada'),
                          InfoRow('Estimasi', t.estimatedRepair),
                          InfoRow('Selesai', t.resolvedAt == null ? null : formatDateTime(t.resolvedAt!)),
                          InfoRow('Lokasi', t.locationTag),
                        ],
                        trailing: t.hasCoordinates
                            ? ListTile(
                                leading: const Icon(Icons.map_outlined),
                                title: const Text('Buka di Google Maps'),
                                trailing: const Icon(Icons.open_in_new_rounded, size: 18),
                                onTap: _openMap,
                              )
                            : null,
                      ),
                      const SizedBox(height: Gap.lg),
                      Padding(
                        padding: const EdgeInsets.only(left: 2, bottom: Gap.xs),
                        child: Text(
                          'Percakapan',
                          style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: context.colors.onSurfaceVariant),
                        ),
                      ),
                      if (m.loading && m.messages.isEmpty)
                        const Padding(
                          padding: EdgeInsets.all(Gap.xl),
                          child: Center(child: CircularProgressIndicator()),
                        )
                      else ...[
                        ...buildTicketThread(context, ticket: t, messages: m.messages, viewer: 'ADMIN'),
                        if (m.error != null) Text(m.error!, style: TextStyle(color: context.tone(Tone.danger))),
                        if (m.messages.isEmpty && m.error == null)
                          Padding(
                            padding: const EdgeInsets.only(top: Gap.sm),
                            child: Text('Belum ada balasan. Balasan Anda dikirim ke pelanggan lewat WhatsApp.', style: muted),
                          ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
            if (_status != 'CLOSED')
              _Composer(
                controller: _replyController,
                internal: _internal,
                onInternalChanged: (v) => setState(() => _internal = v),
                onSend: _send,
                pending: _pending,
                onAttach: _attach,
                onRemovePending: (item) => setState(() => _pending.remove(item)),
              )
            else
              SafeArea(
                top: false,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(Gap.md),
                  color: context.colors.surfaceContainerHighest,
                  child: Text('Tiket ditutup. Ubah status untuk membalas lagi.', textAlign: TextAlign.center, style: muted),
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
    final warning = context.tone(Tone.warning);
    return Container(
      decoration: BoxDecoration(
        color: context.colors.surface,
        border: Border(top: BorderSide(color: internal ? warning : context.colors.outlineVariant, width: internal ? 2 : 1)),
      ),
      padding: const EdgeInsets.fromLTRB(Gap.md, Gap.sm, Gap.md, Gap.sm),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: false, label: Text('Ke pelanggan'), icon: Icon(Icons.reply_rounded)),
                ButtonSegment(value: true, label: Text('Catatan internal'), icon: Icon(Icons.lock_outline_rounded)),
              ],
              selected: {internal},
              showSelectedIcon: false,
              onSelectionChanged: sending ? null : (v) => onInternalChanged(v.first),
              style: const ButtonStyle(visualDensity: VisualDensity.compact, tapTargetSize: MaterialTapTargetSize.padded),
            ),
            if (internal)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text('Hanya admin dan teknisi yang melihat catatan ini.', style: TextStyle(fontSize: 12, color: warning)),
              ),
            const SizedBox(height: Gap.sm),
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
                  icon: const Icon(Icons.add_a_photo_outlined),
                ),
                Expanded(
                  child: TextField(
                    controller: controller,
                    minLines: 1,
                    maxLines: 5,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: InputDecoration(hintText: internal ? 'Tulis catatan untuk tim' : 'Tulis balasan ke pelanggan'),
                  ),
                ),
                const SizedBox(width: Gap.sm),
                IconButton.filled(
                  tooltip: internal ? 'Simpan catatan' : 'Kirim',
                  onPressed: sending ? null : onSend,
                  style: IconButton.styleFrom(
                    minimumSize: const Size(48, 48),
                    backgroundColor: internal ? warning : null,
                    foregroundColor: internal ? Colors.white : null,
                  ),
                  icon: sending ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send_rounded),
                ),
              ],
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
