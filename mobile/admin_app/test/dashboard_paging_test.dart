import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:admin_app/core/api/api_client.dart';
import 'package:admin_app/core/crud/crud_list_screen.dart';
import 'package:admin_app/core/theme/app_theme.dart';
import 'package:admin_app/features/auth/auth_provider.dart';
import 'package:admin_app/features/dashboard/dashboard_provider.dart';
import 'package:admin_app/features/dashboard/dashboard_screen.dart';
import 'package:admin_app/features/notifications/notifications_provider.dart';
import 'package:admin_app/models/admin_user.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

/// Responses shaped from the dashboard routes and a paginated list route.
class _Fixtures implements HttpClientAdapter {
  final requests = <Uri>[];

  static const _long = 'Muhammad Abdurrahman Wiryawan Kusumadinata Saputra';

  Object _body(Uri uri) {
    final q = uri.queryParameters;
    switch (uri.path) {
      case '/api/dashboard/stats':
        final current = q['month'] == null;
        return {
          'success': true,
          'stats': {
            'totalPppoeUsers': 1240,
            'activePppoeUsers': 1180,
            'activeSessionsPPPoE': 1102,
            'activeSessionsHotspot': 37,
            'unusedVouchers': 450,
            'isolatedCount': 21,
            'suspendedCount': 3,
            'newRegistrations': 4,
            'upcomingInvoices': [
              {'invoiceNumber': 'INV-20261005-0001', 'customerName': _long, 'customerUsername': 'u1', 'amount': 250000, 'dueDate': '2026-10-05T00:00:00Z', 'status': 'OVERDUE', 'daysUntilDue': -8},
              {'invoiceNumber': 'INV-20261013-0002', 'customerName': 'Siti', 'customerUsername': 'u2', 'amount': 150000, 'dueDate': '2026-10-13T00:00:00Z', 'status': 'PENDING', 'daysUntilDue': 0},
              {'invoiceNumber': 'INV-20261016-0003', 'customerName': 'Budi', 'customerUsername': 'u3', 'amount': 175000, 'dueDate': '2026-10-16T00:00:00Z', 'status': 'PENDING', 'daysUntilDue': 3},
            ],
            'voucherRevenueFormatted': 'Rp 3.450.000',
            'voucherRevenueTodayFormatted': 'Rp 120.000',
            'invoiceRevenueFormatted': 'Rp 182.750.000',
            'invoiceRevenueTodayFormatted': 'Rp 4.500.000',
            'invoiceCountToday': 18,
            'invoiceCountMonth': 1150,
            'unpaidInvoicesCount': 96,
            'totalAllTimeRevenueFormatted': 'Rp 2.481.300.000',
          },
          'activities': [
            {'id': 'a1', 'user': 'admin', 'action': 'Menyetujui pembayaran INV-20261012-0007', 'time': '2026-10-13T02:00:00Z', 'status': 'success'},
          ],
          'systemStatus': {'radius': true, 'database': true, 'api': true},
          'agentSales': [
            {'agentId': 'g1', 'agentName': _long, 'sold': 120, 'revenue': 600000},
          ],
          'agentSalesTotal': {'count': 120, 'revenue': 600000},
          'radiusAuthStats': {'acceptToday': 812, 'rejectToday': 14},
          'periodLabel': current ? 'Oktober 2026' : 'September 2026',
          'monthKey': q['month'] ?? '2026-10',
          'isCurrentMonth': current,
        };
      case '/api/dashboard/payment-activity':
        return {
          'success': true,
          'activities': [
            {'id': 'i9', 'invoiceNumber': 'INV-20261012-0007', 'customerName': 'Dewi', 'amount': 200000, 'paidAt': '2026-10-13T01:00:00Z', 'methodLabel': 'transfer', 'actorLabel': 'Transfer disetujui admin'},
          ],
        };
      case '/api/dashboard/new-customers':
        return {
          'success': true,
          'count': 1,
          'customers': [
            {'id': 'c1', 'name': 'Andi', 'username': 'andi', 'createdAt': '2026-10-02T00:00:00Z', 'profile': {'name': '20 Mbps'}, 'area': {'name': 'Utara'}},
          ],
        };
      case '/api/dashboard/analytics':
        return {
          'success': true,
          'data': {
            'financial': {
              'incomeExpense': [
                {'month': 'Sep', 'income': 170000000, 'expense': 30000000},
                {'month': 'Okt', 'income': 90000000, 'expense': 120000000},
              ],
            },
          },
        };
      case '/api/test/paged':
        final page = int.parse(q['page'] ?? '1');
        final limit = int.parse(q['limit'] ?? '0');
        final rows = [for (var i = 0; i < 230; i++) {'id': 'r$i', 'name': 'Baris ${i + 1}'}];
        return {
          'rows': rows.skip((page - 1) * limit).take(limit).toList(),
          'pagination': {'page': page, 'limit': limit, 'total': rows.length, 'totalPages': (rows.length / limit).ceil()},
        };
      default:
        return {'success': true};
    }
  }

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    requests.add(options.uri);
    return ResponseBody.fromString(jsonEncode(_body(options.uri)), 200, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

final _shotKey = GlobalKey();

/// Saves the rendered screen when SHOT_DIR is set, for eyeballing lines and
/// spacing; a no-op in normal runs.
Future<void> _shot(WidgetTester tester, String name) async {
  final dir = Platform.environment['SHOT_DIR'];
  if (dir == null) return;
  await tester.runAsync(() async {
    final boundary = _shotKey.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 2);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await File('$dir/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
  });
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

  Future<void> pump(WidgetTester tester, Widget child, ThemeData theme, double width, {double height = 2600}) async {
    tester.view.physicalSize = Size(width, height);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider(create: (_) => AuthProvider()..user = AdminUser(id: '1', username: 'admin', name: 'Rina Kartika', role: 'ADMIN')),
          ChangeNotifierProvider(create: (_) => DashboardProvider()),
          ChangeNotifierProvider(create: (_) => NotificationsProvider()),
        ],
        child: MaterialApp(theme: theme, home: RepaintBoundary(key: _shotKey, child: child)),
      ),
    );
    await tester.pumpAndSettle();
  }

  for (final width in [320.0, 360.0]) {
    for (final theme in {'light': AppTheme.light, 'dark': AppTheme.dark}.entries) {
      final label = '${width.toInt()}dp ${theme.key}';

      testWidgets('Dashboard shows every panel the web has at $label', (tester) async {
        await pump(tester, const DashboardScreen(), theme.value, width);
        await _shot(tester, 'dashboard-${width.toInt()}-${theme.key}');
        for (final text in [
          'Rp 182.750.000',
          'Perlu Tindakan',
          '3 jatuh tempo dalam 7 hari atau sudah lewat',
          'Jatuh Tempo 7 Hari',
          'Lewat 8 hari',
          'Hari ini',
          '3 hari lagi',
          'Pembayaran Terbaru',
          'Stok voucher',
          'Login RADIUS',
          'Penjualan Agent',
          'Pelanggan Baru · 1',
          'Kas 6 Bulan',
          '−Rp 30.000.000',
          'Aktivitas Terbaru',
        ]) {
          expect(find.text(text), findsWidgets, reason: text);
        }
        expect(find.textContaining('total sepanjang waktu Rp 2.481.300.000'), findsOneWidget);
      });

      testWidgets('Dashboard month picker refetches that month at $label', (tester) async {
        await pump(tester, const DashboardScreen(), theme.value, width);
        await tester.tap(find.text('Oktober 2026').first);
        await tester.pumpAndSettle();
        await tester.tap(find.text('September 2026').last);
        await tester.pumpAndSettle();
        final stats = fixtures.requests.lastWhere((u) => u.path == '/api/dashboard/stats');
        expect(stats.queryParameters['month'], isNotNull);
        // "Today" figures are hidden for a past month.
        expect(find.text('Invoice hari ini'), findsNothing);
        expect(find.text('Invoice terbit'), findsOneWidget);
      });
    }
  }

  testWidgets('Paged lists load the next page on scroll and say how much is loaded', (tester) async {
    final config = CrudConfig(
      title: 'Uji',
      noun: 'Baris',
      icon: Icons.list,
      fetch: (q) => ApiClient.instance.get('/api/test/paged', query: q),
      listKey: 'rows',
      pageSize: 100,
      titleOf: (r) => '${r['name']}',
    );
    await pump(tester, CrudListScreen(config: config), AppTheme.light, 360, height: 800);
    expect(find.text('100 dari 230 dimuat · gulir untuk memuat lagi'), findsOneWidget);
    await tester.dragUntilVisible(find.text('Baris 150'), find.byType(Scrollable).last, const Offset(0, -600));
    await tester.pumpAndSettle();
    expect(fixtures.requests.where((u) => u.path == '/api/test/paged').map((u) => u.queryParameters['page']), containsAll(['1', '2']));
    await tester.dragUntilVisible(find.text('Baris 230'), find.byType(Scrollable).last, const Offset(0, -900));
    await tester.pumpAndSettle();
    expect(find.textContaining('dimuat'), findsNothing);
  });
}
