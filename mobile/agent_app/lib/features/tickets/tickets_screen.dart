import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';
import 'create_ticket_screen.dart';
import 'ticket_attachments.dart';

String _ticketLabel(String s) {
  switch (s.toUpperCase()) {
    case 'OPEN':
      return 'Baru';
    case 'IN_PROGRESS':
      return 'Diproses';
    case 'WAITING_CUSTOMER':
      return 'Menunggu Anda';
    case 'RESOLVED':
      return 'Selesai';
    case 'CLOSED':
      return 'Ditutup';
    default:
      return s;
  }
}

Tone _ticketTone(String s) {
  switch (s.toUpperCase()) {
    case 'OPEN':
      return Tone.warning;
    case 'IN_PROGRESS':
      return Tone.primary;
    case 'WAITING_CUSTOMER':
      return Tone.accent;
    case 'RESOLVED':
      return Tone.success;
    default:
      return Tone.neutral;
  }
}

String? _priorityLabel(String? p) {
  switch ((p ?? '').toUpperCase()) {
    case 'LOW':
      return 'Rendah';
    case 'MEDIUM':
      return 'Sedang';
    case 'HIGH':
      return 'Tinggi';
    case 'URGENT':
      return 'Mendesak';
  }
  return null;
}

/// Tiket bantuan agen ke admin — buat tiket baru dan balas percakapan.
class TicketsScreen extends StatefulWidget {
  const TicketsScreen({super.key});

  @override
  State<TicketsScreen> createState() => _TicketsScreenState();
}

class _TicketsScreenState extends State<TicketsScreen> {
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  String? _error;
  String _filter = 'ALL';
  static const _filters = <(String, String)>[('ALL', 'Semua'), ('OPEN', 'Baru'), ('IN_PROGRESS', 'Diproses'), ('WAITING_CUSTOMER', 'Menunggu Anda'), ('RESOLVED', 'Selesai'), ('CLOSED', 'Ditutup')];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _items.isEmpty;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/agent/tickets');
      if (!mounted) return;
      final list = (res is Map ? res['tickets'] : null) as List?;
      setState(() => _items = list?.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() ?? []);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _create() async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const CreateTicketScreen()));
    if (ok == true) _load();
  }

  Future<void> _open(Map<String, dynamic> t) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => TicketDetailScreen(ticketId: str(t, 'id') ?? '', subject: str(t, 'subject') ?? 'Tiket')));
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tiket Bantuan')),
      floatingActionButton: FloatingActionButton.extended(onPressed: _create, icon: const Icon(Icons.add_rounded), label: const Text('Tiket Baru')),
      body: Column(children: [
       FilterChipRow(options: _filters, selected: _filter, onSelected: (v) => setState(() => _filter = v)),
       Expanded(child: DataStateView(
        loading: _loading,
        error: _error,
        isEmpty: _shown.isEmpty,
        emptyIcon: Icons.support_agent_outlined,
        emptyMessage: 'Belum ada tiket',
        emptyHint: 'Ada kendala? Tekan Tiket Baru untuk menghubungi admin.',
        onRetry: _load,
        child: RefreshableList(
          hasFab: true,
          itemCount: _shown.length,
          onRefresh: _load,
          itemBuilder: (context, i) {
            final t = _shown[i];
            final status = str(t, 'status') ?? '-';
            return EntityTile(
              icon: Icons.support_agent_rounded,
              tone: _ticketTone(status),
              title: str(t, 'subject') ?? '-',
              subtitle: [str(t, 'ticketNumber'), str(mapOf(t, 'category'), 'name'), _priorityLabel(str(t, 'priority'))].whereType<String>().join(' · '),
              meta: formatDateTimeOrNull(dateOf(t, 'createdAt')?.toLocal()),
              trailing: StatusPill(label: _ticketLabel(status), tone: _ticketTone(status)),
              onTap: () => _open(t),
            );
          },
        ),
      )),
      ]),
    );
  }

  List<Map<String, dynamic>> get _shown => _filter == 'ALL' ? _items : _items.where((t) => (str(t, 'status') ?? '').toUpperCase() == _filter).toList();
}

class TicketDetailScreen extends StatefulWidget {
  const TicketDetailScreen({super.key, required this.ticketId, required this.subject});
  final String ticketId;
  final String subject;

  @override
  State<TicketDetailScreen> createState() => _TicketDetailScreenState();
}

class _TicketDetailScreenState extends State<TicketDetailScreen> {
  Map<String, dynamic>? _ticket;
  final _reply = TextEditingController();
  bool _loading = true;
  bool _sending = false;
  final List<String> _replyFiles = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _reply.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _ticket == null;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get('/api/agent/tickets/${widget.ticketId}');
      final t = res is Map ? res['ticket'] : null;
      if (mounted) setState(() => _ticket = t is Map ? Map<String, dynamic>.from(t) : null);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _send() async {
    final text = _reply.text.trim();
    if (text.isEmpty && _replyFiles.isEmpty) return;
    setState(() => _sending = true);
    final ok = await runAction(context, () => ApiClient.instance.post('/api/agent/tickets/${widget.ticketId}', data: {'message': text, 'attachments': _replyFiles}));
    if (ok) {
      _reply.clear();
      _replyFiles.clear();
    }
    if (mounted) setState(() => _sending = false);
    if (ok) _load();
  }

  Future<void> _attach() async {
    try {
      final x = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 80);
      if (x == null) return;
      setState(() => _sending = true);
      final url = await uploadTicketFile(File(x.path));
      if (mounted) setState(() => _replyFiles.add(url));
    } on ApiException catch (e) {
      if (mounted) showToast(context, e.message);
    } catch (_) {
      if (mounted) showToast(context, 'Gagal mengunggah foto.');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final messages = (_ticket?['messages'] as List?)?.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() ?? const [];
    final status = str(_ticket, 'status') ?? '';
    final closed = status.toUpperCase() == 'CLOSED';
    return Scaffold(
      appBar: AppBar(title: Text(widget.subject, overflow: TextOverflow.ellipsis)),
      body: Column(
        children: [
          Expanded(
            child: DataStateView(
              loading: _loading,
              error: _error,
              isEmpty: _ticket == null,
              emptyIcon: Icons.support_agent_outlined,
              emptyMessage: 'Tiket tidak ditemukan',
              onRetry: _load,
              child: ListView(
                padding: const EdgeInsets.all(Gap.page),
                children: [
                  Row(
                    children: [
                      StatusPill(label: _ticketLabel(status), tone: _ticketTone(status)),
                      const SizedBox(width: Gap.sm),
                      Expanded(child: Text(str(_ticket, 'ticketNumber') ?? '', style: TextStyle(fontSize: 12.5, color: context.colors.onSurfaceVariant))),
                    ],
                  ),
                  const SizedBox(height: Gap.md),
                  if (str(_ticket, 'description') != null)
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(Gap.md),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(str(_ticket, 'description')!),
                          if (str(_ticket, 'locationTag') != null || _ticket?['latitude'] != null) ...[
                            const SizedBox(height: Gap.sm),
                            Row(children: [
                              Icon(Icons.location_on_outlined, size: 16, color: context.colors.onSurfaceVariant),
                              const SizedBox(width: 4),
                              Expanded(child: Text(str(_ticket, 'locationTag') ?? '${_ticket?['latitude']}, ${_ticket?['longitude']}', style: TextStyle(fontSize: 12.5, color: context.colors.onSurfaceVariant))),
                            ]),
                          ],
                          TicketAttachments(paths: parseAttachments(_ticket?['attachments'])),
                        ]),
                      ),
                    ),
                  const SizedBox(height: Gap.sm),
                  for (final m in messages)
                    Align(
                      alignment: (str(m, 'senderType') ?? '').toUpperCase() == 'CUSTOMER' ? Alignment.centerRight : Alignment.centerLeft,
                      child: Container(
                        margin: const EdgeInsets.symmetric(vertical: 4),
                        padding: const EdgeInsets.all(Gap.md),
                        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.8),
                        decoration: BoxDecoration(
                          color: (str(m, 'senderType') ?? '').toUpperCase() == 'CUSTOMER' ? context.colors.primaryContainer : context.colors.surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(AppTheme.radiusControl),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if ((str(m, 'message') ?? '') != '(lampiran)') Text(str(m, 'message') ?? ''),
                            TicketAttachments(paths: parseAttachments(m['attachments'])),
                            const SizedBox(height: 4),
                            Text(
                              [(str(m, 'senderType') ?? '').toUpperCase() == 'CUSTOMER' ? 'Anda' : 'Admin', formatDateTimeOrNull(dateOf(m, 'createdAt')?.toLocal())].whereType<String>().join(' · '),
                              style: TextStyle(fontSize: 11, color: context.colors.onSurfaceVariant),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          if (!closed && _ticket != null)
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, Gap.sm),
                child: Row(
                  children: [
                    IconButton(
                      onPressed: _sending ? null : _attach,
                      icon: Badge(isLabelVisible: _replyFiles.isNotEmpty, label: Text('${_replyFiles.length}'), child: const Icon(Icons.attach_file_rounded)),
                    ),
                    Expanded(child: TextField(controller: _reply, minLines: 1, maxLines: 4, decoration: const InputDecoration(hintText: 'Tulis balasan'))),
                    const SizedBox(width: Gap.sm),
                    IconButton.filled(
                      onPressed: _sending ? null : _send,
                      icon: _sending ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send_rounded),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
