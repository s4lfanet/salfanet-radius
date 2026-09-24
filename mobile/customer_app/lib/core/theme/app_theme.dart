import 'package:flutter/material.dart';

/// Fallback brand color, matching --color-brand-500 in the web app.
///
/// Only used when the operator's logo can't be read or turns out to be
/// greyscale (see BrandThemeProvider). Also the fixed brand color of the
/// invoice PDF, which has no theme to inherit from.
const Color kBrandSeed = Color(0xFF465FFF);

/// Plus Jakarta Sans, bundled rather than fetched at runtime because
/// customers open this app on the connection they are complaining about.
/// Chosen as Jakarta's city-identity typeface (an Indonesian voice for
/// Indonesian subscribers) with numerals that stay distinct at small sizes,
/// which is most of what this app displays: rupiah, due dates, days left.
const String kFontFamily = 'PlusJakartaSans';

/// Radius as a hierarchy tool, not one value everywhere: the bigger the
/// radius, the higher the element sits in the page's order of importance.
class AppRadius {
  AppRadius._();

  /// The single status card that owns the top of the dashboard.
  static const double hero = 24;

  /// Content cards and menu tiles.
  static const double card = 16;

  /// Buttons, inputs, sheets.
  static const double control = 12;

  /// Status badges only, where the pill shape is the badge's own language.
  static const double pill = 999;
}

class AppTheme {
  AppTheme._();

  /// [derived] comes from the operator's logo when one could be read.
  static ThemeData light([ColorScheme? derived]) =>
      _base(derived ?? ColorScheme.fromSeed(seedColor: kBrandSeed, brightness: Brightness.light));

  static ThemeData dark([ColorScheme? derived]) =>
      _base(derived ?? ColorScheme.fromSeed(seedColor: kBrandSeed, brightness: Brightness.dark));

  static ThemeData _base(ColorScheme scheme) {
    final base = ThemeData(useMaterial3: true, colorScheme: scheme, fontFamily: kFontFamily);

    return base.copyWith(
      scaffoldBackgroundColor: scheme.surface,

      // Values carry the weight, labels stay quiet: the repeated typographic
      // gesture behind every stat block in the app.
      textTheme: base.textTheme.copyWith(
        headlineMedium: base.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.5),
        headlineSmall: base.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.4),
        titleLarge: base.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.2),
        titleMedium: base.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        titleSmall: base.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
        bodyLarge: base.textTheme.bodyLarge?.copyWith(height: 1.4),
        bodyMedium: base.textTheme.bodyMedium?.copyWith(height: 1.4),
        labelLarge: base.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700),
        labelSmall: base.textTheme.labelSmall?.copyWith(fontWeight: FontWeight.w500, letterSpacing: 0.1),
      ),

      appBarTheme: AppBarTheme(
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontFamily: kFontFamily,
          fontSize: 19,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.2,
          color: scheme.onSurface,
        ),
      ),

      // Cards sit one step above the page instead of floating on a shadow, so
      // the eye reads depth from the surface ladder, not from blur.
      cardTheme: CardThemeData(
        elevation: 0,
        color: scheme.surfaceContainerLow,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.card),
          side: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.5)),
        ),
      ),

      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(50),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.control)),
          textStyle: const TextStyle(fontFamily: kFontFamily, fontSize: 15, fontWeight: FontWeight.w700),
        ),
      ),

      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.control)),
          side: BorderSide(color: scheme.outline),
          textStyle: const TextStyle(fontFamily: kFontFamily, fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),

      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          textStyle: const TextStyle(fontFamily: kFontFamily, fontWeight: FontWeight.w600),
        ),
      ),

      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerHigh.withValues(alpha: 0.6),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.control),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.control),
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        // A 2px focused border so keyboard and switch-access users can see
        // which field they are in, in both themes.
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.control),
          borderSide: BorderSide(color: scheme.primary, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.control),
          borderSide: BorderSide(color: scheme.error, width: 1.5),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.control),
          borderSide: BorderSide(color: scheme.error, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        labelStyle: TextStyle(color: scheme.onSurfaceVariant),
      ),

      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        indicatorColor: scheme.primaryContainer,
        elevation: 0,
        height: 68,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        labelTextStyle: WidgetStateProperty.resolveWith((states) => TextStyle(
              fontFamily: kFontFamily,
              fontSize: 11.5,
              fontWeight: states.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
              color: states.contains(WidgetState.selected) ? scheme.onSurface : scheme.onSurfaceVariant,
            )),
      ),

      listTileTheme: ListTileThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.control)),
        titleTextStyle: TextStyle(
          fontFamily: kFontFamily,
          fontSize: 15,
          fontWeight: FontWeight.w600,
          color: scheme.onSurface,
        ),
        subtitleTextStyle: TextStyle(fontFamily: kFontFamily, fontSize: 12.5, color: scheme.onSurfaceVariant),
      ),

      dividerTheme: DividerThemeData(color: scheme.outlineVariant.withValues(alpha: 0.6), thickness: 1, space: 1),

      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.control)),
        contentTextStyle: const TextStyle(fontFamily: kFontFamily),
      ),

      dialogTheme: DialogThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        titleTextStyle: TextStyle(
          fontFamily: kFontFamily,
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: scheme.onSurface,
        ),
      ),

      bottomSheetTheme: const BottomSheetThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      ),

      chipTheme: ChipThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.pill)),
        labelStyle: const TextStyle(fontFamily: kFontFamily, fontSize: 12.5, fontWeight: FontWeight.w600),
        side: BorderSide(color: scheme.outlineVariant),
      ),

      progressIndicatorTheme: ProgressIndicatorThemeData(color: scheme.primary),
    );
  }
}
