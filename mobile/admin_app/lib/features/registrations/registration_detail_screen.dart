import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
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
  List<Map<String, dynamic>> _areas = [];
  List<Map<String, dynamic>> _routers = [];
  bool _loadingOptions = false;
  bool _acting = false;

  String? _areaId;
  String? _routerId;
  String _subscriptionType = 'POSTPAID';
  final _billingDayController = TextEditingController(text: '1');
  final _feeController = TextEditingController(text: '0');

  Registration get reg => widget.registration;
  bool get _isPending => reg.status == 'PENDING';

  @override
  void initState() {
    super.initState();
    if (_isPending) _loadOptions();
  }

  @override
  void dispose() {
    _billingDayController.dispose();
    _feeController.dispose();
    super.dispose();
  }

  Future<void> _loadOptions() async {
    setState(() => _loadingOptions = true);
    try {
      final results = await Future.wait([
        ApiClient.instance.get('/api/pppoe/areas'),
        ApiClient.instance.get('/api/network/routers'),
      ]);
      _areas = (((results[0] as Map?)?['areas'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
      _routers = (((results[1] as Map?)?['routers'] as List?) ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
      // Pre-select the area the customer picked when registering.
      final match = _areas.where((a) => a['name'] == reg.areaName);
      if (match.isNotEmpty) _areaId = match.first['id']?.toString();
    } on ApiException catch (_) {
      // Non-fatal: approval still works with area/router left unset.
    } finally {
      if (mounted) setState(() => _loadingOptions = false);
    }
  }

  Future<void> _approve() async {
    final ok = await confirmAction(
      context,
      title: 'Setujui Registrasi',
      message: 'Akun PPPoE untuk ${reg.name} dibuat, dan invoice pemasangan dikirim ke WhatsApp ${reg.phone}.',
      confirmLabel: 'Setujui',
    );
    if (!ok || !mounted) return;
    setState(() => _acting = true);
    final provider = context.read<RegistrationProvider>();
    Map<String, dynamic> res = {};
    final done = await runAction(context, () async {
      res = await provider.approve(reg.id, {
        'installationFee': num.tryParse(_feeController.text) ?? 0,
        'subscriptionType': _subscriptionType,
        'billingDay': int.tryParse(_billingDayController.text) ?? 1,
        if (_areaId != null) 'areaId': _areaId,
        if (_routerId != null) 'routerId': _routerId,
      });
    });
    if (!mounted) return;
    setState(() => _acting = false);
    if (done) {
      final username = (res['pppoeUser'] as Map?)?['username']?.toString();
      showToast(context, username != null ? 'Disetujui. Akun dibuat: $username' : 'Registrasi disetujui.');
      Navigator.pop(context);
    }
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
    final ok = await confirmAction(context, title: 'Tandai Terpasang', message: 'Pemasangan untuk ${reg.name} sudah selesai di lokasi?', confirmLabel: 'Sudah Terpasang');
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
        ActionSpec('Setujui', Icons.check_rounded, _loadingOptions ? null : _approve, kind: ActionKind.success, busy: _acting),
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
      appBar: AppBar(title: const Text('Detail Registrasi')),
      bottomNavigationBar: ActionBar(actions: _actions),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, Gap.xl),
        children: [
          DetailHeader(
            icon: Icons.person_add_alt_1_rounded,
            tone: statusTone(reg.status),
            title: reg.name,
            subtitle: 'Diajukan ${formatDateTime(reg.createdAt)}',
            status: StatusPill.status(reg.status),
          ),
          DetailSection(title: 'Data Pendaftar', rows: [
            InfoRow('Telepon', reg.phone, copyable: true, onTap: () => _launch(Uri(scheme: 'tel', path: reg.phone))),
            InfoRow('Email', reg.email, copyable: true),
            InfoRow('NIK', reg.idCardNumber, copyable: true),
            InfoRow('Alamat', reg.address),
            InfoRow('Lokasi', reg.hasLocation ? 'Buka di Google Maps' : null,
                onTap: reg.hasLocation ? () => _launch(Uri.parse('https://www.google.com/maps/search/?api=1&query=${reg.latitude},${reg.longitude}')) : null),
            InfoRow('Kode Referral', reg.referralCode),
            InfoRow('Catatan', reg.notes),
          ]),
          DetailSection(title: 'Paket', rows: [
            InfoRow('Paket', reg.profileName),
            InfoRow('Harga', reg.profilePrice != null ? '${formatCurrency(reg.profilePrice!)} / bulan' : null),
            InfoRow('Kecepatan', reg.profileSpeed),
            InfoRow('Area', reg.areaName ?? 'Belum ditentukan'),
          ]),
          if (!_isPending)
            DetailSection(title: 'Hasil', rows: [
              InfoRow('Akun PPPoE', reg.pppoeUsername,
                  onTap: reg.pppoeUserId == null ? null : () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PppoeDetailScreen(userId: reg.pppoeUserId!)))),
              InfoRow('Invoice', reg.invoiceNumber != null ? '${reg.invoiceNumber} · ${statusLabel(reg.invoiceStatus ?? '')}' : null),
              InfoRow('Biaya Pasang', reg.installationFee != null && reg.installationFee! > 0 ? formatCurrency(reg.installationFee!) : null),
              InfoRow('Alasan Ditolak', reg.rejectionReason, valueColor: context.tone(Tone.danger)),
            ]),
          ProofImage(source: reg.idCardPhoto, baseUrl: ApiClient.instance.baseUrl, title: 'Foto KTP'),
          if (_isPending) _approveForm(context),
        ],
      ),
    );
  }

  Widget _approveForm(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: Gap.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 2, bottom: Gap.sm),
            child: Text('Pengaturan Akun', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: context.colors.onSurfaceVariant)),
          ),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(Gap.lg),
              child: _loadingOptions
                  ? const Padding(padding: EdgeInsets.all(Gap.lg), child: Center(child: CircularProgressIndicator()))
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        SegmentedButton<String>(
                          segments: const [
                            ButtonSegment(value: 'POSTPAID', label: Text('Pascabayar')),
                            ButtonSegment(value: 'PREPAID', label: Text('Prabayar')),
                          ],
                          selected: {_subscriptionType},
                          showSelectedIcon: false,
                          onSelectionChanged: (s) => setState(() => _subscriptionType = s.first),
                        ),
                        const SizedBox(height: Gap.md),
                        Row(
                          children: [
                            if (_subscriptionType == 'POSTPAID') ...[
                              Expanded(
                                child: TextField(
                                  controller: _billingDayController,
                                  keyboardType: TextInputType.number,
                                  decoration: const InputDecoration(labelText: 'Tgl tagihan (1-31)'),
                                ),
                              ),
                              const SizedBox(width: Gap.md),
                            ],
                            Expanded(
                              child: TextField(
                                controller: _feeController,
                                keyboardType: TextInputType.number,
                                decoration: const InputDecoration(labelText: 'Biaya pasang (Rp)'),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: Gap.md),
                        DropdownButtonFormField<String>(
                          value: _areaId,
                          isExpanded: true,
                          decoration: const InputDecoration(labelText: 'Area'),
                          items: _areas.map((a) => DropdownMenuItem(value: a['id']?.toString(), child: Text(a['name']?.toString() ?? '-'))).toList(),
                          onChanged: (v) => setState(() => _areaId = v),
                        ),
                        const SizedBox(height: Gap.md),
                        DropdownButtonFormField<String>(
                          value: _routerId,
                          isExpanded: true,
                          decoration: const InputDecoration(labelText: 'Router'),
                          items: _routers.map((r) => DropdownMenuItem(value: r['id']?.toString(), child: Text(r['name']?.toString() ?? '-'))).toList(),
                          onChanged: (v) => setState(() => _routerId = v),
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
