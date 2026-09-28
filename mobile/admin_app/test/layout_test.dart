import 'package:admin_app/core/theme/app_theme.dart';
import 'package:admin_app/core/widgets/detail.dart';
import 'package:admin_app/core/widgets/entity_tile.dart';
import 'package:admin_app/core/widgets/state_views.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// Every screen is composed from these shared widgets, so rendering them
/// with worst-case content at narrow phone widths, in both themes, catches
/// the overflow class of layout bug without a device. Flutter reports a
/// RenderFlex overflow as a test failure.
const _longName = 'Muhammad Abdurrahman Wiryawan Kusumadinata Saputra';
const _longSub = 'PAKET-FIBER-100MBPS-UNLIMITED · Perumahan Griya Asri Blok C12 No. 7';

Widget _app(Widget child, ThemeData theme) => MaterialApp(theme: theme, home: Scaffold(body: child));

void main() {
  // Tests otherwise render with Flutter's box-glyph test font (every glyph
  // a full em wide), which overstates text width; load the real bundled
  // font so widths match the device.
  setUpAll(() async {
    final loader = FontLoader('PlusJakartaSans')..addFont(rootBundle.load('assets/fonts/PlusJakartaSans-Variable.ttf'));
    await loader.load();
  });

  for (final width in [320.0, 360.0]) {
    for (final entry in {'light': AppTheme.light, 'dark': AppTheme.dark}.entries) {
      final label = '${width.toInt()}dp ${entry.key}';

      testWidgets('EntityTile with long text + pills + footer fits at $label', (tester) async {
        tester.view.physicalSize = Size(width, 800);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(_app(
          ListView(padding: const EdgeInsets.all(Gap.page), children: [
            EntityTile(
              icon: Icons.person_rounded,
              tone: Tone.warning,
              title: _longName,
              subtitle: _longSub,
              meta: 'CUST-00012345 · Area Kecamatan Sukamaju Selatan',
              trailing: Column(mainAxisSize: MainAxisSize.min, children: [StatusPill.status('waiting_customer'), const SizedBox(height: 6), StatusPill.status('isolated')]),
              onTap: () {},
            ),
            const SizedBox(height: Gap.sm),
            EntityTile(
              icon: Icons.receipt_long_rounded,
              tone: Tone.success,
              title: _longName,
              subtitle: 'INV-20260928-4D4BD2',
              trailing: AmountTrailing(amount: 'Rp 12.345.678', pill: StatusPill.status('overdue')),
              footer: Row(children: [
                Expanded(child: OutlinedButton(onPressed: () {}, child: const Text('Tolak'))),
                const SizedBox(width: Gap.sm),
                Expanded(child: FilledButton(onPressed: () {}, child: const Text('Setujui'))),
              ]),
            ),
          ]),
          entry.value,
        ));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });

      testWidgets('DetailHeader + DetailSection + ActionBar fit at $label', (tester) async {
        tester.view.physicalSize = Size(width, 900);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(_app(
          Column(children: [
            Expanded(
              child: ListView(padding: const EdgeInsets.all(Gap.page), children: [
                DetailHeader(
                  icon: Icons.person_rounded,
                  tone: Tone.danger,
                  title: _longName,
                  subtitle: 'CUST-00012345 · username-yang-sangat-panjang-sekali',
                  status: Column(mainAxisSize: MainAxisSize.min, children: [StatusPill.status('isolated'), const SizedBox(height: 6), const StatusPill(label: 'Offline', tone: Tone.neutral)]),
                  figureLabel: 'Tagihan belum dibayar',
                  figure: 'Rp 1.234.567.890',
                ),
                const DetailSection(title: 'Akun PPPoE', rows: [
                  InfoRow('Username', 'username-yang-sangat-panjang-sekali-untuk-uji', copyable: true),
                  InfoRow('Tanggal Tagihan', 'Setiap tanggal 28'),
                  InfoRow('Alamat', 'Jl. Raya Panjang Sekali No. 123, RT 004/RW 012, Kelurahan Sukamaju, Kecamatan Sukamaju Selatan'),
                  InfoRow('Kosong', null),
                ]),
              ]),
            ),
            ActionBar(actions: [
              ActionSpec('Tandai Terpasang', Icons.home_repair_service_rounded, () {}, kind: ActionKind.success),
              ActionSpec('WhatsApp', Icons.chat_rounded, () {}, kind: ActionKind.neutral),
            ]),
          ]),
          entry.value,
        ));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        // Null/blank rows are dropped rather than rendered as "-".
        expect(find.text('Kosong'), findsNothing);
      });

      testWidgets('FilterChipRow, SearchField and state views fit at $label', (tester) async {
        tester.view.physicalSize = Size(width, 800);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(_app(
          Column(children: [
            SearchField(hint: 'Cari nama, username, HP, ID pelanggan', onChanged: (_) {}),
            FilterChipRow(
              options: const [('PENDING', 'Menunggu · 12'), ('APPROVED', 'Disetujui · 340'), ('INSTALLED', 'Terpasang'), ('REJECTED', 'Ditolak')],
              selected: 'APPROVED',
              onSelected: (_) {},
            ),
            const Expanded(
              child: EmptyState(
                icon: Icons.receipt_outlined,
                message: 'Tidak ada bukti transfer yang menunggu',
                hint: 'Bukti transfer yang dikirim pelanggan dari halaman bayar akan muncul di sini.',
              ),
            ),
          ]),
          entry.value,
        ));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('Selected filter chip label is readable on its fill (regression)', (tester) async {
    await tester.pumpWidget(_app(
      FilterChipRow(options: const [('a', 'Aktif'), ('b', 'Stop')], selected: 'a', onSelected: (_) {}),
      AppTheme.light,
    ));
    final selected = tester.widget<Text>(find.text('Aktif'));
    final unselected = tester.widget<Text>(find.text('Stop'));
    expect(selected.style?.color, onColor(AppTheme.light.colorScheme.primary));
    expect(unselected.style?.color, AppTheme.light.colorScheme.onSurface);
  });

  test('onColor picks dark text for light fills and white for dark fills', () {
    expect(onColor(const Color(0xFF4ADE80)), isNot(Colors.white)); // dark-mode success
    expect(onColor(const Color(0xFFFBBF24)), isNot(Colors.white)); // dark-mode warning
    expect(onColor(const Color(0xFF15803D)), Colors.white);
    expect(onColor(const Color(0xFFB91C1C)), Colors.white);
  });
}
