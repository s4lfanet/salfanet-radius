import 'package:admin_app/features/resources/hotspot_resources.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const tpl = '<style>\n.vc-theme { --vc-warna: #1d4ed8; --vc-teks: #ffffff; }\n.vc50-head { background: var(--vc-warna); }\n</style>';

  test('reads the template colour', () {
    expect(voucherTemplateColor(tpl), '#1d4ed8');
    expect(voucherTemplateColor('<div style="background:#ff8c00">'), isNull);
  });

  test('changing colour rewrites only the theme line and keeps text readable', () {
    final green = setVoucherTemplateColor(tpl, '#15803d');
    expect(green, contains('--vc-warna: #15803d; --vc-teks: #ffffff;'));
    expect(green, contains('background: var(--vc-warna);'));
    final yellow = setVoucherTemplateColor(tpl, '#facc15');
    expect(yellow, contains('--vc-warna: #facc15; --vc-teks: #111111;'));
  });
}
