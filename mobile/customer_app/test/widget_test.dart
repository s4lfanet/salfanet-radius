import 'package:flutter_test/flutter_test.dart';

import 'package:customer_app/main.dart';

void main() {
  testWidgets('App boots to the login screen when logged out', (WidgetTester tester) async {
    await tester.pumpWidget(const CustomerApp());
    await tester.pump();

    expect(find.text('Selamat Datang'), findsNothing);
  });
}
