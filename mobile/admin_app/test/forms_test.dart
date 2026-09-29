import 'package:admin_app/core/crud/crud_list_screen.dart';
import 'package:admin_app/core/forms/field_spec.dart';
import 'package:admin_app/core/forms/form_screen.dart';
import 'package:admin_app/core/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

/// Every add/edit screen goes through FormScreen, so its payload rules are
/// what the backend actually receives. These pin the web-parity choices.
void main() {
  setUpAll(() async {
    await initializeDateFormatting('id_ID');
    final loader = FontLoader('PlusJakartaSans')..addFont(rootBundle.load('assets/fonts/PlusJakartaSans-Variable.ttf'));
    await loader.load();
  });

  Future<Map<String, dynamic>?> submit(WidgetTester tester, List<FieldSpec> fields, {Map<String, dynamic>? initial, void Function()? fill}) async {
    Map<String, dynamic>? sent;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: FormScreen(title: 'Uji', fields: fields, initial: initial, onSubmit: (v) async => sent = v),
      ),
    );
    await tester.pumpAndSettle();
    fill?.call();
    await tester.pump();
    await tester.tap(find.text('Simpan'));
    await tester.pumpAndSettle();
    return sent;
  }

  testWidgets('blank text/select send "", blank number null, blank date omitted (zod/web parity)', (tester) async {
    final sent = await submit(tester, const [
      FieldSpec('name', 'Nama'),
      FieldSpec('price', 'Harga', type: FieldType.integer),
      FieldSpec('areaId', 'Area', type: FieldType.select, options: [('a', 'A')]),
      FieldSpec('expiredAt', 'Sampai', type: FieldType.date),
      FieldSpec('password', 'Password', type: FieldType.password, omitWhenEmpty: true),
      FieldSpec('note', 'Catatan', nullWhenEmpty: true),
    ]);
    expect(sent, isNotNull);
    expect(sent!['name'], '');
    expect(sent['price'], isNull);
    expect(sent['areaId'], '');
    expect(sent.containsKey('expiredAt'), isFalse);
    expect(sent.containsKey('password'), isFalse);
    expect(sent['note'], isNull);
  });

  testWidgets('numbers parse, toggles are bools, hidden fields are dropped', (tester) async {
    final sent = await submit(
      tester,
      [
        const FieldSpec('qty', 'Jumlah', type: FieldType.integer),
        const FieldSpec('rate', 'Tarif', type: FieldType.decimal),
        const FieldSpec('on', 'Aktif', type: FieldType.toggle, initial: true),
        FieldSpec('extra', 'Tambahan', visibleIf: (v) => v['on'] == false),
      ],
      initial: {'qty': 12, 'rate': '2,5', 'extra': 'x'},
    );
    expect(sent!['qty'], 12);
    expect(sent['rate'], 2.5);
    expect(sent['on'], true);
    expect(sent.containsKey('extra'), isFalse);
  });

  testWidgets('required fields block submit and show an error banner', (tester) async {
    final sent = await submit(tester, const [FieldSpec('name', 'Nama', required: true)]);
    expect(sent, isNull);
    expect(find.text('Nama wajib diisi'), findsOneWidget);
    expect(find.text('Periksa kembali isian yang ditandai.'), findsOneWidget);
  });

  testWidgets('location field sends both coordinates', (tester) async {
    final sent = await submit(
      tester,
      const [FieldSpec('latitude', 'Lokasi', type: FieldType.location, pairKey: 'longitude', required: true)],
      initial: {'latitude': '-6.2', 'longitude': '106.8'},
    );
    expect(sent!['latitude'], '-6.2');
    expect(sent['longitude'], '106.8');
  });

  for (final width in [320.0, 360.0]) {
    testWidgets('form with every field type fits at ${width.toInt()}dp', (tester) async {
      tester.view.physicalSize = Size(width, 1600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: FormScreen(
            title: 'Tambah Pelanggan dengan judul yang sangat panjang sekali',
            secondary: [FormAction('Tes koneksi', Icons.network_check_rounded, (_) async => null)],
            fields: const [
              FieldSpec.section('Data pelanggan yang cukup panjang judulnya'),
              FieldSpec.note('Catatan panjang yang menjelaskan isi form ini kepada staf di lapangan agar tidak salah isi.'),
              FieldSpec('name', 'Nama lengkap pelanggan sesuai KTP', required: true, helper: 'Helper panjang yang bisa sampai dua baris di layar sempit.'),
              FieldSpec('profileId', 'Paket', type: FieldType.select, options: [('p', 'PAKET-FIBER-100MBPS-UNLIMITED-PREMIUM · Rp 1.250.000')]),
              FieldSpec('tags', 'Router', type: FieldType.multiSelect, options: [('a', 'Router A'), ('b', 'Router B')]),
              FieldSpec('on', 'Isolir otomatis saat jatuh tempo tagihan bulanan', type: FieldType.toggle, helper: 'Penjelasan toggle.'),
              FieldSpec('date', 'Tanggal', type: FieldType.date),
              FieldSpec('time', 'Jam', type: FieldType.time),
              FieldSpec('latitude', 'Lokasi', type: FieldType.location, pairKey: 'longitude'),
              FieldSpec('pw', 'Password', type: FieldType.password),
              FieldSpec('notes', 'Catatan', type: FieldType.multiline),
            ],
            initial: const {
              'profileId': 'p',
              'tags': ['a', 'b'],
              'date': '2026-09-29',
            },
            onSubmit: (_) async {},
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('CrudListScreen lists, searches locally and opens the detail sheet', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: CrudListScreen(
          config: CrudConfig(
            title: 'Area',
            noun: 'Area',
            icon: Icons.map_rounded,
            fetch: (_) async => {
              'areas': [
                {'id': '1', 'name': 'Sukamaju', 'isActive': true},
                {'id': '2', 'name': 'Cibubur', 'isActive': false},
              ],
            },
            listKey: 'areas',
            titleOf: (a) => a['name'] as String,
            fields: (_) => const [FieldSpec('name', 'Nama area'), FieldSpec('isActive', 'Aktif', type: FieldType.toggle)],
            create: (_) async {},
            update: (_, __) async {},
            delete: (_) async {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Sukamaju'), findsOneWidget);
    expect(find.text('Tambah Area'), findsOneWidget);

    await tester.enterText(find.byType(TextField).first, 'cib');
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pumpAndSettle();
    expect(find.text('Sukamaju'), findsNothing);
    expect(find.text('Cibubur'), findsOneWidget);

    await tester.tap(find.text('Cibubur'));
    await tester.pumpAndSettle();
    expect(find.text('Edit'), findsOneWidget);
    expect(find.text('Hapus'), findsOneWidget);
    // Default detail section derives rows from the form fields.
    expect(find.text('Tidak'), findsOneWidget);
  });
}
