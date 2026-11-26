import 'dart:typed_data';

import 'package:esc_pos_utils_plus/esc_pos_utils_plus.dart';
import 'package:flutter/material.dart';
import 'package:image/image.dart' as img;
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';
import 'package:pdf/pdf.dart' show PdfPageFormat;
import 'package:printing/printing.dart';

import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/dialogs.dart';

/// Buka sheet cetak untuk daftar voucher (A4 biasa atau thermal Bluetooth).
Future<void> showVoucherPrintSheet(BuildContext context, List<Map<String, dynamic>> vouchers) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => _PrintSheet(vouchers: vouchers),
  );
}

enum _Mode { a4, thermalTheme, thermalText }

class _PrintSheet extends StatefulWidget {
  const _PrintSheet({required this.vouchers});
  final List<Map<String, dynamic>> vouchers;

  @override
  State<_PrintSheet> createState() => _PrintSheetState();
}

class _PrintSheetState extends State<_PrintSheet> {
  static String? _lastMac;

  List<Map<String, dynamic>> _templates = [];
  String? _templateId;
  _Mode _mode = _Mode.a4;
  String _paper = '58';
  List<BluetoothInfo> _devices = [];
  String? _mac;
  bool _loadingTpl = true;
  bool _loadingDev = false;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadTemplates();
  }

  Future<void> _loadTemplates() async {
    try {
      final res = await ApiClient.instance.get('/api/agent/voucher-templates');
      final list = ((res is Map ? res['templates'] : null) as List?)?.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() ?? [];
      if (!mounted) return;
      setState(() {
        _templates = list;
        final def = list.where((t) => t['isDefault'] == true);
        _templateId = (def.isNotEmpty ? def.first : (list.isNotEmpty ? list.first : null))?['id']?.toString();
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loadingTpl = false);
    }
  }

  Future<void> _loadDevices() async {
    setState(() {
      _loadingDev = true;
      _error = null;
    });
    try {
      final on = await PrintBluetoothThermal.bluetoothEnabled;
      if (!on) {
        setState(() => _error = 'Bluetooth belum aktif. Nyalakan Bluetooth lalu coba lagi.');
        return;
      }
      final list = await PrintBluetoothThermal.pairedBluetooths;
      if (!mounted) return;
      setState(() {
        _devices = list;
        if (list.isEmpty) {
          _error = 'Tidak ada printer yang dipasangkan. Pasangkan printer thermal di pengaturan Bluetooth HP dulu.';
        } else {
          _mac = list.any((d) => d.macAdress == _lastMac) ? _lastMac : list.first.macAdress;
        }
      });
    } catch (e) {
      if (mounted) setState(() => _error = 'Gagal membaca perangkat Bluetooth. Izinkan akses Bluetooth untuk aplikasi.');
    } finally {
      if (mounted) setState(() => _loadingDev = false);
    }
  }

  List<String> get _codes => [for (final v in widget.vouchers) if (v['code'] != null) v['code'].toString()];

  Future<String> _fetchHtml(String paper) async {
    final res = await ApiClient.instance.post('/api/agent/vouchers/print-html', data: {
      'codes': _codes,
      if (_templateId != null) 'templateId': _templateId,
      'paper': paper,
    });
    final html = res is Map ? res['html']?.toString() : null;
    if (html == null || html.isEmpty) throw ApiException('Template voucher kosong.');
    return html;
  }

  Future<void> _print() async {
    if (_codes.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      switch (_mode) {
        case _Mode.a4:
          final html = await _fetchHtml('a4');
          await Printing.layoutPdf(
            name: 'Voucher WiFi',
            onLayout: (format) => Printing.convertHtml(format: format, html: html),
          );
        case _Mode.thermalTheme:
          if (_mac == null) throw ApiException('Pilih printer thermal.');
          final bytes = await _themeBytes();
          await _send(bytes);
        case _Mode.thermalText:
          if (_mac == null) throw ApiException('Pilih printer thermal.');
          final bytes = await _textBytes();
          await _send(bytes);
      }
      if (mounted && _mode != _Mode.a4) showToast(context, 'Dikirim ke printer');
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = 'Gagal mencetak: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _send(List<int> bytes) async {
    _lastMac = _mac;
    final ok = await PrintBluetoothThermal.connect(macPrinterAddress: _mac!);
    if (!ok) throw ApiException('Tidak bisa terhubung ke printer. Pastikan printer menyala dan dekat.');
    try {
      final sent = await PrintBluetoothThermal.writeBytes(bytes);
      if (!sent) throw ApiException('Data gagal dikirim ke printer.');
    } finally {
      await PrintBluetoothThermal.disconnect;
    }
  }

  /// Tema voucher admin → PDF → raster → ESC/POS.
  Future<List<int>> _themeBytes() async {
    final html = await _fetchHtml(_paper);
    final mm = _paper == '58' ? 58.0 : 80.0;
    final pdf = await Printing.convertHtml(
      format: PdfPageFormat(mm * PdfPageFormat.mm, 300 * PdfPageFormat.mm, marginAll: 0),
      html: html,
    );
    final profile = await CapabilityProfile.load();
    final gen = Generator(_paper == '58' ? PaperSize.mm58 : PaperSize.mm80, profile);
    final targetW = _paper == '58' ? 384 : 576;
    final out = <int>[...gen.reset()];
    await for (final page in Printing.raster(pdf, dpi: 203)) {
      final png = await page.toPng();
      var image = img.decodeImage(png);
      if (image == null) continue;
      image = _trimBottom(image);
      if (image.width != targetW) image = img.copyResize(image, width: targetW);
      out.addAll(gen.imageRaster(image, align: PosAlign.center));
      out.addAll(gen.feed(1));
    }
    out.addAll(gen.feed(2));
    out.addAll(gen.cut());
    return out;
  }

  img.Image _trimBottom(img.Image im) {
    var last = im.height - 1;
    bool rowBlank(int y) {
      for (var x = 0; x < im.width; x += 2) {
        final p = im.getPixel(x, y);
        if (p.r < 245 || p.g < 245 || p.b < 245) return false;
      }
      return true;
    }
    while (last > 0 && rowBlank(last)) {
      last--;
    }
    final h = (last + 12).clamp(1, im.height);
    return img.copyCrop(im, x: 0, y: 0, width: im.width, height: h);
  }

  /// Teks polos ESC/POS (cepat, tidak butuh rendering).
  Future<List<int>> _textBytes() async {
    final profile = await CapabilityProfile.load();
    final gen = Generator(_paper == '58' ? PaperSize.mm58 : PaperSize.mm80, profile);
    final out = <int>[...gen.reset()];
    for (final v in widget.vouchers) {
      final code = (v['code'] ?? '').toString();
      final pass = (v['password'] ?? '').toString();
      out.addAll(gen.text('VOUCHER WIFI', styles: const PosStyles(align: PosAlign.center, bold: true)));
      final pkg = (v['profileName'] ?? '').toString();
      if (pkg.isNotEmpty) out.addAll(gen.text(pkg, styles: const PosStyles(align: PosAlign.center)));
      out.addAll(gen.hr());
      if (pass.isNotEmpty && pass != code) {
        out.addAll(gen.text('Username', styles: const PosStyles(align: PosAlign.center)));
        out.addAll(gen.text(code, styles: const PosStyles(align: PosAlign.center, bold: true, height: PosTextSize.size2, width: PosTextSize.size2)));
        out.addAll(gen.text('Password', styles: const PosStyles(align: PosAlign.center)));
        out.addAll(gen.text(pass, styles: const PosStyles(align: PosAlign.center, bold: true, height: PosTextSize.size2, width: PosTextSize.size2)));
      } else {
        out.addAll(gen.text('Kode voucher', styles: const PosStyles(align: PosAlign.center)));
        out.addAll(gen.text(code, styles: const PosStyles(align: PosAlign.center, bold: true, height: PosTextSize.size2, width: PosTextSize.size2)));
      }
      out.addAll(gen.hr());
      final validity = (v['validity'] ?? '').toString();
      final speed = (v['speed'] ?? '').toString();
      final price = numOf(v, 'sellingPrice');
      if (validity.isNotEmpty) out.addAll(gen.text('Masa aktif: $validity', styles: const PosStyles(align: PosAlign.center)));
      if (speed.isNotEmpty) out.addAll(gen.text('Kecepatan: $speed', styles: const PosStyles(align: PosAlign.center)));
      if (price > 0) out.addAll(gen.text('Harga: ${formatCurrency(price)}', styles: const PosStyles(align: PosAlign.center)));
      out.addAll(gen.feed(2));
      out.addAll(gen.cut());
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final thermal = _mode != _Mode.a4;
    final inset = MediaQuery.viewPaddingOf(context).bottom;
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(Gap.page, Gap.md, Gap.page, inset + Gap.page),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Cetak Voucher', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 2),
          Text('${widget.vouchers.length} voucher', style: TextStyle(fontSize: 12.5, color: c.onSurfaceVariant)),
          const SizedBox(height: Gap.lg),
          if (_loadingTpl)
            const LinearProgressIndicator()
          else if (_templates.isNotEmpty)
            DropdownButtonFormField<String>(
              value: _templateId,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Desain voucher'),
              items: [for (final t in _templates) DropdownMenuItem(value: t['id'].toString(), child: Text('${t['name']}${t['isDefault'] == true ? ' (default)' : ''}', overflow: TextOverflow.ellipsis))],
              onChanged: (v) => setState(() => _templateId = v),
            )
          else
            Text('Belum ada desain voucher aktif; memakai tampilan standar.', style: TextStyle(fontSize: 12.5, color: c.onSurfaceVariant)),
          const SizedBox(height: Gap.md),
          SegmentedButton<_Mode>(
            showSelectedIcon: false,
            segments: const [
              ButtonSegment(value: _Mode.a4, label: Text('A4'), icon: Icon(Icons.description_outlined, size: 18)),
              ButtonSegment(value: _Mode.thermalTheme, label: Text('Thermal'), icon: Icon(Icons.receipt_long_outlined, size: 18)),
              ButtonSegment(value: _Mode.thermalText, label: Text('Teks'), icon: Icon(Icons.text_snippet_outlined, size: 18)),
            ],
            selected: {_mode},
            onSelectionChanged: (s) {
              setState(() => _mode = s.first);
              if (s.first != _Mode.a4 && _devices.isEmpty) _loadDevices();
            },
          ),
          const SizedBox(height: 6),
          Text(
            switch (_mode) {
              _Mode.a4 => 'Cetak ke printer biasa atau simpan PDF, sesuai desain voucher admin.',
              _Mode.thermalTheme => 'Printer thermal Bluetooth dengan desain voucher admin (dicetak sebagai gambar).',
              _Mode.thermalText => 'Printer thermal Bluetooth, teks polos — paling cepat dan paling kompatibel.',
            },
            style: TextStyle(fontSize: 12, color: c.onSurfaceVariant),
          ),
          if (thermal) ...[
            const SizedBox(height: Gap.md),
            SegmentedButton<String>(
              showSelectedIcon: false,
              segments: const [ButtonSegment(value: '58', label: Text('Kertas 58 mm')), ButtonSegment(value: '80', label: Text('Kertas 80 mm'))],
              selected: {_paper},
              onSelectionChanged: (s) => setState(() => _paper = s.first),
            ),
            const SizedBox(height: Gap.md),
            Row(
              children: [
                Expanded(
                  child: _devices.isEmpty
                      ? Text(_loadingDev ? 'Mencari printer…' : 'Belum ada printer dipilih', style: TextStyle(color: c.onSurfaceVariant))
                      : DropdownButtonFormField<String>(
                          value: _mac,
                          isExpanded: true,
                          decoration: const InputDecoration(labelText: 'Printer'),
                          items: [for (final d in _devices) DropdownMenuItem(value: d.macAdress, child: Text(d.name, overflow: TextOverflow.ellipsis))],
                          onChanged: (v) => setState(() => _mac = v),
                        ),
                ),
                IconButton(onPressed: _loadingDev ? null : _loadDevices, tooltip: 'Cari printer', icon: const Icon(Icons.bluetooth_searching_rounded)),
              ],
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: Gap.md),
            Text(_error!, style: TextStyle(color: context.tone(Tone.danger), fontWeight: FontWeight.w600)),
          ],
          const SizedBox(height: Gap.lg),
          FilledButton.icon(
            onPressed: _busy || _loadingTpl ? null : _print,
            icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.print_rounded, size: 20),
            label: Text(_busy ? 'Menyiapkan…' : 'Cetak'),
          ),
        ],
      ),
    );
  }
}
