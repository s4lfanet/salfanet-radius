import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../media_url.dart';
import 'app_theme.dart';

/// Derives the app's color scheme from the operator's own logo.
///
/// Salfanet Radius is installed by different ISPs, each with their own logo,
/// so a fixed brand color would make every operator's app look like someone
/// else's. The logo is already fetched for the header; this reads its dominant
/// color and seeds Material 3's tonal palette from it, which keeps every
/// foreground/background pair contrast-safe no matter what color comes back.
class BrandThemeProvider extends ChangeNotifier {
  ColorScheme? _light;
  ColorScheme? _dark;
  String? _resolvedFor;
  bool _working = false;

  ThemeData get lightTheme => AppTheme.light(_light);
  ThemeData get darkTheme => AppTheme.dark(_dark);

  /// Safe to call on every CompanyProvider update: it only does work when the
  /// logo URL actually changes.
  Future<void> deriveFrom(String? rawLogoUrl) async {
    final url = resolveMediaUrl(rawLogoUrl);
    if (url == null || url == _resolvedFor || _working) return;

    _working = true;
    try {
      final provider = CachedNetworkImageProvider(url);
      final light = await ColorScheme.fromImageProvider(
        provider: provider,
        brightness: Brightness.light,
      );
      final dark = await ColorScheme.fromImageProvider(
        provider: provider,
        brightness: Brightness.dark,
      );

      // A greyscale or near-white logo yields a colorless seed, which would
      // strip the app of any accent at all. Brand blue is the better failure.
      if (HSLColor.fromColor(light.primary).saturation < 0.15) {
        _resolvedFor = url;
        return;
      }

      _light = light;
      _dark = dark;
      _resolvedFor = url;
      notifyListeners();
    } catch (e) {
      // Branding is cosmetic: an unreadable logo just keeps the fallback theme.
      debugPrint('[BrandTheme] could not read logo colors: $e');
    } finally {
      _working = false;
    }
  }
}
