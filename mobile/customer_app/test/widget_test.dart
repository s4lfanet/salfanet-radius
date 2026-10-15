import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:customer_app/main.dart';

void main() {
  // Secure storage is a platform plugin; tests need its in-memory stand-in.
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('App boots to the login screen when logged out', (WidgetTester tester) async {
    await tester.pumpWidget(const CustomerApp());
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    expect(find.text('Selamat Datang'), findsOneWidget);
  });
}
