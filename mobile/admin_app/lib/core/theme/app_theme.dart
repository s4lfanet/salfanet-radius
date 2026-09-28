import 'package:flutter/material.dart';

/// Direction: see DESIGN.md. Brand blue/indigo is reused from the web admin
/// panel (frontend/src/app/admin/login/page.tsx) so staff moving between web
/// and app see one product.
///
/// Both themes are built from the same component definitions below and
/// differ only in the [_Palette] they get — previously the dark theme only
/// overrode three components and every input, chip, button and divider fell
/// back to Material defaults that didn't match the rest of the screen.
class AppTheme {
  AppTheme._();

  /// Brand fill used on fixed-color surfaces (dashboard hero, login mark).
  /// Not theme-dependent on purpose: white text on it is 5.3:1.
  static const brand = Color(0xFF2563EB);
  static const brandDeep = Color(0xFF4F46E5);

  static const radiusBrand = 20.0; // login brand mark only
  static const radiusCard = 16.0; // cards, sheets, list rows
  static const radiusControl = 12.0; // buttons, inputs, chips, small panels
  static const radiusPill = 999.0; // status pills only

  static ThemeData get light => _build(_Palette.light);
  static ThemeData get dark => _build(_Palette.dark);

  static ThemeData _build(_Palette p) {
    final scheme = ColorScheme.fromSeed(
      seedColor: brand,
      brightness: p.brightness,
    ).copyWith(
      primary: p.primary,
      onPrimary: onColor(p.primary),
      surface: p.surface,
      onSurface: p.text,
      onSurfaceVariant: p.textMuted,
      outline: p.border,
      outlineVariant: p.border,
      surfaceContainerHighest: p.surfaceMuted,
      error: p.danger,
    );

    final text = ThemeData(brightness: p.brightness, fontFamily: 'PlusJakartaSans').textTheme.apply(
          bodyColor: p.text,
          displayColor: p.text,
        );

    final controlShape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusControl));

    return ThemeData(
      useMaterial3: true,
      brightness: p.brightness,
      fontFamily: 'PlusJakartaSans',
      colorScheme: scheme,
      textTheme: text,
      scaffoldBackgroundColor: p.background,
      canvasColor: p.background,
      dividerColor: p.border,
      appBarTheme: AppBarTheme(
        backgroundColor: p.background,
        foregroundColor: p.text,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(fontFamily: 'PlusJakartaSans', fontSize: 18, fontWeight: FontWeight.w700, color: p.text),
      ),
      // A 1px border instead of a shadow: on a near-white background an
      // un-bordered white card has no visible edge, and shadows everywhere
      // would make every row float (DESIGN.md "Bentuk").
      cardTheme: CardThemeData(
        elevation: 0,
        margin: EdgeInsets.zero,
        color: p.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusCard),
          side: BorderSide(color: p.border),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: p.surfaceMuted,
        hintStyle: TextStyle(color: p.textMuted),
        labelStyle: TextStyle(color: p.textMuted),
        prefixIconColor: p.textMuted,
        suffixIconColor: p.textMuted,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(radiusControl), borderSide: BorderSide.none),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(radiusControl), borderSide: BorderSide.none),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(radiusControl), borderSide: BorderSide(color: p.primary, width: 1.5)),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: p.primary,
          foregroundColor: onColor(p.primary),
          minimumSize: const Size(0, 48),
          padding: const EdgeInsets.symmetric(horizontal: 18),
          shape: controlShape,
          textStyle: const TextStyle(fontFamily: 'PlusJakartaSans', fontWeight: FontWeight.w700, fontSize: 14),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: p.primary,
          foregroundColor: onColor(p.primary),
          elevation: 0,
          minimumSize: const Size(0, 48),
          shape: controlShape,
          textStyle: const TextStyle(fontFamily: 'PlusJakartaSans', fontWeight: FontWeight.w700, fontSize: 14),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: p.text,
          minimumSize: const Size(0, 48),
          padding: const EdgeInsets.symmetric(horizontal: 16),
          side: BorderSide(color: p.border),
          shape: controlShape,
          textStyle: const TextStyle(fontFamily: 'PlusJakartaSans', fontWeight: FontWeight.w700, fontSize: 14),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: p.primary,
          textStyle: const TextStyle(fontFamily: 'PlusJakartaSans', fontWeight: FontWeight.w700, fontSize: 13.5),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: p.surface,
        selectedColor: p.primary,
        disabledColor: p.surfaceMuted,
        side: BorderSide(color: p.border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusPill)),
        showCheckmark: false,
        padding: const EdgeInsets.symmetric(horizontal: 4),
        labelStyle: TextStyle(fontFamily: 'PlusJakartaSans', fontSize: 12.5, fontWeight: FontWeight.w600, color: p.text),
        secondaryLabelStyle: TextStyle(fontFamily: 'PlusJakartaSans', fontSize: 12.5, fontWeight: FontWeight.w700, color: onColor(p.primary)),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: p.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        height: 68,
        indicatorColor: p.primary.withValues(alpha: 0.14),
        iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(color: s.contains(WidgetState.selected) ? p.primary : p.textMuted)),
        labelTextStyle: WidgetStateProperty.resolveWith((s) => TextStyle(
              fontFamily: 'PlusJakartaSans',
              fontSize: 11.5,
              fontWeight: s.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
              color: s.contains(WidgetState.selected) ? p.primary : p.textMuted,
            )),
      ),
      dividerTheme: DividerThemeData(color: p.border, thickness: 1, space: 1),
      listTileTheme: ListTileThemeData(iconColor: p.textMuted, textColor: p.text),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: p.background,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        dragHandleColor: p.border,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(radiusCard + 4))),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: p.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusCard)),
        titleTextStyle: TextStyle(fontFamily: 'PlusJakartaSans', fontSize: 17, fontWeight: FontWeight.w700, color: p.text),
        contentTextStyle: TextStyle(fontFamily: 'PlusJakartaSans', fontSize: 14, height: 1.45, color: p.textMuted),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: p.brightness == Brightness.light ? const Color(0xFF0F172A) : const Color(0xFFE2E8F0),
        contentTextStyle: TextStyle(
          fontFamily: 'PlusJakartaSans',
          fontSize: 13.5,
          color: p.brightness == Brightness.light ? Colors.white : const Color(0xFF0F172A),
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusControl)),
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          shape: WidgetStatePropertyAll(controlShape),
          side: WidgetStatePropertyAll(BorderSide(color: p.border)),
          backgroundColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? p.primary : p.surface),
          foregroundColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? onColor(p.primary) : p.text),
        ),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: p.primary),
      extensions: [p.tones],
    );
  }
}

class _Palette {
  const _Palette({
    required this.brightness,
    required this.background,
    required this.surface,
    required this.surfaceMuted,
    required this.border,
    required this.text,
    required this.textMuted,
    required this.primary,
    required this.danger,
    required this.tones,
  });

  final Brightness brightness;
  final Color background;
  final Color surface;
  final Color surfaceMuted;
  final Color border;
  final Color text;
  final Color textMuted; // 4.7:1 on surface in both themes
  final Color primary;
  final Color danger;
  final AppTones tones;

  static const light = _Palette(
    brightness: Brightness.light,
    background: Color(0xFFF3F5F9),
    surface: Colors.white,
    surfaceMuted: Color(0xFFF1F4F8),
    border: Color(0xFFE3E8EF),
    text: Color(0xFF0F172A),
    textMuted: Color(0xFF5B6678),
    primary: Color(0xFF2563EB),
    danger: Color(0xFFB91C1C),
    tones: AppTones.light,
  );

  static const dark = _Palette(
    brightness: Brightness.dark,
    background: Color(0xFF0B1120),
    surface: Color(0xFF131B2C),
    surfaceMuted: Color(0xFF1B2537),
    border: Color(0xFF253047),
    text: Color(0xFFE6EAF2),
    textMuted: Color(0xFF9AA6BA),
    primary: Color(0xFF5B8DEF),
    danger: Color(0xFFF87171),
    tones: AppTones.dark,
  );
}

/// Semantic tones. Each has one shade per theme: the -700 shades that pass
/// 4.5:1 as text on white would be ~3:1 on the dark surface, so dark mode
/// gets the -400 shades instead. Screens never pick a raw hex — they ask
/// for a [Tone] through [ToneContext.tone].
enum Tone { primary, accent, success, warning, danger, neutral, violet }

class AppTones extends ThemeExtension<AppTones> {
  const AppTones(this.colors);
  final Map<Tone, Color> colors;

  static const light = AppTones({
    Tone.primary: Color(0xFF2563EB),
    Tone.accent: Color(0xFF4F46E5),
    Tone.success: Color(0xFF15803D),
    Tone.warning: Color(0xFFB45309),
    // red-700: red-600 is 4.8:1 on white and drops below 4.5:1 once it
    // sits on its own pill tint.
    Tone.danger: Color(0xFFB91C1C),
    Tone.neutral: Color(0xFF5B6678),
    Tone.violet: Color(0xFF7E22CE),
  });

  static const dark = AppTones({
    Tone.primary: Color(0xFF6EA0F7),
    Tone.accent: Color(0xFF8B93F8),
    Tone.success: Color(0xFF4ADE80),
    Tone.warning: Color(0xFFFBBF24),
    Tone.danger: Color(0xFFF87171),
    Tone.neutral: Color(0xFF9AA6BA),
    Tone.violet: Color(0xFFC084FC),
  });

  @override
  AppTones copyWith({Map<Tone, Color>? colors}) => AppTones(colors ?? this.colors);

  @override
  AppTones lerp(ThemeExtension<AppTones>? other, double t) => t < 0.5 ? this : (other as AppTones? ?? this);
}

extension ToneContext on BuildContext {
  Color tone(Tone t) => (Theme.of(this).extension<AppTones>() ?? AppTones.light).colors[t]!;
  ColorScheme get colors => Theme.of(this).colorScheme;
}

/// Spacing scale — every gap in the app is one of these, so vertical rhythm
/// is the same on every screen instead of 10/14/18/20/22 picked ad hoc.
class Gap {
  Gap._();
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 24.0;
  static const page = 16.0;
}

/// Near-black or white, whichever reads against [background]. 0.179 is the
/// luminance where both give equal contrast.
Color onColor(Color background) {
  return background.computeLuminance() > 0.179 ? const Color(0xFF0B1120) : Colors.white;
}

/// Status → tone, reusing the meanings staff already read on the web panel
/// (green = lunas/aktif, amber = menunggu/isolir, red = terlambat/stop).
Tone statusTone(String status) {
  switch (status.toLowerCase()) {
    case 'active':
    case 'paid':
    case 'approved':
    case 'installed':
    case 'success':
    case 'completed':
    case 'credited':
    case 'resolved':
      return Tone.success;
    case 'isolated':
    case 'overdue':
    case 'pending':
    case 'waiting':
    case 'suspended':
    case 'in_progress':
    case 'waiting_customer':
      return Tone.warning;
    case 'stop':
    case 'stopped':
    case 'blocked':
    case 'cancelled':
    case 'rejected':
    case 'failed':
    case 'expired':
      return Tone.danger;
    case 'open':
      return Tone.primary;
    default:
      return Tone.neutral;
  }
}

/// Indonesian label for the same statuses — the web panel shows these in
/// Indonesian, so raw enum strings never reach staff.
String statusLabel(String status) {
  const labels = {
    'active': 'Aktif',
    'isolated': 'Terisolir',
    'suspended': 'Suspend',
    'stop': 'Stop',
    'stopped': 'Berhenti',
    'blocked': 'Diblokir',
    'paid': 'Lunas',
    'pending': 'Menunggu',
    'overdue': 'Terlambat',
    'cancelled': 'Dibatalkan',
    'approved': 'Disetujui',
    'installed': 'Terpasang',
    'rejected': 'Ditolak',
    'success': 'Berhasil',
    'failed': 'Gagal',
    'completed': 'Selesai',
    'expired': 'Kedaluwarsa',
    'waiting': 'Belum Dipakai',
    'credited': 'Dicairkan',
    'open': 'Baru',
    'in_progress': 'Diproses',
    'waiting_customer': 'Menunggu Pelanggan',
    'resolved': 'Selesai',
    'closed': 'Ditutup',
  };
  return labels[status.toLowerCase()] ?? status;
}

/// The app's repeated identity motif (DESIGN.md "Motif"): a tinted
/// rounded-square holding an icon in its tone.
class RoleIconTile extends StatelessWidget {
  const RoleIconTile({super.key, required this.icon, required this.color, this.size = 42});
  final IconData icon;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color.withValues(alpha: Theme.of(context).brightness == Brightness.dark ? 0.16 : 0.10),
        borderRadius: BorderRadius.circular(size * 0.3),
      ),
      child: Icon(icon, color: color, size: size * 0.5),
    );
  }
}

/// Second motif: a small muted label over a large bold figure.
class LabeledFigure extends StatelessWidget {
  const LabeledFigure({super.key, required this.label, required this.value, this.color, this.valueSize = 20});
  final String label;
  final String value;
  final Color? color;
  final double valueSize;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: context.colors.onSurfaceVariant)),
        const SizedBox(height: 2),
        Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: valueSize, fontWeight: FontWeight.w800, color: color, height: 1.15)),
      ],
    );
  }
}
