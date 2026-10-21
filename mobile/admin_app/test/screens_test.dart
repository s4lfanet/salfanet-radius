import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:admin_app/core/api/api_client.dart';
import 'package:admin_app/core/theme/app_theme.dart';
import 'package:admin_app/core/theme/theme_controller.dart';
import 'package:admin_app/features/auth/auth_provider.dart';
import 'package:admin_app/features/auth/login_screen.dart';
import 'package:admin_app/features/dashboard/dashboard_provider.dart';
import 'package:admin_app/features/invoices/invoice_detail_screen.dart';
import 'package:admin_app/features/invoices/invoice_provider.dart';
import 'package:admin_app/features/notifications/notifications_provider.dart';
import 'package:admin_app/features/notifications/notifications_screen.dart';
import 'package:admin_app/features/pppoe/pppoe_detail_screen.dart';
import 'package:admin_app/features/pppoe/pppoe_provider.dart';
import 'package:admin_app/core/guides/guides.dart';
import 'package:admin_app/features/pppoe/pppoe_list_screen.dart';
import 'package:admin_app/features/network_map/network_map_screen.dart';
import 'package:admin_app/features/profile/profile_screen.dart';
import 'package:admin_app/features/registrations/registration_provider.dart';
import 'package:admin_app/features/shell/main_shell.dart';
import 'package:admin_app/features/tickets/ticket_list_screen.dart';
import 'package:admin_app/models/admin_user.dart';
import 'package:admin_app/models/invoice.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

const _long = 'Muhammad Abdurrahman Wiryawan Kusumadinata';

Map<String, dynamic> _user(int i, String status) => {
      'id': 'u$i',
      'username': 'pelanggan$i',
      'name': i == 1 ? _long : 'Siti Rahmawati $i',
      'phone': '08123456780$i',
      'status': status,
      'customerId': '2025011$i',
      'subscriptionType': 'POSTPAID',
      'connectionType': 'PPPOE',
      'expiredAt': '2026-11-0${i}T00:00:00Z',
      'createdAt': '2025-01-17T00:00:00Z',
      'address': 'Perumahan Griya Asri Blok C12 No. $i',
      'ipAddress': '10.20.30.4$i',
      'balance': 0,
      'billingDay': 5,
      'isOnline': status == 'active',
      'profile': {'name': 'Fiber 30 Mbps', 'price': 200000},
      'area': {'name': 'Sukamaju Selatan'},
      'router': {'name': 'MikroTik Pusat'},
    };

Map<String, dynamic> _invoice(int i, String status) => {
      'id': 'i$i',
      'invoiceNumber': 'INV-20261005-000$i',
      'amount': 200000 + i * 25000,
      'status': status,
      'dueDate': '2026-10-0${i}T00:00:00Z',
      'createdAt': '2026-09-0${i}T00:00:00Z',
      'invoiceType': 'MONTHLY',
      'customerName': i == 1 ? _long : 'Siti Rahmawati $i',
      'customerUsername': 'pelanggan$i',
      'customerPhone': '08123456780$i',
      'paymentLink': 'https://isp.test/pay/$i',
      if (status == 'PAID') 'paidAt': '2026-10-02T00:00:00Z',
      'user': {'profile': {'name': 'Fiber 30 Mbps'}, 'area': {'name': 'Sukamaju Selatan'}},
    };

class _Fixtures implements HttpClientAdapter {
  Object _body(String path) {
    path = path.split('?').first;
    switch (path) {
      case '/api/network/olts':
        return {'success': true, 'olts': [{'id': 'olt1', 'name': 'OLT Pusat Huawei MA5608T', 'ipAddress': '10.0.0.2', 'latitude': -6.2000, 'longitude': 106.8166, 'status': 'active', 'vendor': 'huawei', 'onlineOnu': 182, 'offlineOnu': 3}]};
      case '/api/network/odcs':
        return {'success': true, 'odcs': [{'id': 'odc1', 'name': 'ODC Sukamaju', 'latitude': '-6.2050', 'longitude': '106.8200', 'oltId': 'olt1', 'ponPort': 1, 'portCount': 16, 'status': 'active', 'olt': {'name': 'OLT Pusat'}}]};
      case '/api/network/odps':
        return {'success': true, 'odps': [
          {'id': 'odp1', 'name': 'ODP-SKM-01', 'latitude': -6.2070, 'longitude': 106.8230, 'odcId': 'odc1', 'portCount': 8, 'status': 'active', 'odc': {'name': 'ODC Sukamaju'}},
          {'id': 'odp2', 'name': 'ODP-SKM-02', 'latitude': -6.2080, 'longitude': 106.8250, 'parentOdpId': 'odp1', 'portCount': 8, 'status': 'maintenance'},
          {'id': 'odp3', 'name': 'ODP tanpa koordinat', 'latitude': 0, 'longitude': 0, 'status': 'active'},
        ]};
      case '/api/network/nodes':
        return {'success': true, 'data': [{'id': 'jc1', 'type': 'JOINT_CLOSURE', 'code': 'JC-01', 'name': 'JC Simpang', 'latitude': -6.2030, 'longitude': 106.8180, 'status': 'active', 'upstreamId': 'olt1'}]};
      case '/api/customers/with-location':
        return {'success': true, 'data': [
          {'id': 'u1', 'username': 'pelanggan1', 'name': _long, 'latitude': -6.2075, 'longitude': 106.8240, 'status': 'active', 'pppoe_profiles': 'Fiber 30 Mbps', 'odpName': 'ODP-SKM-01', 'odpCoordinates': {'latitude': -6.2070, 'longitude': 106.8230}},
          {'id': 'u2', 'username': 'pelanggan2', 'name': 'Siti', 'latitude': -6.2085, 'longitude': 106.8255, 'status': 'isolated', 'pppoe_profiles': 'Fiber 20 Mbps'},
        ]};
      case '/api/dashboard/stats':
        return {
          'success': true,
          'stats': {
            'totalPppoeUsers': 1240, 'activePppoeUsers': 1180, 'activeSessionsPPPoE': 1102, 'activeSessionsHotspot': 37,
            'unusedVouchers': 450, 'isolatedCount': 21, 'suspendedCount': 3, 'newRegistrations': 4,
            'upcomingInvoices': [
              {'invoiceNumber': 'INV-20261005-0001', 'customerName': _long, 'customerUsername': 'u1', 'amount': 250000, 'dueDate': '2026-10-05T00:00:00Z', 'status': 'OVERDUE', 'daysUntilDue': -8},
            ],
            'invoiceRevenueFormatted': 'Rp 182.750.000', 'invoiceRevenueTodayFormatted': 'Rp 4.500.000',
            'voucherRevenueFormatted': 'Rp 3.450.000', 'voucherRevenueTodayFormatted': 'Rp 120.000',
            'invoiceCountToday': 18, 'invoiceCountMonth': 1150, 'unpaidInvoicesCount': 96,
          },
          'activities': [],
          'systemStatus': {'radius': true, 'database': true, 'api': true},
        };
      case '/api/pppoe/users':
        return {
          'users': [_user(1, 'active'), _user(2, 'isolated'), _user(3, 'active'), _user(4, 'stop')],
          'total': 4,
          'totalPages': 1,
        };
      case '/api/pppoe/users/u1':
        return {'user': _user(1, 'active'), 'activeSession': {'framedipaddress': '10.20.30.41', 'acctstarttime': '2026-10-15T01:00:00Z'}};
      case '/api/invoices':
        return {
          'invoices': [_invoice(1, 'OVERDUE'), _invoice(2, 'PENDING'), _invoice(3, 'PAID')],
          'totalPages': 1,
          'stats': {'total': 1150, 'unpaid': 96, 'paid': 1054, 'pending': 75, 'overdue': 21, 'totalUnpaidAmount': 19200000, 'totalPaidAmount': 182750000},
        };
      case '/api/notifications':
        return {
          'success': true,
          'unreadCount': 2,
          'notifications': [
            {'id': 'n1', 'title': 'Pembayaran masuk', 'message': 'INV-20261005-0002 dibayar lewat QRIS Rp 225.000', 'type': 'payment', 'isRead': false, 'createdAt': '2026-10-15T02:00:00Z', 'link': '/admin/invoices'},
            {'id': 'n2', 'title': 'Registrasi baru', 'message': 'Andi Pratama mendaftar paket Fiber 30 Mbps', 'type': 'registration', 'isRead': true, 'createdAt': '2026-10-14T02:00:00Z'},
          ],
        };
      case '/api/tickets':
        return {
          'success': true,
          'data': [
            {'id': 't1', 'ticketNumber': 'TKT-20261014-0003', 'subject': 'Internet putus-putus sejak kemarin sore', 'status': 'OPEN', 'priority': 'HIGH', 'customerName': _long, 'createdAt': '2026-10-14T09:00:00Z'},
          ],
        };
    }
    return {'success': true, 'data': []};
  }

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    return ResponseBody.fromString(jsonEncode(_body(o.path)), 200, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

final _shotKey = GlobalKey();

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
  setUpAll(() async {
    await initializeDateFormatting('id_ID', null);
    // Load the bundled guides here, on real time: a load started inside a
    // test's fake clock never completes, and the cached future would hang
    // every later test.
    await GuideBook.load();
    final jakarta = FontLoader('PlusJakartaSans')..addFont(rootBundle.load('assets/fonts/PlusJakartaSans-Variable.ttf'));
    await jakarta.load();
    final iconFile = File('${Platform.environment['FLUTTER_ROOT'] ?? 'C:/flutter'}/bin/cache/artifacts/material_fonts/materialicons-regular.otf');
    if (iconFile.existsSync()) {
      final icons = FontLoader('MaterialIcons')..addFont(Future.value(ByteData.sublistView(iconFile.readAsBytesSync())));
      await icons.load();
    }
  });

  setUp(() => ApiClient.instance.initForTest(_Fixtures()));

  Future<void> pump(WidgetTester tester, Widget screen, bool dark, double width) async {
    tester.view.physicalSize = Size(width, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider(create: (_) => ThemeController()),
          ChangeNotifierProvider(create: (_) => AuthProvider()..user = AdminUser(id: '1', username: 'admin', name: 'Rina Kartika', role: 'SUPER_ADMIN')),
          ChangeNotifierProvider(create: (_) => DashboardProvider()),
          ChangeNotifierProvider(create: (_) => PppoeProvider()),
          ChangeNotifierProvider(create: (_) => InvoiceProvider()),
          ChangeNotifierProvider(create: (_) => RegistrationProvider()),
          ChangeNotifierProvider(create: (_) => NotificationsProvider()),
        ],
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: dark ? AppTheme.dark : AppTheme.light,
          home: RepaintBoundary(key: _shotKey, child: screen),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
  }

  final invoice = Invoice.fromJson(_invoice(1, 'OVERDUE'));
  final screens = <String, Widget Function()>{
    'login': () => const LoginScreen(),
    'shell': () => const MainShell(),
    'pppoe-detail': () => const PppoeDetailScreen(userId: 'u1'),
    'invoice-detail': () => InvoiceDetailScreen(invoice: invoice),
    'notifications': () => const NotificationsScreen(),
    'tickets': () => const TicketListScreen(),
    'profile': () => const ProfileScreen(),
    'network-map': () => const NetworkMapScreen(),
    'guide-hub': () => const GuideHubScreen(),
  };
  final tabs = {'pelanggan': 'Pelanggan', 'tagihan': 'Tagihan', 'lainnya': 'Lainnya'};

  for (final (width, dark) in [(360.0, false), (360.0, true), (320.0, false)]) {
    final label = '${width.toInt()}-${dark ? 'dark' : 'light'}';
    for (final MapEntry(key: name, value: build) in screens.entries) {
      testWidgets('$name renders without overflow at $label', (tester) async {
        await pump(tester, build(), dark, width);
        await _shot(tester, 'a-$name-$label');
        expect(tester.takeException(), isNull);
      });
    }
    testWidgets('Panduan button opens the guide of a scoped screen at $label', (tester) async {
      await pump(tester, const GuideScope(path: '/admin/pppoe/users', child: PppoeListScreen()), dark, width);
      // The guides loaded in setUpAll, outside the test clock; their result
      // reaches the FutureBuilder once the real event loop turns.
      await tester.runAsync(() => Future<void>.delayed(Duration.zero));
      await tester.pump();
      await tester.tap(find.byTooltip('Panduan'));
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pump(const Duration(milliseconds: 500));
      await _shot(tester, 'a-guide-sheet-$label');
      expect(find.text('Pelanggan PPPoE'), findsWidgets);
      expect(find.text('Cara pakai'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
    testWidgets('Pusat Panduan lists setup steps and searches at $label', (tester) async {
      await pump(tester, const GuideHubScreen(), dark, width);
      await tester.runAsync(() => Future<void>.delayed(Duration.zero));
      await tester.pump();
      expect(find.text('Mulai di sini: urutan setup'), findsOneWidget);
      expect(find.text('Isi profil perusahaan'), findsOneWidget);
      await _shot(tester, 'a-guide-hub-$label');
      await tester.enterText(find.byType(TextField), 'isolir');
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Mulai di sini: urutan setup'), findsNothing);
      expect(find.text('Pengaturan Isolasi'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'zzzz');
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.textContaining('Tidak ada panduan yang cocok'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
    testWidgets('no Panduan button without a guide at $label', (tester) async {
      await pump(tester, const PppoeListScreen(), dark, width);
      expect(find.byTooltip('Panduan'), findsNothing);
    });
    for (final MapEntry(key: name, value: tab) in tabs.entries) {
      testWidgets('tab $name renders without overflow at $label', (tester) async {
        await pump(tester, const MainShell(), dark, width);
        await tester.tap(find.text(tab).last);
        await tester.pump(const Duration(seconds: 1));
        await tester.pump(const Duration(seconds: 1));
        await _shot(tester, 'a-tab-$name-$label');
        expect(tester.takeException(), isNull);
      });
    }
  }
}
