import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:customer_app/core/api/api_client.dart';
import 'package:customer_app/core/company/company_provider.dart';
import 'package:customer_app/core/theme/brand_theme_provider.dart';
import 'package:customer_app/features/auth/auth_provider.dart';
import 'package:customer_app/features/auth/login_screen.dart';
import 'package:customer_app/features/dashboard/dashboard_provider.dart';
import 'package:customer_app/features/dashboard/promo_provider.dart';
import 'package:customer_app/features/invoices/invoice_detail_screen.dart';
import 'package:customer_app/features/invoices/invoice_provider.dart';
import 'package:customer_app/features/invoices/invoices_screen.dart';
import 'package:customer_app/features/more/more_screen.dart';
import 'package:customer_app/features/more/profile_screen.dart';
import 'package:customer_app/features/notifications/notifications_provider.dart';
import 'package:customer_app/features/notifications/notifications_screen.dart';
import 'package:customer_app/features/payment/payment_flow.dart';
import 'package:customer_app/features/payment/qris_pay_screen.dart';
import 'package:customer_app/features/referral/referral_provider.dart';
import 'package:customer_app/features/referral/referral_screen.dart';
import 'package:customer_app/features/renewal/renewal_provider.dart';
import 'package:customer_app/features/renewal/renewal_screen.dart';
import 'package:customer_app/features/shell/main_shell.dart';
import 'package:customer_app/features/suspend/suspend_provider.dart';
import 'package:customer_app/features/suspend/suspend_screen.dart';
import 'package:customer_app/features/tickets/create_ticket_screen.dart';
import 'package:customer_app/features/tickets/ticket_detail_screen.dart';
import 'package:customer_app/features/tickets/ticket_provider.dart';
import 'package:customer_app/features/tickets/tickets_screen.dart';
import 'package:customer_app/features/topup/topup_provider.dart';
import 'package:customer_app/features/topup/topup_screen.dart';
import 'package:customer_app/features/upgrade/upgrade_provider.dart';
import 'package:customer_app/features/upgrade/upgrade_screen.dart';
import 'package:customer_app/features/wifi/wifi_provider.dart';
import 'package:customer_app/features/wifi/wifi_screen.dart';
import 'package:customer_app/models/customer.dart';
import 'package:customer_app/models/invoice.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

/// Responses shaped from the customer API routes, with long real-world
/// values (names, addresses, amounts) to stress the layouts.
class _Fixtures implements HttpClientAdapter {
  static const _customer = {
    'id': 'u1',
    'username': 'budi.santoso',
    'name': 'Budi Santoso Wiryawan',
    'phone': '081234567890',
    'email': 'budi@contoh.com',
    'status': 'active',
    'expiredAt': '2026-11-05T00:00:00Z',
    'balance': 25000,
    'autoRenewal': true,
    'customerId': '20250117',
    'address': 'Perumahan Griya Asri Blok C12 No. 7, Kel. Sukamaju',
    'profile': {'id': 'p1', 'name': 'Fiber 30 Mbps', 'downloadSpeed': 30, 'uploadSpeed': 10, 'price': 200000},
  };

  Object _body(String path, Map<String, dynamic> q) {
    switch (path) {
      case '/api/public/company':
        return {
          'success': true,
          'company': {
            'name': 'SalfaNet',
            'phone': '0811-2345-678',
            'email': 'cs@salfanet.test',
            'address': 'Jl. Raya Sukamaju No. 12',
            'bankAccounts': [
              {'bankName': 'BCA', 'accountNumber': '1234567890', 'accountName': 'PT SalfaNet Media'},
            ],
          },
        };
      case '/api/customer/me':
        return {'success': true, 'user': _customer};
      case '/api/customer/dashboard':
        return {
          'success': true,
          'data': {
            'session': {'isOnline': true, 'ipAddress': '10.20.30.44', 'startTime': '2026-10-15T01:00:00Z'},
            'usage': {'download': 48318382080, 'upload': 6442450944},
            'invoice': {'unpaidCount': 1, 'totalUnpaid': 200000, 'nextDueDate': '2026-11-05T00:00:00Z'},
          },
        };
      case '/api/public/promo-banners':
        return {'success': true, 'banners': []};
      case '/api/customer/invoices':
        return {
          'success': true,
          'data': {
            'invoices': [
              {'id': 'i1', 'invoiceNumber': 'INV-20261005-0001', 'amount': 200000, 'status': 'PENDING', 'dueDate': '2026-11-05T00:00:00Z', 'createdAt': '2026-10-06T00:00:00Z', 'invoiceType': 'MONTHLY', 'profileName': 'Fiber 30 Mbps', 'paymentLink': 'https://isp.test/pay/abc'},
              {'id': 'i2', 'invoiceNumber': 'INV-20260905-0001', 'amount': 200000, 'status': 'PAID', 'dueDate': '2026-10-05T00:00:00Z', 'paidAt': '2026-10-03T00:00:00Z', 'createdAt': '2026-09-06T00:00:00Z', 'invoiceType': 'MONTHLY', 'profileName': 'Fiber 30 Mbps', 'paymentSource': 'qris_own'},
              {'id': 'i3', 'invoiceNumber': 'INV-20260805-0001', 'amount': 200000, 'status': 'PENDING', 'dueDate': '2026-09-05T00:00:00Z', 'createdAt': '2026-08-06T00:00:00Z', 'invoiceType': 'MONTHLY', 'profileName': 'Fiber 30 Mbps', 'manualPaymentStatus': 'PENDING', 'manualPaymentBank': 'BCA'},
            ],
            'pagination': {'page': 1, 'totalPages': 1},
          },
        };
      case '/api/invoices/i1/pdf':
        return {
          'success': true,
          'data': {
            'company': {'name': 'SalfaNet', 'phone': '0811-2345-678', 'email': 'cs@salfanet.test', 'address': 'Jl. Raya Sukamaju No. 12'},
            'invoice': {'number': 'INV-20261005-0001', 'date': '6 Oktober 2026', 'dueDate': '5 November 2026', 'status': 'PENDING'},
            'total': 200000,
            'amountFormatted': 'Rp 200.000',
            'customer': {'name': 'Budi Santoso Wiryawan', 'customerId': '20250117', 'username': 'budi.santoso', 'phone': '081234567890', 'email': 'budi@contoh.com', 'address': 'Perumahan Griya Asri Blok C12 No. 7', 'area': 'Sukamaju'},
            'items': [{'description': 'Internet Fiber 30 Mbps (Nov 2026)', 'quantity': 1, 'price': 200000, 'total': 200000}],
            'amount': 200000,
            'baseAmount': 200000,
            'subtotal': 200000,
            'hasTax': false,
            'additionalFees': [],
            'paymentLink': 'https://isp.test/pay/abc',
          },
        };
      case '/api/customer/wifi':
        return {
          'success': true,
          'device': {
            'model': 'ZTE F670L',
            'status': 'Online',
            'ipAddress': '10.20.30.44',
            'uptime': '5 hari 22 jam',
            'signalStrength': {'rxPower': '-21.40 dBm', 'temperature': '48 °C'},
            'wlanConfigs': [
              {'index': 1, 'band': '2.4GHz', 'ssid': 'SalfaNet_Budi', 'password': 'rahasia123', 'enabled': true, 'totalAssociations': 4},
              {'index': 5, 'band': '5GHz', 'ssid': 'SalfaNet_Budi_5G', 'password': 'rahasia123', 'enabled': true, 'totalAssociations': 2},
            ],
            'connectedHosts': [
              {'hostname': 'Samsung-Galaxy-A54', 'ipAddress': '192.168.1.3', 'macAddress': 'AA:BB:CC:11:22:33', 'signalStrength': -52},
              {'hostname': 'LAPTOP-KANTOR', 'ipAddress': '192.168.1.5', 'macAddress': 'AA:BB:CC:44:55:66', 'signalStrength': -67},
            ],
          },
        };
      case '/api/customer/tickets':
        return {
          'success': true,
          'data': [
            {'id': 't1', 'ticketNumber': 'TKT-20261014-0003', 'subject': 'Internet putus-putus sejak kemarin sore', 'description': 'Lampu LOS merah berkedip', 'status': 'IN_PROGRESS', 'priority': 'HIGH', 'createdAt': '2026-10-14T09:00:00Z', 'category': {'name': 'Gangguan', 'color': '#EF4444'}},
            {'id': 't2', 'ticketNumber': 'TKT-20260920-0011', 'subject': 'Ganti password WiFi', 'description': '-', 'status': 'RESOLVED', 'priority': 'LOW', 'createdAt': '2026-09-20T09:00:00Z', 'resolvedAt': '2026-09-20T12:00:00Z'},
          ],
        };
      case '/api/tickets':
        return {
          'success': true,
          'data': [
            {'id': 't1', 'ticketNumber': 'TKT-20261014-0003', 'subject': 'Internet putus-putus sejak kemarin sore', 'description': 'Lampu LOS merah berkedip sejak jam 4 sore.', 'status': 'IN_PROGRESS', 'priority': 'HIGH', 'createdAt': '2026-10-14T09:00:00Z', 'category': {'name': 'Gangguan', 'color': '#EF4444'}},
          ],
        };
      case '/api/tickets/messages':
        return {
          'success': true,
          'data': [
            {'id': 'm1', 'message': 'Lampu LOS merah berkedip sejak jam 4 sore.', 'senderType': 'CUSTOMER', 'senderName': 'Budi', 'createdAt': '2026-10-14T09:00:00Z'},
            {'id': 'm2', 'message': 'Baik Pak, teknisi kami jadwalkan datang besok pukul 10.00.', 'senderType': 'ADMIN', 'senderName': 'CS SalfaNet', 'createdAt': '2026-10-14T10:00:00Z'},
          ],
        };
      case '/api/tickets/categories':
        return {'success': true, 'data': [{'id': 'c1', 'name': 'Gangguan'}, {'id': 'c2', 'name': 'Tagihan'}]};
      case '/api/customer/notifications':
        return {
          'success': true,
          'unreadCount': 1,
          'events': [
            {'id': 'n1', 'type': 'ticket_reply', 'title': 'Balasan tiket TKT-20261014-0003', 'message': 'Baik Pak, teknisi kami jadwalkan datang besok pukul 10.00.', 'timestamp': '2026-10-06T02:00:00Z', 'isRead': false},
            {'id': 'n2', 'type': 'payment_success', 'title': 'Pembayaran diterima', 'message': 'Terima kasih, pembayaran Rp 200.000 sudah kami terima.', 'timestamp': '2026-10-03T02:00:00Z', 'isRead': true},
          ],
        };
      case '/api/customer/referral':
        return {
          'success': true,
          'config': {'enabled': true, 'rewardAmount': 25000},
          'referral': {
            'code': 'BUDI25',
            'shareUrl': 'https://isp.test/daftar?ref=BUDI25',
            'stats': {'totalReferred': 2, 'totalRewardsCredited': 50000, 'pendingRewardsAmount': 25000},
          },
        };
      case '/api/customer/renewal':
        return {'success': true, 'canRenew': true};
      case '/api/public/payment-gateways':
        return {'success': true, 'gateways': [{'provider': 'qris_own', 'name': 'QRIS'}, {'provider': 'midtrans', 'name': 'Midtrans'}, {'provider': 'duitku', 'name': 'Duitku'}]};
      case '/api/public/profiles':
        return {
          'success': true,
          'profiles': [
            {'id': 'p1', 'name': 'Fiber 30 Mbps', 'downloadSpeed': 30, 'uploadSpeed': 10, 'price': 200000},
            {'id': 'p2', 'name': 'Fiber 50 Mbps', 'downloadSpeed': 50, 'uploadSpeed': 20, 'price': 300000},
            {'id': 'p3', 'name': 'Fiber 100 Mbps Keluarga', 'downloadSpeed': 100, 'uploadSpeed': 50, 'price': 450000},
          ],
        };
      case '/api/customer/suspend-request':
        return {'success': true, 'data': null};
      case '/api/customer/invoices/payment':
        return {'success': true, 'paymentLink': 'https://isp.test/pay/tok123'};
      case '/api/customer/payment-methods':
        return {'success': true, 'methods': []};
      case '/api/payment/create':
        return {'success': true, 'isQrisOwn': true, 'orderId': 'ORD-1', 'paymentUrl': '/pay/qris/ORD-1?back=%2Fpay%2Ftok123'};
      case '/api/payment/create-fails':
        return {'error': 'Failed to create Midtrans payment', 'details': 'Access denied due to unauthorized transaction'};
      case '/api/payment/qris-status':
        return {
          'success': true,
          'status': 'pending',
          'qrImage': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
          'baseAmount': 200000,
          'uniqueAmount': 200017,
          'expiresAt': DateTime.now().toUtc().add(const Duration(minutes: 14)).toIso8601String(),
        };
    }
    return {'success': true};
  }

  final requests = <RequestOptions>[];
  String? failGateway;

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    requests.add(o);
    // A gateway that rejects the transaction, as Midtrans does with bad keys.
    if (o.path == '/api/payment/create' && failGateway != null && (o.data as Map?)?['gateway'] == failGateway) {
      return ResponseBody.fromString(jsonEncode(_body('/api/payment/create-fails', o.queryParameters)), 500, headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      });
    }
    return ResponseBody.fromString(jsonEncode(_body(o.path, o.queryParameters)), 200, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

final _shotKey = GlobalKey();

/// Saves the rendered screen when SHOT_DIR is set; a no-op in normal runs.
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
    FlutterSecureStorage.setMockInitialValues({'customer_token': 'test'});
    final jakarta = FontLoader('PlusJakartaSans')..addFont(rootBundle.load('assets/fonts/PlusJakartaSans-Variable.ttf'));
    await jakarta.load();
    // Icons otherwise render as empty boxes in tests.
    final iconFile = File('${Platform.environment['FLUTTER_ROOT'] ?? 'C:/flutter'}/bin/cache/artifacts/material_fonts/materialicons-regular.otf');
    if (iconFile.existsSync()) {
      final icons = FontLoader('MaterialIcons')..addFont(Future.value(ByteData.sublistView(iconFile.readAsBytesSync())));
      await icons.load();
    }
  });

  late _Fixtures fixtures;
  setUp(() {
    fixtures = _Fixtures();
    ApiClient.instance.initForTest(fixtures);
  });

  Future<void> pump(WidgetTester tester, Widget screen, bool dark, double width, {double height = 1800}) async {
    tester.view.physicalSize = Size(width, height);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final auth = AuthProvider()
      ..status = AuthStatus.authenticated
      ..customer = CustomerProfile.fromJson(_Fixtures._customer);
    final brand = BrandThemeProvider();
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider.value(value: auth),
          ChangeNotifierProvider(create: (_) => InvoiceProvider()),
          ChangeNotifierProvider(create: (_) => WifiProvider()),
          ChangeNotifierProvider(create: (_) => TicketProvider()),
          ChangeNotifierProvider(create: (_) => DashboardProvider()),
          ChangeNotifierProvider(create: (_) => NotificationsProvider()),
          ChangeNotifierProvider(create: (_) => ReferralProvider()),
          ChangeNotifierProvider(create: (_) => RenewalProvider()),
          ChangeNotifierProvider(create: (_) => TopupProvider()),
          ChangeNotifierProvider(create: (_) => UpgradeProvider()),
          ChangeNotifierProvider(create: (_) => SuspendProvider()),
          ChangeNotifierProvider(create: (_) => CompanyProvider()..load()),
          ChangeNotifierProvider(create: (_) => PromoProvider()),
          ChangeNotifierProvider.value(value: brand),
        ],
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: dark ? brand.darkTheme : brand.lightTheme,
          home: RepaintBoundary(key: _shotKey, child: screen),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
  }

  final invoice = Invoice.fromJson(const {
    'id': 'i1', 'invoiceNumber': 'INV-20261005-0001', 'amount': 200000, 'status': 'PENDING',
    'dueDate': '2026-11-05T00:00:00Z', 'createdAt': '2026-10-06T00:00:00Z', 'invoiceType': 'MONTHLY',
    'profileName': 'Fiber 30 Mbps', 'paymentLink': 'https://isp.test/pay/abc',
  });

  final screens = <String, Widget Function()>{
    'login': () => const LoginScreen(),
    'shell-home': () => const MainShell(),
    'invoices': () => const InvoicesScreen(),
    'invoice-detail': () => InvoiceDetailScreen(invoice: invoice),
    'wifi': () => const WifiScreen(),
    'tickets': () => const TicketsScreen(),
    'ticket-detail': () => const TicketDetailScreen(ticketId: 't1'),
    'ticket-create': () => const CreateTicketScreen(),
    'more': () => const MoreScreen(),
    'profile': () => const ProfileScreen(),
    'notifications': () => const NotificationsScreen(),
    'referral': () => const ReferralScreen(),
    'renewal': () => const RenewalScreen(),
    'topup': () => const TopupScreen(),
    'upgrade': () => const UpgradeScreen(),
    'suspend': () => const SuspendScreen(),
    'pay-choose': () => const InvoicePaymentScreen(invoiceId: 'i1', amount: 200000, invoiceNumber: 'INV-20261005-0001'),
    'pay-qris': () => const QrisPayScreen(orderId: 'ORD-1'),
  };

  for (final MapEntry(key: name, value: build) in screens.entries) {
    for (final (width, dark) in [(360.0, false), (360.0, true), (320.0, false)]) {
      final label = '${width.toInt()}-${dark ? 'dark' : 'light'}';
      testWidgets('$name renders without overflow at $label', (tester) async {
        await pump(tester, build(), dark, width);
        await _shot(tester, 'c-$name-$label');
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('paying an invoice with QRIS stays in the app and shows the QR', (tester) async {
    await pump(tester, const InvoicePaymentScreen(invoiceId: 'i1', amount: 200000, invoiceNumber: 'INV-20261005-0001'), false, 360);
    await tester.tap(find.text('QRIS'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));

    final create = fixtures.requests.lastWhere((r) => r.path == '/api/payment/create');
    final body = (create.data as Map).cast<String, dynamic>();
    expect(body['invoiceId'], 'i1');
    expect(body['gateway'], 'qris_own');
    expect(body['paymentToken'], 'tok123');
    expect(find.byType(QrisPayScreen), findsOneWidget);
    expect(find.text('Rp 200.017'), findsOneWidget);
  });

  testWidgets('Midtrans goes straight to its checkout, with no channel list call', (tester) async {
    await pump(tester, const InvoicePaymentScreen(invoiceId: 'i1', amount: 3086), false, 360);
    await tester.tap(find.text('Midtrans'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(fixtures.requests.where((r) => r.path == '/api/customer/payment-methods'), isEmpty);
    final create = fixtures.requests.lastWhere((r) => r.path == '/api/payment/create');
    expect((create.data as Map)['gateway'], 'midtrans');
    expect((create.data as Map).containsKey('paymentMethod'), isFalse);
    // Close the payment screen so its status timers stop.
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets("a gateway's rejection shows its own reason", (tester) async {
    fixtures.failGateway = 'midtrans';
    await pump(tester, const InvoicePaymentScreen(invoiceId: 'i1', amount: 3086), false, 360);
    await tester.tap(find.text('Midtrans'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Failed to create Midtrans payment: Access denied due to unauthorized transaction'), findsOneWidget);
  });
}
