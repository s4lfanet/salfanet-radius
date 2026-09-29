import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/crud/lookups.dart';
import '../../core/formatters.dart';
import '../../core/forms/field_spec.dart';
import '../../core/forms/form_screen.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/detail.dart';
import '../../core/widgets/dialogs.dart';
import '../../core/widgets/entity_tile.dart';
import '../../models/registration.dart';
import '../pppoe/pppoe_detail_screen.dart';
import 'registration_provider.dart';

class RegistrationDetailScreen extends StatefulWidget {
  const RegistrationDetailScreen({super.key, required this.registration});
  final Registration registration;

  @override
  State<RegistrationDetailScreen> createState() => _RegistrationDetailScreenState();
}

class _RegistrationDetailScreenState extends State<RegistrationDetailScreen> {
  bool _acting = false;

  Registration get reg => widget.registration;
  bool get _isPending => reg.status == 'PENDING';

  /// Same fields as the web approve dialog: billing, area/router,
  /// connection type and optional custom credentials.
  Future<void> _approve() async {
    final provider = context.read<RegistrationProvider>();
    bool staticIp(Map<String, dynamic> v) => v['connectionType'] != 'PPPOE';
    Map<String, dynamic> res = {};
    final ok = await openForm(
      context,
      title: 'Setujui Registrasi',
      submitLabel: 'Setujui',
      fields: [
        FieldSpec.note('Akun pelanggan dan invoice pemasangan untuk ${reg.name} akan dibuat.'),
        const FieldSpec(
          'subscriptionType',
          'Jenis langganan',
          type: FieldType.select,
          required: true,
          initial: 'POSTPAID',
          options: [('POSTPAID', 'Pascabayar'), ('PREPAID', 'Prabayar')],
        ),
        FieldSpec(
          'billingDay',
          'Tanggal tagihan (1–28)',
          type: FieldType.integer,
          initial: 1,
          min: 1,
          max: 28,
          visibleIf: (v) => v['subscriptionType'] == 'POSTPAID',
        ),
        const FieldSpec('installationFee', 'Biaya pasang (Rp)', type: FieldType.integer, initial: 0, min: 0),
        FieldSpec('areaId', 'Area', type: FieldType.select, loadOptions: Lookups.areas),
        FieldSpec('routerId', 'Router', type: FieldType.select, loadOptions: Lookups.routers),
        const FieldSpec.section('Koneksi'),
        const FieldSpec(
          'connectionType',
          'Tipe koneksi',
          type: FieldType.select,
          required: true,
          initial: 'PPPOE',
          options: [('PPPOE', 'PPPoE'), ('STATIC_IP', 'Static IP (ARP)'), ('HOTSPOT', 'Static IP (Hotspot binding)')],
        ),
        FieldSpec('ipAddress', 'IP address', visibleIf: staticIp),
        FieldSpec('macAddress', 'MAC address', visibleIf: staticIp),
        const FieldSpec('username', 'Username (opsional)', helper: 'Kosongkan untuk dibuat otomatis.'),
        const FieldSpec('password', 'Password (opsional)', type: FieldType.password),
      ],
      initial: {'areaId': reg.areaId},
      onSubmit: (v) async {
        if (v['subscriptionType'] != 'POSTPAID') v['billingDay'] = 1;
        res = await provider.approve(reg.id, {...v, 'installationFee': v['installationFee'] ?? 0});
      },
    );
    if (!ok || !mounted) return;
    final username = (res['pppoeUser'] as Map?)?['username']?.toString();
    showToast(context, username != null ? 'Disetujui. Akun dibuat: $username' : 'Registrasi disetujui.');
    Navigator.pop(context);
  }

  Future<void> _delete() async {
    final ok = await confirmAction(
      context,
      title: 'Hapus Registrasi?',
      message: 'Data pendaftaran ${reg.name} dihapus permanen.',
      confirmLabel: 'Hapus',
      destructive: true,
    );
    if (!ok || !mounted) return;
    final done = await runAction(context, () => ApiClient.instance.delete('/api/admin/registrations/${reg.id}'), success: 'Registrasi dihapus.');
    if (done && mounted) Navigator.pop(context);
  }

  Future<void> _reject() async {
    final reason = await askReason(context, title: 'Tolak Registrasi', label: 'Alasan penolakan');
    if (reason == null || !mounted) return;
    setState(() => _acting = true);
    final provider = context.read<RegistrationProvider>();
    final done = await runAction(context, () => provider.reject(reg.id, reason), success: 'Registrasi ditolak.');
    if (!mounted) return;
    setState(() => _acting = false);
    if (done) Navigator.pop(context);
  }

  Future<void> _markInstalled() async {
    final ok = await confirmAction(
      context,
      title: 'Tandai Terpasang',
      message: 'Pemasangan untuk ${reg.name} sudah selesai di lokasi?',
      confirmLabel: 'Sudah Terpasang',
    );
    if (!ok || !mounted) return;
    setState(() => _acting = true);
    final provider = context.read<RegistrationProvider>();
    final done = await runAction(context, () => provider.markInstalled(reg.id), success: 'Ditandai terpasang.');
    if (!mounted) return;
    setState(() => _acting = false);
    if (done) Navigator.pop(context);
  }

  Future<void> _launch(Uri uri) async {
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication) && mounted) showToast(context, 'Tidak ada aplikasi untuk membuka tautan ini.');
  }

  String _wa(String phone) {
    var n = phone.replaceAll(RegExp(r'[^0-9]'), '');
    if (n.startsWith('0')) n = '62${n.substring(1)}';
    return n;
  }

  List<ActionSpec> get _actions {
    if (_isPending) {
      return [
        ActionSpec('Setujui', Icons.check_rounded, _acting ? null : _approve, kind: ActionKind.success),
        ActionSpec('Tolak', Icons.close_rounded, _acting ? null : _reject, kind: ActionKind.danger),
      ];
    }
    if (reg.status == 'APPROVED') {
      return [
        ActionSpec('Tandai Terpasang', Icons.home_repair_service_rounded, _markInstalled, busy: _acting),
        ActionSpec('WhatsApp', Icons.chat_rounded, () => _launch(Uri.parse('https://wa.me/${_wa(reg.phone)}')), kind: ActionKind.neutral),
      ];
    }
    return [ActionSpec('WhatsApp', Icons.chat_rounded, () => _launch(Uri.parse('https://wa.me/${_wa(reg.phone)}')))];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Detail Registrasi'),
        actions: [IconButton(tooltip: 'Hapus', icon: const Icon(Icons.delete_outline_rounded), onPressed: _delete)],
      ),
      bottomNavigationBar: ActionBar(actions: _actions),
      body: ListView(
        padding: EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, listBottomPadding(context)),
        children: [
          DetailHeader(
            icon: Icons.person_add_alt_1_rounded,
            tone: statusTone(reg.status),
            title: reg.name,
            subtitle: 'Diajukan ${formatDateTime(reg.createdAt)}',
            status: StatusPill.status(reg.status),
          ),
          DetailSection(
            title: 'Data Pendaftar',
            rows: [
              InfoRow(
                'Telepon',
                reg.phone,
                copyable: true,
                onTap: () => _launch(Uri(scheme: 'tel', path: reg.phone)),
              ),
              InfoRow('Email', reg.email, copyable: true),
              InfoRow('NIK', reg.idCardNumber, copyable: true),
              InfoRow('Alamat', reg.address),
              InfoRow(
                'Lokasi',
                reg.hasLocation ? 'Buka di Google Maps' : null,
                onTap: reg.hasLocation ? () => _launch(Uri.parse('https://www.google.com/maps/search/?api=1&query=${reg.latitude},${reg.longitude}')) : null,
              ),
              InfoRow('Kode Referral', reg.referralCode),
              InfoRow('Catatan', reg.notes),
            ],
          ),
          DetailSection(
            title: 'Paket',
            rows: [
              InfoRow('Paket', reg.profileName),
              InfoRow('Harga', reg.profilePrice != null ? '${formatCurrency(reg.profilePrice!)} / bulan' : null),
              InfoRow('Kecepatan', reg.profileSpeed),
              InfoRow('Area', reg.areaName ?? 'Belum ditentukan'),
            ],
          ),
          if (!_isPending)
            DetailSection(
              title: 'Hasil',
              rows: [
                InfoRow(
                  'Akun PPPoE',
                  reg.pppoeUsername,
                  onTap: reg.pppoeUserId == null
                      ? null
                      : () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PppoeDetailScreen(userId: reg.pppoeUserId!))),
                ),
                InfoRow('Invoice', reg.invoiceNumber != null ? '${reg.invoiceNumber} · ${statusLabel(reg.invoiceStatus ?? '')}' : null),
                InfoRow('Biaya Pasang', reg.installationFee != null && reg.installationFee! > 0 ? formatCurrency(reg.installationFee!) : null),
                InfoRow('Alasan Ditolak', reg.rejectionReason, valueColor: context.tone(Tone.danger)),
              ],
            ),
          ProofImage(source: reg.idCardPhoto, baseUrl: ApiClient.instance.baseUrl, title: 'Foto KTP'),
        ],
      ),
    );
  }
}
