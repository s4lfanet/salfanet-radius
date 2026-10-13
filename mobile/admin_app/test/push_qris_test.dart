import 'dart:convert';

import 'package:admin_app/core/api/api_client.dart';
import 'package:admin_app/core/theme/app_theme.dart';
import 'package:admin_app/features/push_broadcast/push_broadcast_screen.dart';
import 'package:admin_app/features/resources/settings_resources.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

/// Shapes from /api/admin/push-notifications and /api/payment-gateway/qris-mandiri.
class _Fixtures implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  String secret = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    requests.add(o);
    Object body = {'success': true, 'message': 'Terkirim ke 3 perangkat'};
    if (o.path == '/api/admin/push-notifications' && o.method == 'GET') {
      body = o.queryParameters['action'] == 'stats'
          ? {'stats': {'customersReachable': 5, 'totalUsers': 9, 'areas': []}}
          : {'broadcasts': []};
    }
    if (o.path == '/api/payment-gateway/qris-mandiri' && o.method == 'GET') {
      body = {'qrisEnabled': true, 'qrisMerchantName': 'SalfaNet', 'qrisDeviceKey': 'devkey123', 'qrisDeviceSecret': secret, 'qrisUniqueMin': 1, 'qrisUniqueMax': 999};
    }
    if (o.path == '/api/payment-gateway/qris-mandiri' && o.method == 'POST' && (o.data as Map)['generateSecret'] == true) {
      secret = 'ffffeeeeddddccccbbbbaaaa99998888';
    }
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
  });

  setUp(() {
    fixtures = _Fixtures();
    ApiClient.instance.initForTest(fixtures);
  });

  Future<void> pump(WidgetTester tester, Widget screen) async {
    tester.view.physicalSize = const Size(360, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(theme: AppTheme.light, home: screen));
    await tester.pumpAndSettle();
  }

  testWidgets('Push broadcast can go to technicians as a whole group', (tester) async {
    await pump(tester, const PushBroadcastScreen());
    expect(find.text('Pelanggan yang dituju'), findsOneWidget);
    await tester.tap(find.text('Teknisi'));
    await tester.pumpAndSettle();
    // Customer targeting only applies to customers.
    expect(find.text('Pelanggan yang dituju'), findsNothing);
    await tester.enterText(find.byType(TextField).at(0), 'Rapat teknisi');
    await tester.enterText(find.byType(TextField).at(1), 'Kumpul jam 9');
    await tester.ensureVisible(find.text('Kirim Notifikasi'));
    await tester.tap(find.text('Kirim Notifikasi'));
    await tester.pumpAndSettle();
    expect(find.textContaining('semua teknisi'), findsOneWidget);
    await tester.tap(find.text('Kirim'));
    await tester.pumpAndSettle();
    final sent = fixtures.requests.lastWhere((r) => r.method == 'POST').data as Map;
    expect(sent['recipientRole'], 'technician');
    expect(sent['targetType'], 'all');
    expect(sent.containsKey('targetIds'), isFalse);
  });

  testWidgets('QRIS settings show the listener credentials and make a new secret', (tester) async {
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String?;
      return null;
    });
    await pump(tester, qrisSettings());
    expect(find.text('Isi di aplikasi QRIS Listener'), findsOneWidget);
    expect(find.text('devkey123'), findsOneWidget);
    // The secret is masked until shown.
    expect(find.text('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'), findsNothing);
    await tester.tap(find.byTooltip('Tampilkan'));
    await tester.pumpAndSettle();
    expect(find.text('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'), findsOneWidget);
    await tester.tap(find.byTooltip('Salin Device Secret'));
    await tester.pumpAndSettle();
    expect(copied, 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6');

    await tester.tap(find.text('Secret baru'));
    await tester.pumpAndSettle();
    final post = fixtures.requests.lastWhere((r) => r.method == 'POST');
    expect((post.data as Map)['generateSecret'], true);
    // The card refreshes with the server's new secret.
    expect(find.text('ffffeeeeddddccccbbbbaaaa99998888'), findsOneWidget);

    // The simulation needs an order id instead of failing on the server.
    await tester.tap(find.text('Simulasi'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Isi Order ID QRIS'), findsOneWidget);
  });
}
