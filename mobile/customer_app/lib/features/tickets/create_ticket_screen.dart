import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/feature_colors.dart';
import '../auth/auth_provider.dart';
import 'ticket_provider.dart';

/// One attachment on its way to the server. Uploaded as soon as it is picked
/// (the web form does the same) so pressing Kirim is not a long wait, and so
/// a rejected file is reported while the customer still remembers picking it.
class _Attachment {
  _Attachment(this.file);

  final File file;
  String? url;
  bool uploading = true;
  String? error;

  String get name => file.path.split(Platform.pathSeparator).last;
  bool get isImage => RegExp(r'\.(jpe?g|png|webp)$', caseSensitive: false).hasMatch(file.path);
}

class CreateTicketScreen extends StatefulWidget {
  const CreateTicketScreen({super.key});

  @override
  State<CreateTicketScreen> createState() => _CreateTicketScreenState();
}

class _CreateTicketScreenState extends State<CreateTicketScreen> {
  final _formKey = GlobalKey<FormState>();
  final _subjectController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _locationTagController = TextEditingController();

  String? _categoryId;
  String _priority = 'MEDIUM';
  bool _submitting = false;
  String? _error;

  double? _latitude;
  double? _longitude;
  bool _gpsLoading = false;
  String? _gpsMessage;
  bool _coordsFromDevice = false;

  final List<_Attachment> _attachments = [];

  static const _priorities = [
    ('LOW', 'Rendah'),
    ('MEDIUM', 'Sedang'),
    ('HIGH', 'Tinggi'),
    ('URGENT', 'Mendesak'),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<TicketProvider>().loadCategories();

      // Prefill the way the web form does: the address on file is usually the
      // right answer, and it saves typing for the common case of reporting a
      // problem from home.
      final customer = context.read<AuthProvider>().customer;
      if (customer?.address?.isNotEmpty == true && _locationTagController.text.isEmpty) {
        _locationTagController.text = customer!.address!;
      }
    });
  }

  @override
  void dispose() {
    _subjectController.dispose();
    _descriptionController.dispose();
    _locationTagController.dispose();
    super.dispose();
  }

  // ─── Location ────────────────────────────────────────────────────────────

  Future<void> _useDeviceLocation() async {
    setState(() {
      _gpsLoading = true;
      _gpsMessage = null;
    });

    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        setState(() => _gpsMessage = 'GPS perangkat mati. Nyalakan lokasi lalu coba lagi.');
        return;
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied) {
        setState(() => _gpsMessage = 'Izin lokasi ditolak. Anda masih bisa pakai alamat terdaftar.');
        return;
      }
      if (permission == LocationPermission.deniedForever) {
        setState(() => _gpsMessage = 'Izin lokasi diblokir permanen. Buka Pengaturan aplikasi untuk mengizinkannya.');
        return;
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 20)),
      );
      if (!mounted) return;
      setState(() {
        _latitude = position.latitude;
        _longitude = position.longitude;
        _coordsFromDevice = true;
        _gpsMessage = null;
      });
    } catch (_) {
      if (mounted) setState(() => _gpsMessage = 'Gagal membaca lokasi. Coba di tempat terbuka atau pakai alamat terdaftar.');
    } finally {
      if (mounted) setState(() => _gpsLoading = false);
    }
  }

  void _useRegisteredCoords() {
    final customer = context.read<AuthProvider>().customer;
    if (customer == null || !customer.hasRegisteredCoords) return;
    setState(() {
      _latitude = customer.latitude;
      _longitude = customer.longitude;
      _coordsFromDevice = false;
      _gpsMessage = null;
    });
  }

  void _clearCoords() {
    setState(() {
      _latitude = null;
      _longitude = null;
      _coordsFromDevice = false;
    });
  }

  // ─── Attachments ─────────────────────────────────────────────────────────

  Future<void> _addAttachment() async {
    // Captured before the picker awaits, so nothing reaches for context once
    // the user has been away in the camera or file browser.
    final ticketProvider = context.read<TicketProvider>();
    final messenger = ScaffoldMessenger.of(context);

    final source = await showModalBottomSheet<String>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Ambil Foto'),
              subtitle: const Text('Potret kondisi perangkat atau kabel'),
              onTap: () => Navigator.pop(sheetContext, 'camera'),
            ),
            ListTile(
              leading: const Icon(Icons.folder_outlined),
              title: const Text('Pilih dari Penyimpanan'),
              subtitle: const Text('Gambar atau PDF, maksimal 10 MB'),
              onTap: () => Navigator.pop(sheetContext, 'file'),
            ),
          ],
        ),
      ),
    );
    if (source == null) return;

    File? picked;
    if (source == 'camera') {
      final shot = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 80);
      if (shot != null) picked = File(shot.path);
    } else {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
      );
      final path = result?.files.single.path;
      if (path != null) picked = File(path);
    }
    if (picked == null || !mounted) return;

    // The server caps uploads at 10MB; checking here turns a failed round trip
    // into an immediate, specific answer.
    if (await picked.length() > 10 * 1024 * 1024) {
      messenger.showSnackBar(const SnackBar(content: Text('Ukuran file melebihi 10 MB.')));
      return;
    }

    final attachment = _Attachment(picked);
    setState(() => _attachments.add(attachment));

    try {
      final url = await ticketProvider.uploadAttachment(picked);
      if (!mounted) return;
      setState(() {
        attachment.url = url;
        attachment.uploading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        attachment.uploading = false;
        attachment.error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        attachment.uploading = false;
        attachment.error = 'Gagal mengunggah.';
      });
    }
  }

  // ─── Submit ──────────────────────────────────────────────────────────────

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
      await context.read<TicketProvider>().createTicket(
            subject: _subjectController.text.trim(),
            description: _descriptionController.text.trim(),
            categoryId: _categoryId,
            priority: _priority,
            latitude: _latitude,
            longitude: _longitude,
            locationTag: _locationTagController.text.trim(),
            attachments: _attachments.where((a) => a.url != null).map((a) => a.url!).toList(),
          );
      if (mounted) Navigator.pop(context);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Gagal membuat tiket. Coba lagi.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  // ─── Build ───────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final categories = context.watch<TicketProvider>().categories;
    final customer = context.watch<AuthProvider>().customer;
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: featureAppBar(title: 'Buat Tiket Baru', icon: Icons.support_agent_rounded, accent: FeatureColors.ticket),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
            children: [
              Text('Masalah Anda', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              TextFormField(
                controller: _subjectController,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Subjek',
                  hintText: 'mis. Internet mati sejak pagi',
                ),
                validator: (value) => (value == null || value.trim().isEmpty) ? 'Subjek wajib diisi' : null,
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _descriptionController,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Deskripsi Masalah',
                  alignLabelWithHint: true,
                  helperText: 'Ceritakan sejak kapan dan apa yang sudah dicoba.',
                ),
                maxLines: 5,
                validator: (value) {
                  final text = value?.trim() ?? '';
                  if (text.isEmpty) return 'Deskripsi wajib diisi';
                  if (text.length < 10) return 'Deskripsi terlalu singkat, minimal 10 karakter';
                  return null;
                },
              ),
              const SizedBox(height: 14),
              if (categories.isNotEmpty) ...[
                DropdownButtonFormField<String>(
                  value: _categoryId,
                  decoration: const InputDecoration(labelText: 'Kategori (opsional)'),
                  items: categories.map((c) => DropdownMenuItem(value: c.id, child: Text(c.name))).toList(),
                  onChanged: (value) => setState(() => _categoryId = value),
                ),
                const SizedBox(height: 14),
              ],
              DropdownButtonFormField<String>(
                value: _priority,
                decoration: const InputDecoration(labelText: 'Prioritas'),
                items: _priorities.map((p) => DropdownMenuItem(value: p.$1, child: Text(p.$2))).toList(),
                onChanged: (value) => setState(() => _priority = value ?? 'MEDIUM'),
              ),

              const SizedBox(height: 26),
              Text('Lokasi', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(
                'Membantu teknisi menemukan rumah Anda.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _locationTagController,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Patokan Lokasi',
                  hintText: 'mis. Belakang masjid, pagar hijau',
                ),
              ),
              const SizedBox(height: 12),
              _LocationCard(
                latitude: _latitude,
                longitude: _longitude,
                fromDevice: _coordsFromDevice,
                loading: _gpsLoading,
                message: _gpsMessage,
                canUseRegistered: customer?.hasRegisteredCoords ?? false,
                onUseDevice: _gpsLoading ? null : _useDeviceLocation,
                onUseRegistered: _useRegisteredCoords,
                onClear: _clearCoords,
              ),

              const SizedBox(height: 26),
              Text('Lampiran', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(
                'Foto atau PDF, maksimal 10 MB per berkas. Opsional.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
              ),
              const SizedBox(height: 12),
              ..._attachments.map(
                (a) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _AttachmentRow(
                    attachment: a,
                    onRemove: () => setState(() => _attachments.remove(a)),
                  ),
                ),
              ),
              OutlinedButton.icon(
                onPressed: _addAttachment,
                icon: const Icon(Icons.attach_file_rounded, size: 18),
                label: const Text('Tambah Lampiran'),
              ),

              if (_error != null) ...[
                const SizedBox(height: 18),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: scheme.errorContainer,
                    borderRadius: BorderRadius.circular(AppRadius.control),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.error_outline_rounded, size: 18, color: scheme.onErrorContainer),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          _error!,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onErrorContainer),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _submitting ? null : _submit,
                child: _submitting
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Kirim Tiket'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LocationCard extends StatelessWidget {
  const _LocationCard({
    required this.latitude,
    required this.longitude,
    required this.fromDevice,
    required this.loading,
    required this.message,
    required this.canUseRegistered,
    required this.onUseDevice,
    required this.onUseRegistered,
    required this.onClear,
  });

  final double? latitude;
  final double? longitude;
  final bool fromDevice;
  final bool loading;
  final String? message;
  final bool canUseRegistered;
  final VoidCallback? onUseDevice;
  final VoidCallback onUseRegistered;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final brightness = Theme.of(context).brightness;
    final hasCoords = latitude != null && longitude != null;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (hasCoords) ...[
              Row(
                children: [
                  Icon(Icons.check_circle_rounded, size: 17, color: StatusColors.success(brightness)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          fromDevice ? 'Lokasi perangkat terpasang' : 'Alamat terdaftar terpasang',
                          style: Theme.of(context).textTheme.titleSmall
                              ?.copyWith(color: StatusColors.success(brightness)),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${latitude!.toStringAsFixed(6)}, ${longitude!.toStringAsFixed(6)}',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded, size: 18),
                    tooltip: 'Hapus koordinat',
                    onPressed: onClear,
                  ),
                ],
              ),
              const Divider(height: 22),
            ],
            if (message != null) ...[
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_outline_rounded, size: 17, color: scheme.onSurfaceVariant),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      message!,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
            ],
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                OutlinedButton.icon(
                  onPressed: onUseDevice,
                  icon: loading
                      ? const SizedBox(height: 15, width: 15, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.my_location_rounded, size: 17),
                  label: Text(loading ? 'Mencari lokasi...' : 'Lokasi Saat Ini'),
                  style: OutlinedButton.styleFrom(minimumSize: const Size(0, 44)),
                ),
                if (canUseRegistered)
                  OutlinedButton.icon(
                    onPressed: onUseRegistered,
                    icon: const Icon(Icons.home_outlined, size: 17),
                    label: const Text('Alamat Terdaftar'),
                    style: OutlinedButton.styleFrom(minimumSize: const Size(0, 44)),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _AttachmentRow extends StatelessWidget {
  const _AttachmentRow({required this.attachment, required this.onRemove});

  final _Attachment attachment;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final brightness = Theme.of(context).brightness;
    final failed = attachment.error != null;

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(AppRadius.control),
        border: Border.all(
          color: failed ? StatusColors.danger(brightness).withValues(alpha: 0.5) : scheme.outlineVariant,
        ),
      ),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(9),
            child: attachment.isImage
                ? Image.file(attachment.file, width: 44, height: 44, fit: BoxFit.cover)
                : Container(
                    width: 44,
                    height: 44,
                    alignment: Alignment.center,
                    color: scheme.surfaceContainerHigh,
                    child: Icon(Icons.picture_as_pdf_rounded, size: 21, color: scheme.onSurfaceVariant),
                  ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  attachment.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 2),
                if (attachment.uploading)
                  Text(
                    'Mengunggah...',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                  )
                else if (failed)
                  Text(
                    attachment.error!,
                    style: Theme.of(context).textTheme.bodySmall
                        ?.copyWith(color: StatusColors.danger(brightness)),
                  )
                else
                  Row(
                    children: [
                      Icon(Icons.check_circle_rounded, size: 13, color: StatusColors.success(brightness)),
                      const SizedBox(width: 4),
                      Text(
                        'Siap dikirim',
                        style: Theme.of(context).textTheme.bodySmall
                            ?.copyWith(color: StatusColors.success(brightness)),
                      ),
                    ],
                  ),
              ],
            ),
          ),
          if (attachment.uploading)
            const Padding(
              padding: EdgeInsets.only(left: 8),
              child: SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)),
            )
          else
            IconButton(
              icon: const Icon(Icons.delete_outline_rounded, size: 20),
              tooltip: 'Hapus lampiran',
              onPressed: onRemove,
            ),
        ],
      ),
    );
  }
}
