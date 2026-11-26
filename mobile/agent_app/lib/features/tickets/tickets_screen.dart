import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../core/widgets/state_views.dart';

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
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const _NewTicketSheet(),
    );
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
      body: DataStateView(
        loading: _loading,
        error: _error,
        isEmpty: _items.isEmpty,
        emptyIcon: Icons.support_agent_outlined,
        emptyMessage: 'Belum ada tiket',
        emptyHint: 'Ada kendala? Tekan Tiket Baru untuk menghubungi admin.',
        onRetry: _load,
        child: RefreshableList(
          hasFab: true,
          itemCount: _items.length,
          onRefresh: _load,
          itemBuilder: (context, i) {
            final t = _items[i];
            final status = str(t, 'status') ?? '-';
            return EntityTile(
              icon: Icons.support_agent_rounded,
              tone: _ticketTone(status),
              title: str(t, 'subject') ?? '-',
              subtitle: [str(t, 'ticketNumber'), str(mapOf(t, 'category'), 'name')].whereType<String>().join(' · '),
              meta: formatDateTimeOrNull(dateOf(t, 'createdAt')?.toLocal()),
              trailing: StatusPill(label: _ticketLabel(status), tone: _ticketTone(status)),
              onTap: () => _open(t),
            );
          },
        ),
      ),
    );
  }
}

class _NewTicketSheet extends StatefulWidget {
  const _NewTicketSheet();

  @override
  State<_NewTicketSheet> createState() => _NewTicketSheetState();
}

class _NewTicketSheetState extends State<_NewTicketSheet> {
  final _subject = TextEditingController();
  final _desc = TextEditingController();
  String _priority = 'MEDIUM';
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _subject.dispose();
    _desc.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_subject.text.trim().isEmpty || _desc.text.trim().isEmpty) {
      setState(() => _error = 'Isi judul dan penjelasan kendala.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ApiClient.instance.post('/api/agent/tickets', data: {
        'subject': _subject.text.trim(),
        'description': _desc.text.trim(),
        'priority': _priority,
      });
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(Gap.page, Gap.md, Gap.page, MediaQuery.viewInsetsOf(context).bottom + Gap.page),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Tiket Baru', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: Gap.lg),
            TextField(controller: _subject, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'Judul')),
            const SizedBox(height: Gap.md),
            TextField(controller: _desc, maxLines: 4, decoration: const InputDecoration(labelText: 'Penjelasan kendala')),
            const SizedBox(height: Gap.md),
            DropdownButtonFormField<String>(
              value: _priority,
              decoration: const InputDecoration(labelText: 'Prioritas'),
              items: const [
                DropdownMenuItem(value: 'LOW', child: Text('Rendah')),
                DropdownMenuItem(value: 'MEDIUM', child: Text('Sedang')),
                DropdownMenuItem(value: 'HIGH', child: Text('Tinggi')),
              ],
              onChanged: (v) => setState(() => _priority = v ?? _priority),
            ),
            if (_error != null) ...[
              const SizedBox(height: Gap.md),
              Text(_error!, style: TextStyle(color: context.tone(Tone.danger), fontWeight: FontWeight.w600)),
            ],
            const SizedBox(height: Gap.lg),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Kirim'),
            ),
          ],
        ),
      ),
    );
  }
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
    if (text.isEmpty) return;
    setState(() => _sending = true);
    final ok = await runAction(context, () => ApiClient.instance.post('/api/agent/tickets/${widget.ticketId}', data: {'message': text}));
    if (ok) _reply.clear();
    if (mounted) setState(() => _sending = false);
    if (ok) _load();
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
                    Card(child: Padding(padding: const EdgeInsets.all(Gap.md), child: Text(str(_ticket, 'description')!))),
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
                            Text(str(m, 'message') ?? ''),
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
