import 'dart:convert';
import 'dart:typed_data';

import 'package:admin_app/core/api/api_client.dart';
import 'package:admin_app/core/crud/crud_list_screen.dart';
import 'package:admin_app/core/theme/app_theme.dart';
import 'package:admin_app/features/reports/report_screens.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

/// Answers each request with the JSON the matching backend route returns,
/// shaped from the route source, and records what was asked for.
class _Fixtures implements HttpClientAdapter {
  final requests = <Uri>[];

  static const _long = 'Muhammad Abdurrahman Wiryawan Kusumadinata Saputra';

  Object _body(Uri uri) => switch (uri.path) {
    '/api/admin/laporan' => {
      'success': true,
      'type': uri.queryParameters['type'],
      'rows': [
        {
          'No. Invoice': 'INV-20261001-0001',
          'Nama Pelanggan': _long,
          'Username': 'pelanggan01',
          'Telepon': '081200000000',
          'Jumlah': 250000,
          'Jumlah (Rp)': 'Rp 250.000',
          'Status': 'OVERDUE',
          'Jenis': 'Bulanan',
          'Jatuh Tempo': '10/10/2026',
          'Dibayar': '-',
          'Dibuat': '01/10/2026',
          'Catatan': '-',
        },
      ],
      'summary': {'total': 1, 'paid': 0, 'pending': 0, 'overdue': 1, 'totalAmount': 250000, 'paidAmount': 0},
    },
    '/api/hotspot/rekap-voucher' => {
      'rekap': [
        {
          'batchCode': 'BATCH-20261001-ABCDEFGHIJ',
          'createdAt': '2026-10-01T03:00:00.000Z',
          'firstLoginAt': null,
          'agent': {'id': 'a1', 'name': _long, 'phone': '0812'},
          'profile': {'id': 'p1', 'name': 'Voucher 1 Hari 5 Mbps Unlimited'},
          'router': {'id': 'r1', 'name': 'MikroTik Pusat'},
          'totalQty': 50,
          'stock': 20,
          'active': 10,
          'expired': 20,
          'sold': 30,
          'sellingPrice': 5000,
          'costPrice': 4000,
          'resellerFee': 1000,
          'totalRevenue': 150000,
          'agentProfit': 30000,
          'adminEarnings': 120000,
        },
      ],
      'dailyBreakdown': [],
      'mode': 'all',
      'agents': [
        {'id': 'a1', 'name': _long},
      ],
      'profiles': [],
    },
    '/api/hotspot/agent-report' => {
      'type': uri.queryParameters['type'],
      'periodLabel': 'Senin, 12 Okt 2026',
      'report': [
        {
          'agentId': 'a1',
          'agentName': _long,
          'agentPhone': '0812',
          'isActive': false,
          'balance': 1250000,
          'router': {'id': 'r1', 'name': 'MikroTik Pusat'},
          'totalGenerated': 50,
          'waiting': 20,
          'active': 10,
          'expired': 20,
          'sold': 30,
          'totalRevenue': 150000,
          'totalCommission': 30000,
          'adminEarnings': 120000,
          'salesCount': 3,
          'totalSalesAmount': 15000,
          'paidCount': 2,
          'paidAmount': 10000,
          'unpaidCount': 1,
          'unpaidAmount': 5000,
          'currentStock': 20,
          'stockValue': 80000,
          'profileBreakdown': [
            {'profileName': 'Voucher 1 Hari', 'generated': 50, 'waiting': 20, 'active': 10, 'expired': 20, 'sold': 30, 'revenue': 150000, 'commission': 30000},
          ],
        },
      ],
      'summary': {
        'totalAgents': 1,
        'totalGenerated': 50,
        'totalSold': 30,
        'totalRevenue': 150000,
        'totalCommission': 30000,
        'totalAdminEarnings': 120000,
        'totalStock': 20,
        'totalStockValue': 80000,
        'totalSalesAmount': 15000,
        'totalPaidAmount': 10000,
        'totalUnpaidAmount': 5000,
      },
      'agents': [
        {'id': 'a1', 'name': _long},
      ],
    },
    '/api/admin/data-usage/top' => {
      'success': true,
      'data': {
        'period_days': 30,
        'total_users': 1,
        'top_consumers': [
          {'username': 'pelanggan-dengan-username-yang-sangat-panjang', 'upload_gb': '12.345', 'download_gb': '345.678', 'total_gb': '358.023'},
        ],
      },
    },
    '/api/admin/data-usage/monthly' => {
      'success': true,
      'data': {
        'period': '2026-09',
        'total_users': 1,
        'total_upload_gb': '12.345',
        'total_download_gb': '345.678',
        'users': [
          {'username': 'pelanggan01', 'upload_gb': '12.345', 'download_gb': '345.678', 'total_gb': '358.023', 'periods': 30},
        ],
      },
    },
    '/api/admin/isolated-users' => {
      'success': true,
      'data': [
        {
          'id': 'u1',
          'username': 'pelanggan01',
          'name': _long,
          'phone': '081200000000',
          'status': 'isolated',
          'expiredAt': '2026-10-01T00:00:00.000Z',
          'customerId': 'CUST-0001',
          'areaName': 'Area Kecamatan Sukamaju Selatan',
          'profileName': 'PAKET-FIBER-100MBPS-UNLIMITED',
          'profilePrice': 250000,
          'unpaidInvoicesCount': 1,
          'totalUnpaid': 250000,
          'unpaidInvoices': [
            {'id': 'i1', 'amount': 250000, 'invoiceNumber': 'INV-20261001-0001', 'dueDate': '2026-10-10T00:00:00.000Z', 'status': 'OVERDUE', 'paymentLink': null, 'paymentToken': 'tok123'},
          ],
          'isOnline': true,
          'ipAddress': '10.255.0.12',
          'loginTime': '2026-10-12T01:00:00.000Z',
          'nasIp': '10.0.0.1',
        },
      ],
      'stats': {},
    },
    '/api/network/trace' => uri.queryParameters['type'] == 'device'
        ? {'deviceType': 'ODC', 'deviceId': 'd1', 'spliceCount': 0, 'splices': []}
        : {
            'startCore': {'id': 'c1', 'tubeNumber': 1, 'coreNumber': 3, 'cableId': 'k1', 'cableName': 'Feeder Utara'},
            'steps': [
              {'order': 1, 'type': 'DEVICE', 'deviceType': 'JOINT_CLOSURE', 'deviceId': 'j1', 'deviceName': _long, 'tubeNumber': 1, 'coreNumber': 3, 'spliceType': 'FUSION', 'attenuation': 0.1, 'cumulativeAttenuation': 0.45, 'notes': ''},
            ],
            'totalAttenuation': 0.45,
            'signalBudget': {'oltTxPower': 3, 'totalAttenuation': 0.45, 'expectedSignal': 2.55, 'onuSensitivity': -28, 'safetyMargin': 3, 'isWithinBudget': true, 'margin': 27.55},
            'visitedDevices': ['j1'],
          },
    '/api/network/cores' => {
      'cores': [
        {'id': 'c1', 'coreNumber': 3, 'colorName': 'Hijau', 'status': 'AVAILABLE', 'tube': {'tubeNumber': 1, 'cable': {'code': 'FDR-01'}}},
      ],
    },
    _ => {'error': 'no fixture for ${uri.path}'},
  };

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    requests.add(options.uri);
    final body = _body(options.uri);
    final status = body is Map && body['error'] != null ? 404 : 200;
    return ResponseBody.fromString(jsonEncode(body), status, headers: {
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

  Future<void> pump(WidgetTester tester, Widget screen, ThemeData theme, double width) async {
    tester.view.physicalSize = Size(width, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(theme: theme, home: screen));
    await tester.pumpAndSettle();
  }

  // Chip rows scroll sideways on narrow phones; bring the chip into view first.
  Future<void> tapChip(WidgetTester tester, String label) async {
    final chip = find.text(label).first;
    await tester.ensureVisible(chip);
    await tester.pumpAndSettle();
    await tester.tap(chip);
    await tester.pumpAndSettle();
  }

  Future<void> openFirstTileAndClose(WidgetTester tester, Finder tile, String expectInSheet) async {
    await tester.tap(tile.last);
    await tester.pumpAndSettle();
    expect(find.text(expectInSheet), findsWidgets);
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();
  }

  for (final width in [320.0, 360.0]) {
    for (final theme in {'light': AppTheme.light, 'dark': AppTheme.dark}.entries) {
      final label = '${width.toInt()}dp ${theme.key}';

      testWidgets('Laporan renders, switches type, opens a row at $label', (tester) async {
        await pump(tester, const LaporanScreen(), theme.value, width);
        expect(find.text('Sudah dibayar'), findsOneWidget);
        expect(find.text('Jatuh tempo'), findsWidgets);
        await openFirstTileAndClose(tester, find.text('Rp 250.000'), 'INV-20261001-0001');
        await tapChip(tester, 'Pembayaran');
        expect(fixtures.requests.last.queryParameters['type'], 'payment');
        expect(fixtures.requests.last.queryParameters['status'], 'all');
      });

      testWidgets('Rekap Voucher renders batches and sends period params at $label', (tester) async {
        await pump(tester, const RekapVoucherScreen(), theme.value, width);
        expect(find.text('BATCH-20261001-ABCDEFGHIJ'), findsOneWidget);
        expect(find.text('30 dari 50 terjual · stok 20'), findsOneWidget);
        await openFirstTileAndClose(tester, find.text('BATCH-20261001-ABCDEFGHIJ'), 'Harga per voucher');
        await tapChip(tester, 'Minggu ini');
        final week = DateTime.parse(fixtures.requests.last.queryParameters['week']!);
        expect(week.weekday, DateTime.monday);
      });

      testWidgets('Laporan Agent renders and opens breakdown at $label', (tester) async {
        await pump(tester, const AgentReportScreen(), theme.value, width);
        expect(find.text('Nonaktif'), findsOneWidget);
        expect(find.text('Senin, 12 Okt 2026'), findsOneWidget);
        await openFirstTileAndClose(tester, find.text('30 terjual · stok 20'), 'Voucher di periode ini');
        await tapChip(tester, 'Bulan lalu');
        expect(fixtures.requests.last.queryParameters['type'], 'monthly');
      });

      testWidgets('Pemakaian Data top and monthly views at $label', (tester) async {
        await pump(tester, const DataUsageScreen(), theme.value, width);
        expect(find.text('358.023 GB'), findsOneWidget);
        await tapChip(tester, 'Bulan lalu');
        final q = fixtures.requests.last;
        expect(q.path, '/api/admin/data-usage/monthly');
        // Zero-based month, as the route expects.
        final now = DateTime.now();
        final last = DateTime(now.year, now.month - 1);
        expect(q.queryParameters['month'], '${last.month - 1}');
        expect(find.text('Hari tercatat'), findsNothing);
        await openFirstTileAndClose(tester, find.text('pelanggan01'), 'Hari tercatat');
      });

      testWidgets('Pelanggan Terisolir list, filter and detail at $label', (tester) async {
        await pump(tester, CrudListScreen(config: isolatedUsersConfig()), theme.value, width);
        expect(find.text('Tunggakan pelanggan terisolir'), findsOneWidget);
        await tapChip(tester, 'Offline');
        expect(find.text('@pelanggan01 · PAKET-FIBER-100MBPS-UNLIMITED'), findsNothing);
        await tapChip(tester, 'Online');
        await tester.tap(find.text('@pelanggan01 · PAKET-FIBER-100MBPS-UNLIMITED'));
        await tester.pumpAndSettle();
        expect(find.text('ID pelanggan'), findsOneWidget);
        final sheet = find.byType(Scrollable).last;
        await tester.dragUntilVisible(find.text('Koneksi'), sheet, const Offset(0, -150));
        await tester.dragUntilVisible(find.text('Tagihan belum dibayar'), sheet, const Offset(0, -150));
        expect(find.text('INV-20261001-0001'), findsOneWidget);
        await tester.dragUntilVisible(find.text('Kirim link bayar'), sheet, const Offset(0, -150));
        await tester.tap(find.text('Kirim link bayar'));
        await tester.pumpAndSettle();
        // Token-only invoices get a link on the server the app is signed in to.
        expect(find.textContaining('https://isp.test/pay/tok123'), findsOneWidget);
        expect(find.text('081200000000'), findsOneWidget);
      });

      testWidgets('Trace Fiber empty state, then a core trace at $label', (tester) async {
        await pump(tester, const FiberTraceScreen(), theme.value, width);
        expect(find.text('Pilih core atau perangkat'), findsOneWidget);
        await tester.tap(find.text('Telusuri'));
        await tester.pumpAndSettle();
        await tester.tap(find.ancestor(of: find.text('Core *'), matching: find.byType(InputDecorator)));
        await tester.pumpAndSettle();
        await tester.tap(find.textContaining('FDR-01 T1 C3').last);
        await tester.pumpAndSettle();
        await tester.tap(find.text('Telusuri').last);
        await tester.pumpAndSettle();
        expect(fixtures.requests.last.queryParameters, containsPair('coreId', 'c1'));
        expect(find.text('0.45 dB'), findsWidgets);
        expect(find.text('Telusuri lagi'), findsOneWidget);
      });
    }
  }
}
