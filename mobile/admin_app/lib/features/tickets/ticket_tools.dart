import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/crud/crud_list_screen.dart';
import '../../core/crud/lookups.dart';
import '../../core/formatters.dart';
import '../../core/forms/field_spec.dart';
import '../../core/forms/form_screen.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';

final _api = ApiClient.instance;

const ticketPriorities = [('LOW', 'Rendah'), ('MEDIUM', 'Sedang'), ('HIGH', 'Tinggi'), ('URGENT', 'Urgent')];

Future<String> _uploadAttachment(file) async {
  final res = await _api.upload('/api/tickets/upload', file.path, filename: file.name);
  final url = res is Map ? res['url']?.toString() : null;
  if (url == null) throw ApiException('Upload lampiran gagal');
  return url;
}

/// New ticket dispatched to technicians — the web Tiket page's "Buat Tiket"
/// dialog (POST /api/tickets/dispatch notifies the technicians).
Future<bool> dispatchTicket(BuildContext context) async {
  // Customer list doubles as the auto-fill source for name/phone/address.
  final customers = <String, Json>{};
  Future<FieldOptions> loadCustomers() async {
    final res = await _api.get('/api/pppoe/users', query: {'limit': 5000});
    final list = extractList(res, listKey: 'users');
    for (final u in list) {
      customers['${u['id']}'] = u;
    }
    return [for (final u in list) ('${u['id']}', '${u['name'] ?? u['username']} · ${u['username']}')];
  }

  bool manual(Json v) => isBlank(v['customerId']);

  return openForm(
    context,
    title: 'Buat Tiket',
    submitLabel: 'Kirim ke teknisi',
    fields: [
      FieldSpec('customerId', 'Pelanggan', type: FieldType.select, loadOptions: loadCustomers, helper: 'Kosongkan untuk mengisi nama & telepon manual.'),
      FieldSpec('customerName', 'Nama pelapor', visibleIf: manual, validator: (val, v) => manual(v) && isBlank(val) ? 'Wajib diisi' : null),
      FieldSpec('customerPhone', 'Telepon', type: FieldType.phone, visibleIf: manual, validator: (val, v) => manual(v) && isBlank(val) ? 'Wajib diisi' : null),
      FieldSpec('customerAddress', 'Alamat', visibleIf: manual),
      const FieldSpec.section('Keluhan'),
      const FieldSpec('subject', 'Subjek', required: true, hint: 'mis. Internet mati sejak pagi'),
      const FieldSpec('description', 'Deskripsi', type: FieldType.multiline, required: true),
      FieldSpec('categoryId', 'Kategori', type: FieldType.select, loadOptions: Lookups.ticketCategories),
      const FieldSpec('priority', 'Prioritas', type: FieldType.select, required: true, initial: 'MEDIUM', options: ticketPriorities),
      const FieldSpec.section('Lokasi jaringan (opsional)'),
      FieldSpec('routerId', 'Router', type: FieldType.select, loadOptions: Lookups.routers),
      FieldSpec('oltId', 'OLT', type: FieldType.select, loadOptions: Lookups.olts),
      FieldSpec('odcId', 'ODC', type: FieldType.select, loadOptions: Lookups.odcs),
      FieldSpec('odpId', 'ODP', type: FieldType.select, loadOptions: Lookups.odps),
      const FieldSpec('latitude', 'Titik lokasi', type: FieldType.location, pairKey: 'longitude'),
      FieldSpec('attachments', 'Lampiran foto', type: FieldType.images, max: 5, uploader: _uploadAttachment),
    ],
    success: 'Tiket dibuat dan dikirim ke teknisi.',
    onSubmit: (v) {
      final c = customers['${v['customerId']}'];
      if (c != null) {
        v['customerName'] = c['name'] ?? c['username'];
        v['customerPhone'] = c['phone'] ?? '';
        v['customerAddress'] = c['address'] ?? '';
      }
      if ((v['attachments'] as List?)?.isEmpty ?? true) v.remove('attachments');
      return _api.post('/api/tickets/dispatch', data: v);
    },
  );
}

Future<bool> editTicket(BuildContext context, Json ticket) => openForm(
  context,
  title: 'Edit Tiket',
  fields: [
    const FieldSpec('subject', 'Subjek', required: true),
    const FieldSpec('description', 'Deskripsi', type: FieldType.multiline, required: true),
    FieldSpec('categoryId', 'Kategori', type: FieldType.select, loadOptions: Lookups.ticketCategories),
    const FieldSpec('priority', 'Prioritas', type: FieldType.select, required: true, options: ticketPriorities),
    const FieldSpec('estimatedRepair', 'Estimasi perbaikan', hint: 'mis. Hari ini 15:00'),
    FieldSpec('assignedToId', 'Ditugaskan ke teknisi', type: FieldType.select, loadOptions: Lookups.technicians),
  ],
  initial: ticket,
  success: 'Tiket disimpan.',
  onSubmit: (v) => _api.put('/api/tickets', data: {'id': ticket['id'], ...v, if (!isBlank(v['assignedToId'])) 'assignedToType': 'TECHNICIAN'}),
);

Future<bool> deleteTicket(BuildContext context, Json ticket) async {
  final ok = await confirmAction(
    context,
    title: 'Hapus Tiket?',
    message: 'Tiket #${ticket['ticketNumber']} beserta semua pesannya dihapus permanen.',
    confirmLabel: 'Hapus',
    destructive: true,
  );
  if (!ok || !context.mounted) return false;
  return runAction(context, () => _api.delete('/api/tickets', query: {'id': ticket['id']}), success: 'Tiket dihapus.');
}

/// Kategori tiket — mirrors /admin/tickets/categories.
CrudConfig ticketCategoriesConfig() => CrudConfig(
  title: 'Kategori Tiket',
  noun: 'Kategori',
  icon: Icons.label_rounded,
  tone: Tone.violet,
  fetch: (_) => _api.get('/api/tickets/categories'),
  titleOf: (c) => str(c, 'name') ?? '-',
  subtitleOf: (c) => str(c, 'description'),
  metaOf: (c) => c['_count'] is Map ? '${(c['_count'] as Map)['tickets'] ?? 0} tiket' : null,
  statusOf: (c) => c['isActive'] == false ? const StatusPill(label: 'Nonaktif', tone: Tone.neutral) : const StatusPill(label: 'Aktif', tone: Tone.success),
  fields: (_) => const [
    FieldSpec('name', 'Nama kategori', required: true),
    FieldSpec('description', 'Deskripsi'),
    FieldSpec('color', 'Warna (hex)', initial: '#3B82F6', hint: '#3B82F6'),
    FieldSpec('isActive', 'Aktif', type: FieldType.toggle, initial: true),
  ],
  create: CrudRoutes.postTo('/api/tickets/categories'),
  update: CrudRoutes.putWithBodyId('/api/tickets/categories'),
  delete: CrudRoutes.deleteWithQueryId('/api/tickets/categories'),
  deleteMessage: (c) => 'Kategori "${c['name']}" dihapus. Tiket lama tetap tersimpan.',
);
