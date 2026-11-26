import 'dart:io';

import 'package:dio/dio.dart' as dio;
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/dialogs.dart';

/// Unggah satu foto ke server; mengembalikan path relatif (`/uploads/tickets/...`).
Future<String> uploadTicketFile(File file) async {
  final form = dio.FormData.fromMap({
    'file': await dio.MultipartFile.fromFile(file.path, filename: file.path.split(Platform.pathSeparator).last),
  });
  final res = await ApiClient.instance.postForm('/api/agent/tickets/upload', form);
  final url = res is Map ? res['url']?.toString() : null;
  if (url == null || url.isEmpty) {
    throw ApiException(res is Map ? (res['error']?.toString() ?? 'Lampiran gagal diunggah.') : 'Lampiran gagal diunggah.');
  }
  return url;
}

class _Attachment {
  _Attachment(this.file);
  final File file;
  String? url;
  bool uploading = true;
  String? error;
}

/// Form tiket lengkap seperti di aplikasi pelanggan: kategori, prioritas, judul,
/// penjelasan, lokasi (GPS + keterangan), dan foto lampiran.
class CreateTicketScreen extends StatefulWidget {
  const CreateTicketScreen({super.key});

  @override
  State<CreateTicketScreen> createState() => _CreateTicketScreenState();
}

class _CreateTicketScreenState extends State<CreateTicketScreen> {
  static const _priorities = <(String, String)>[('LOW', 'Rendah'), ('MEDIUM', 'Sedang'), ('HIGH', 'Tinggi'), ('URGENT', 'Mendesak')];

  final _formKey = GlobalKey<FormState>();
  final _subject = TextEditingController();
  final _desc = TextEditingController();
  final _locationTag = TextEditingController();

  List<Map<String, dynamic>> _categories = [];
  String? _categoryId;
  String _priority = 'MEDIUM';
  double? _lat;
  double? _lng;
  bool _gpsLoading = false;
  String? _gpsMessage;
  final List<_Attachment> _attachments = [];
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadCategories();
  }

  @override
  void dispose() {
    _subject.dispose();
    _desc.dispose();
    _locationTag.dispose();
    super.dispose();
  }

  Future<void> _loadCategories() async {
    try {
      final res = await ApiClient.instance.get('/api/tickets/categories', query: {'isActive': 'true'});
      final list = (res is List ? res : (res is Map ? res['categories'] : null)) as List?;
      if (!mounted) return;
      setState(() => _categories = list?.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() ?? []);
    } on ApiException catch (_) {}
  }

  Future<void> _useGps() async {
    setState(() {
      _gpsLoading = true;
      _gpsMessage = null;
    });
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        setState(() => _gpsMessage = 'GPS perangkat mati. Nyalakan lokasi lalu coba lagi.');
        return;
      }
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied) {
        setState(() => _gpsMessage = 'Izin lokasi ditolak.');
        return;
      }
      if (perm == LocationPermission.deniedForever) {
        setState(() => _gpsMessage = 'Izin lokasi diblokir. Buka Pengaturan aplikasi untuk mengizinkannya.');
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 20)),
      );
      if (!mounted) return;
      setState(() {
        _lat = pos.latitude;
        _lng = pos.longitude;
      });
    } catch (_) {
      if (mounted) setState(() => _gpsMessage = 'Gagal membaca lokasi. Coba di tempat terbuka.');
    } finally {
      if (mounted) setState(() => _gpsLoading = false);
    }
  }

  Future<void> _pick(ImageSource source) async {
    if (_attachments.length >= 5) {
      showToast(context, 'Maksimal 5 lampiran.');
      return;
    }
    XFile? picked;
    try {
      picked = await ImagePicker().pickImage(source: source, imageQuality: 80);
    } catch (_) {
      if (mounted) showToast(context, 'Tidak bisa membuka ${source == ImageSource.camera ? 'kamera' : 'galeri'}.');
      return;
    }
    if (picked == null || !mounted) return;
    final file = File(picked.path);
    if (await file.length() > 10 * 1024 * 1024) {
      if (mounted) showToast(context, 'Ukuran file melebihi 10 MB.');
      return;
    }
    final a = _Attachment(file);
    setState(() => _attachments.add(a));
    try {
      final url = await uploadTicketFile(file);
      if (mounted) setState(() {
        a.url = url;
        a.uploading = false;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() {
        a.uploading = false;
        a.error = e.message;
      });
    } catch (_) {
      if (mounted) setState(() {
        a.uploading = false;
        a.error = 'Gagal mengunggah.';
      });
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_attachments.any((a) => a.uploading)) {
      setState(() => _error = 'Tunggu lampiran selesai diunggah.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ApiClient.instance.post('/api/agent/tickets', data: {
        'subject': _subject.text.trim(),
        'description': _desc.text.trim(),
        if (_categoryId != null) 'categoryId': _categoryId,
        'priority': _priority,
        if (_lat != null) 'latitude': _lat,
        if (_lng != null) 'longitude': _lng,
        if (_locationTag.text.trim().isNotEmpty) 'locationTag': _locationTag.text.trim(),
        'attachments': _attachments.where((a) => a.url != null).map((a) => a.url!).toList(),
      });
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      appBar: AppBar(title: const Text('Tiket Baru')),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, Gap.sm),
          child: FilledButton(
            onPressed: _submitting ? null : _submit,
            child: _submitting ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Kirim Tiket'),
          ),
        ),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: EdgeInsets.fromLTRB(Gap.page, Gap.md, Gap.page, Gap.xl),
          children: [
            if (_categories.isNotEmpty) ...[
              DropdownButtonFormField<String>(
                value: _categoryId,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Kategori'),
                items: [for (final k in _categories) DropdownMenuItem(value: str(k, 'id'), child: Text(str(k, 'name') ?? '-', overflow: TextOverflow.ellipsis))],
                onChanged: (v) => setState(() => _categoryId = v),
              ),
              const SizedBox(height: Gap.md),
            ],
            const Text('Prioritas', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
            const SizedBox(height: Gap.xs),
            Wrap(
              spacing: Gap.sm,
              children: [
                for (final p in _priorities)
                  ChoiceChip(
                    label: Text(p.$2),
                    selected: _priority == p.$1,
                    onSelected: (_) => setState(() => _priority = p.$1),
                    labelStyle: TextStyle(fontWeight: FontWeight.w700, color: _priority == p.$1 ? onColor(c.primary) : c.onSurface),
                    selectedColor: c.primary,
                    showCheckmark: false,
                  ),
              ],
            ),
            const SizedBox(height: Gap.md),
            TextFormField(
              controller: _subject,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(labelText: 'Judul'),
              validator: (v) => (v == null || v.trim().length < 3) ? 'Judul minimal 3 karakter.' : null,
            ),
            const SizedBox(height: Gap.md),
            TextFormField(
              controller: _desc,
              minLines: 4,
              maxLines: 8,
              decoration: const InputDecoration(labelText: 'Penjelasan kendala', alignLabelWithHint: true),
              validator: (v) => (v == null || v.trim().length < 10) ? 'Jelaskan kendala minimal 10 karakter.' : null,
            ),
            const SizedBox(height: Gap.lg),
            const Text('Lokasi', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
            const SizedBox(height: Gap.xs),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(Gap.md),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_lat != null && _lng != null)
                      Row(children: [
                        Icon(Icons.location_on_rounded, size: 18, color: context.tone(Tone.success)),
                        const SizedBox(width: 6),
                        Expanded(child: Text('${_lat!.toStringAsFixed(6)}, ${_lng!.toStringAsFixed(6)}', style: const TextStyle(fontWeight: FontWeight.w600))),
                        IconButton(visualDensity: VisualDensity.compact, onPressed: () => setState(() { _lat = null; _lng = null; }), icon: const Icon(Icons.close_rounded, size: 18)),
                      ])
                    else
                      OutlinedButton.icon(
                        onPressed: _gpsLoading ? null : _useGps,
                        icon: _gpsLoading ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.my_location_rounded, size: 18),
                        label: const Text('Pakai lokasi saya'),
                      ),
                    if (_gpsMessage != null) ...[
                      const SizedBox(height: Gap.xs),
                      Text(_gpsMessage!, style: TextStyle(fontSize: 12.5, color: context.tone(Tone.danger))),
                    ],
                    const SizedBox(height: Gap.md),
                    TextFormField(controller: _locationTag, maxLength: 500, decoration: const InputDecoration(labelText: 'Keterangan lokasi (opsional)', counterText: '')),
                  ],
                ),
              ),
            ),
            const SizedBox(height: Gap.lg),
            Row(children: [
              const Expanded(child: Text('Foto lampiran', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700))),
              TextButton.icon(onPressed: () => _pick(ImageSource.camera), icon: const Icon(Icons.photo_camera_outlined, size: 18), label: const Text('Kamera')),
              TextButton.icon(onPressed: () => _pick(ImageSource.gallery), icon: const Icon(Icons.photo_library_outlined, size: 18), label: const Text('Galeri')),
            ]),
            if (_attachments.isNotEmpty)
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final a in _attachments)
                    Stack(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: SizedBox(width: 84, height: 84, child: Image.file(a.file, fit: BoxFit.cover)),
                        ),
                        if (a.uploading) Positioned.fill(child: Container(color: Colors.black38, child: const Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))))),
                        if (a.error != null) Positioned.fill(child: Container(color: Colors.red.withValues(alpha: 0.55), child: const Center(child: Icon(Icons.error_outline, color: Colors.white)))),
                        Positioned(
                          top: 0,
                          right: 0,
                          child: GestureDetector(
                            onTap: () => setState(() => _attachments.remove(a)),
                            child: Container(decoration: const BoxDecoration(color: Colors.black54, shape: BoxShape.circle), padding: const EdgeInsets.all(3), child: const Icon(Icons.close, size: 14, color: Colors.white)),
                          ),
                        ),
                      ],
                    ),
                ],
              ),
            if (_error != null) ...[
              const SizedBox(height: Gap.md),
              Text(_error!, style: TextStyle(color: context.tone(Tone.danger), fontWeight: FontWeight.w600)),
            ],
          ],
        ),
      ),
    );
  }
}
