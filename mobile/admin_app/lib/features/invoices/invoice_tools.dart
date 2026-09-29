import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../core/crud/lookups.dart';
import '../../core/files.dart';
import '../../core/formatters.dart';
import '../../core/forms/field_spec.dart';
import '../../core/forms/form_screen.dart';
import '../../core/widgets/dialogs.dart';

final _api = ApiClient.instance;

String _ym(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}';

/// Invoice actions from the web Tagihan page beyond mark-paid/remind.
class InvoiceTools {
  static Future<bool> generate(BuildContext context) {
    final now = DateTime.now();
    final months = [for (var i = -1; i <= 2; i++) DateTime(now.year, now.month + i)];
    return openForm(
      context,
      title: 'Generate Tagihan',
      submitLabel: 'Generate',
      fields: [
        FieldSpec(
          'targetMonth',
          'Bulan tagihan',
          type: FieldType.select,
          required: true,
          initial: _ym(now),
          options: [for (final m in months) (_ym(m), formatDate(m).split(' ').skip(1).join(' '))],
        ),
        const FieldSpec(
          'scope',
          'Untuk',
          type: FieldType.select,
          required: true,
          initial: 'all',
          options: [('all', 'Semua pelanggan aktif'), ('single', 'Satu pelanggan')],
        ),
        FieldSpec(
          'userId',
          'Pelanggan',
          type: FieldType.select,
          loadOptions: Lookups.pppoeUsers,
          visibleIf: (v) => v['scope'] == 'single',
          validator: (val, v) => v['scope'] == 'single' && val == null ? 'Pilih pelanggan' : null,
        ),
        const FieldSpec('skipExisting', 'Lewati yang sudah punya tagihan bulan ini', type: FieldType.toggle, initial: true),
        const FieldSpec('sendWa', 'Kirim WhatsApp ke pelanggan', type: FieldType.toggle),
      ],
      onSubmit: (v) async {
        final res = await _api.postLong('/api/invoices/generate', data: v);
        final m = res is Map ? res.cast<String, dynamic>() : <String, dynamic>{};
        if (context.mounted) showToast(context, str(m, 'message') ?? '${m['generated'] ?? 0} dibuat, ${m['skipped'] ?? 0} dilewati.');
      },
    );
  }

  static Future<bool> createManual(BuildContext context) => openForm(
    context,
    title: 'Tagihan Manual',
    submitLabel: 'Buat tagihan',
    fields: [
      FieldSpec('userId', 'Pelanggan', type: FieldType.select, required: true, loadOptions: Lookups.pppoeUsers),
      const FieldSpec('amount', 'Jumlah (Rp)', type: FieldType.integer, required: true, min: 1),
      const FieldSpec('dueDate', 'Jatuh tempo', type: FieldType.date, helper: 'Kosongkan: 7 hari dari sekarang.'),
      const FieldSpec('notes', 'Keterangan'),
    ],
    success: 'Tagihan dibuat.',
    onSubmit: (v) => _api.post('/api/invoices', data: v),
  );

  static Future<bool> importCsv(BuildContext context) async {
    final ok = await confirmAction(
      context,
      title: 'Impor Tagihan dari CSV',
      message: 'File CSV wajib punya kolom username dan amount; dueDate dan notes opsional.',
      confirmLabel: 'Pilih file',
    );
    if (!ok || !context.mounted) return false;
    final res = await pickAndUpload(context, '/api/admin/invoices/import', extensions: ['csv']);
    if (res == null || !context.mounted) return false;
    final m = res is Map ? res.cast<String, dynamic>() : <String, dynamic>{};
    showToast(context, '${m['imported'] ?? 0} dari ${m['total'] ?? 0} diimpor, ${m['failed'] ?? 0} gagal.');
    return true;
  }

  static Future<void> export(BuildContext context) async {
    Map<String, dynamic>? values;
    final ok = await openForm(
      context,
      title: 'Ekspor Tagihan',
      submitLabel: 'Ekspor',
      fields: const [
        FieldSpec(
          'status',
          'Status',
          type: FieldType.select,
          required: true,
          initial: 'all',
          options: [('all', 'Semua'), ('PENDING', 'Belum lunas'), ('PAID', 'Lunas'), ('OVERDUE', 'Terlambat')],
        ),
        FieldSpec('startDate', 'Dari tanggal', type: FieldType.date),
        FieldSpec('endDate', 'Sampai tanggal', type: FieldType.date),
      ],
      onSubmit: (v) async => values = v,
    );
    if (!ok || values == null || !context.mounted) return;
    final stamp = DateTime.now().toIso8601String().substring(0, 10);
    await downloadAndShare(
      context,
      '/api/invoices/export',
      'tagihan-$stamp.xlsx',
      query: {
        'format': 'excel',
        'status': values!['status'],
        if (values!['startDate'] != null && values!['endDate'] != null) ...{'startDate': values!['startDate'], 'endDate': values!['endDate']},
      },
    );
  }

  static Future<bool> broadcast(BuildContext context, List<String> invoiceIds) => openForm(
    context,
    title: 'Kirim Tagihan (${invoiceIds.length})',
    submitLabel: 'Kirim',
    fields: const [
      FieldSpec(
        'channel',
        'Kirim lewat',
        type: FieldType.select,
        required: true,
        initial: 'both',
        options: [('whatsapp', 'WhatsApp'), ('email', 'Email'), ('both', 'WhatsApp & email')],
      ),
    ],
    onSubmit: (v) async {
      final res = await _api.postLong('/api/whatsapp/broadcast-invoice', data: {'invoiceIds': invoiceIds, ...v});
      final m = res is Map ? res.cast<String, dynamic>() : <String, dynamic>{};
      if (context.mounted) showToast(context, 'Terkirim ${m['successCount'] ?? 0}, gagal ${m['failCount'] ?? 0}.');
    },
  );

  static Future<bool> delete(BuildContext context, List<String> ids, {String? label}) async {
    final ok = await confirmAction(
      context,
      title: ids.length == 1 ? 'Hapus Tagihan?' : 'Hapus ${ids.length} Tagihan?',
      message: '${label ?? 'Tagihan terpilih'} dihapus permanen beserta riwayat pembayarannya.',
      confirmLabel: 'Hapus',
      destructive: true,
    );
    if (!ok || !context.mounted) return false;
    return runAction(
      context,
      () => ids.length == 1 ? _api.delete('/api/invoices', query: {'id': ids.first}) : _api.delete('/api/invoices', query: {'ids': ids.join(',')}),
      success: 'Tagihan dihapus.',
    );
  }
}
