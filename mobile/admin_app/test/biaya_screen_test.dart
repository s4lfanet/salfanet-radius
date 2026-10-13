import 'dart:convert';

import 'package:admin_app/core/api/api_client.dart';
import 'package:admin_app/core/theme/app_theme.dart';
import 'package:admin_app/features/keuangan/biaya_screen.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

/// Answers like GET /api/keuangan/expenses and records writes.
class _Fixtures implements HttpClientAdapter {
  final requests = <RequestOptions>[];

  static Map<String, dynamic> _month(String m) => {
    'success': true,
    'month': m,
    'totalIncome': 182750000,
    'totalExpense': 41000000,
    'totalExpensePrev': 38500000,
    'net': 141750000,
    'byCategory': [
      {'id': 'bw', 'name': 'Bandwidth & Upstream', 'isActive': true, 'amount': 35000000, 'count': 1, 'previousAmount': 35000000},
      {'id': 'gaji', 'name': 'Gaji Karyawan', 'isActive': true, 'amount': 6000000, 'count': 1, 'previousAmount': 3500000},
      {'id': 'sewa', 'name': 'Sewa Tempat', 'isActive': true, 'amount': 0, 'count': 0, 'previousAmount': 0},
    ],
    'expenses': [
      {'id': '$m-1', 'categoryId': 'bw', 'amount': 35000000, 'description': 'Bayar bandwidth upstream 1 Gbps', 'date': '$m-05T03:00:00Z', 'createdBy': 'admin', 'category': {'id': 'bw', 'name': 'Bandwidth & Upstream'}},
      {'id': '$m-2', 'categoryId': 'gaji', 'amount': 6000000, 'description': 'Gaji teknisi lapangan', 'date': '$m-30T03:00:00Z', 'createdBy': 'admin', 'category': {'id': 'gaji', 'name': 'Gaji Karyawan'}},
    ],
  };

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    requests.add(options);
    final body = options.path == '/api/keuangan/expenses' && options.method == 'GET'
        ? _month(options.queryParameters['month'] as String)
        : {'success': true};
    return ResponseBody.fromString(jsonEncode(body), 200, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late _Fixtures fixtures;

  setUpAll(() async {
    await initializeDateFormatting('id_ID', null);
    final loader = FontLoader('PlusJakartaSans')..addFont(rootBundle.load('assets/fonts/PlusJakartaSans-Variable.ttf'));
    await loader.load();
  });

  setUp(() {
    fixtures = _Fixtures();
    ApiClient.instance.initForTest(fixtures);
  });

  Future<void> pump(WidgetTester tester, ThemeData theme, double width) async {
    tester.view.physicalSize = Size(width, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(theme: theme, home: const BiayaScreen()));
    await tester.pumpAndSettle();
  }

  for (final width in [320.0, 360.0]) {
    for (final theme in {'light': AppTheme.light, 'dark': AppTheme.dark}.entries) {
      testWidgets('Biaya Operasional renders and filters at ${width.toInt()}dp ${theme.key}', (tester) async {
        await pump(tester, theme.value, width);
        expect(find.text('Rp 141.750.000'), findsOneWidget);
        expect(find.textContaining('22% dari pendapatan · naik Rp 2.500.000'), findsOneWidget);
        expect(find.text('Catatan biaya · 2'), findsOneWidget);

        await tester.tap(find.text('Gaji Karyawan').first);
        await tester.pumpAndSettle();
        expect(find.text('Gaji Karyawan · 1'), findsOneWidget);
        expect(find.text('Bayar bandwidth upstream 1 Gbps'), findsNothing);
        await tester.tap(find.text('Tampilkan semua'));
        await tester.pumpAndSettle();
        expect(find.text('Catatan biaya · 2'), findsOneWidget);
      });
    }
  }

  testWidgets('Repeat copies last month to the same day, clamped to month end', (tester) async {
    await pump(tester, AppTheme.light, 360);
    await tester.tap(find.byTooltip('Ulangi biaya bulan lalu'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Biaya yang dipilih dicatat lagi'), findsOneWidget);
    await tester.tap(find.text('Salin biaya'));
    await tester.pumpAndSettle();
    final posts = fixtures.requests.where((r) => r.method == 'POST' && r.path == '/api/keuangan/transactions').toList();
    expect(posts, hasLength(2));
    final now = DateTime.now();
    final lastDay = DateTime(now.year, now.month + 1, 0).day;
    final day30 = (30 > lastDay ? lastDay : 30).toString().padLeft(2, '0');
    final dates = posts.map((p) => (p.data as Map)['date'] as String).toList();
    expect(dates.first.endsWith('-05'), isTrue);
    // A 30th lands on the 30th, or on the last day of a shorter month.
    expect(dates.last.endsWith('-$day30'), isTrue, reason: dates.last);
    expect(posts.every((p) => (p.data as Map)['type'] == 'EXPENSE'), isTrue);
  });
}
