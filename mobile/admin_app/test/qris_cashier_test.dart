import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:admin_app/core/api/api_client.dart';
import 'package:admin_app/core/theme/app_theme.dart';
import 'package:admin_app/features/qris_cashier/qris_cashier_screen.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

/// /api/payment-gateway/qris-mandiri as the server returns it.
class _Server implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    final body = o.path == '/api/payment-gateway/qris-mandiri'
        ? {'qrisEnabled': true, 'qrisDeviceKey': 'devkey123', 'qrisDeviceSecret': 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'}
        : {'success': true};
    return ResponseBody.fromString(jsonEncode(body), 200, headers: {
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
  late Map<String, Object?> native;
  late List<MethodCall> calls;

  setUpAll(() async {
    await initializeDateFormatting('id_ID', null);
    final jakarta = FontLoader('PlusJakartaSans')..addFont(rootBundle.load('assets/fonts/PlusJakartaSans-Variable.ttf'));
    await jakarta.load();
    final iconFile = File('${Platform.environment['FLUTTER_ROOT'] ?? 'C:/flutter'}/bin/cache/artifacts/material_fonts/materialicons-regular.otf');
    if (iconFile.existsSync()) {
      final icons = FontLoader('MaterialIcons')..addFont(Future.value(ByteData.sublistView(iconFile.readAsBytesSync())));
      await icons.load();
    }
  });

  setUp(() {
    ApiClient.instance.initForTest(_Server());
    calls = [];
    native = {
      'accessGranted': false,
      'batteryUnrestricted': false,
      'enabled': false,
      'voice': true,
      'serverUrl': '',
      'deviceKey': '',
      'hasSecret': false,
      'heartbeatAt': 0,
      'lastResult': '',
      'queueSize': 0,
      'recent': <Object>[],
    };
  });

  Future<void> pump(WidgetTester tester, {bool dark = false, double width = 360}) async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('salfanet/qris_listener'),
      (call) async {
        calls.add(call);
        if (call.method == 'configure') {
          final a = (call.arguments as Map).cast<String, Object?>();
          native = {
            ...native,
            'enabled': a['enabled'],
            'serverUrl': a['serverUrl'],
            'deviceKey': a['deviceKey'],
            'hasSecret': (a['deviceSecret'] as String).isNotEmpty,
            'accessGranted': true,
          };
        }
        return switch (call.method) {
          'status' || 'configure' => native,
          'testConnection' => {'ok': true, 'message': 'Koneksi OK: Device Key dan Device Secret cocok.'},
          _ => null,
        };
      },
    );
    tester.view.physicalSize = Size(width, 1700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: dark ? AppTheme.dark : AppTheme.light,
      home: RepaintBoundary(key: _shotKey, child: const QrisCashierScreen()),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
  }

  testWidgets('switching on takes the credentials from the server and starts the listener', (tester) async {
    await pump(tester);
    await _shot(tester, 'qris-off');
    expect(find.text('Nonaktif'), findsOneWidget);

    await tester.tap(find.byType(Switch).first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    final configure = calls.lastWhere((c) => c.method == 'configure');
    final args = (configure.arguments as Map).cast<String, Object?>();
    expect(args['enabled'], true);
    expect(args['deviceKey'], 'devkey123');
    expect(args['deviceSecret'], 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6');
    expect(args['serverUrl'], endsWith('/api/payment/qris-notify'));
    expect(find.text('Kasir QRIS aktif di HP ini'), findsOneWidget);
  });

  for (final (dark, width) in [(false, 360.0), (true, 360.0), (false, 320.0)]) {
    testWidgets('active state renders without overflow at ${width.toInt()} ${dark ? 'dark' : 'light'}', (tester) async {
      native = {
        ...native,
        'accessGranted': true,
        'batteryUnrestricted': true,
        'enabled': true,
        'serverUrl': 'https://radius.example.id/api/payment/qris-notify',
        'deviceKey': 'devkey123',
        'hasSecret': true,
        'heartbeatAt': DateTime.now().subtract(const Duration(minutes: 2)).millisecondsSinceEpoch,
        'lastResult': 'Terkirim Rp3.086 dari DANA: cocok dengan INV-20261016-0003',
        'recent': [
          {'pkg': 'id.dana', 'title': 'Pembayaran Masuk', 'time': '23:34:10'},
          {'pkg': 'com.whatsapp', 'title': 'Budi Santoso', 'time': '23:30:02'},
        ],
      };
      await pump(tester, dark: dark, width: width);
      await _shot(tester, 'qris-on-${width.toInt()}-${dark ? 'dark' : 'light'}');
      expect(find.text('Memantau'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
