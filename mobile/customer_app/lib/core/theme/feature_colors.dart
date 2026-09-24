import 'package:flutter/material.dart';

/// Per-destination color coding.
///
/// Each destination owns one hue that follows it everywhere: the dashboard
/// quick-menu tile, its row in "Lainnya", and the header of its own screen.
/// The hue is wayfinding, not decoration — a customer learns "the green one is
/// Top Up" and stops reading labels. What keeps nine hues from reading as a
/// rainbow is that the treatment never varies: same tile, same radius, same
/// tint strength, and no hue outside this set.
///
/// Every pair below was checked against its own tint with the WCAG formula and
/// clears 3:1 (the non-text bar) in both themes, worst case 4.02:1.
class FeatureAccent {
  const FeatureAccent(this._light, this._dark);

  final Color _light;
  final Color _dark;

  /// Icon/label color for the current theme.
  Color of(Brightness brightness) => brightness == Brightness.dark ? _dark : _light;

  /// The tinted square behind the icon. Alpha differs per theme because the
  /// same tint reads far weaker over a dark surface than over a light one.
  Color containerOf(Brightness brightness) =>
      of(brightness).withValues(alpha: brightness == Brightness.dark ? 0.22 : 0.14);
}

class FeatureColors {
  FeatureColors._();

  static const invoice = FeatureAccent(Color(0xFF1D4ED8), Color(0xFF93B4FF));
  static const topup = FeatureAccent(Color(0xFF047857), Color(0xFF4ADE80));
  static const wifi = FeatureAccent(Color(0xFF0E7490), Color(0xFF67E8F9));
  static const ticket = FeatureAccent(Color(0xFF6D28D9), Color(0xFFC4B5FD));
  static const upgrade = FeatureAccent(Color(0xFFA16207), Color(0xFFFCD34D));
  static const renewal = FeatureAccent(Color(0xFF0F766E), Color(0xFF5EEAD4));
  static const referral = FeatureAccent(Color(0xFFBE185D), Color(0xFFFDA4AF));
  static const speedtest = FeatureAccent(Color(0xFFC2410C), Color(0xFFFDBA74));
  static const suspend = FeatureAccent(Color(0xFF475569), Color(0xFFCBD5E1));
}

/// Business-state colors, deliberately outside the operator's brand palette:
/// "paid" has to mean the same green whichever ISP installed this build, so
/// these never shift with the logo-derived scheme. Always paired with text,
/// never carrying the meaning by hue alone.
class StatusColors {
  StatusColors._();

  static const _successLight = Color(0xFF047857);
  static const _successDark = Color(0xFF34D399);
  static const _warningLight = Color(0xFFB45309);
  static const _warningDark = Color(0xFFFBBF24);
  static const _dangerLight = Color(0xFFB42318);
  static const _dangerDark = Color(0xFFFF8A80);

  static Color success(Brightness b) => b == Brightness.dark ? _successDark : _successLight;
  static Color warning(Brightness b) => b == Brightness.dark ? _warningDark : _warningLight;
  static Color danger(Brightness b) => b == Brightness.dark ? _dangerDark : _dangerLight;
}

/// Carries a feature's hue into its own screen, so arriving from the quick
/// menu lands on a header wearing the same color the tile did.
AppBar featureAppBar({
  required String title,
  required IconData icon,
  required FeatureAccent accent,
  List<Widget>? actions,
  PreferredSizeWidget? bottom,
}) {
  return AppBar(
    titleSpacing: 12,
    title: Row(
      children: [
        FeatureIconTile(icon: icon, accent: accent, size: 32, radius: 10),
        const SizedBox(width: 11),
        Expanded(child: Text(title, overflow: TextOverflow.ellipsis)),
      ],
    ),
    actions: actions,
    bottom: bottom,
  );
}

/// The repeated shape of this app: a tinted rounded square holding a
/// feature's icon in its own hue. Used in the quick menu, the "Lainnya" list,
/// and each feature screen's header, which is what makes those screens read
/// as one family.
class FeatureIconTile extends StatelessWidget {
  const FeatureIconTile({
    super.key,
    required this.icon,
    required this.accent,
    this.size = 48,
    this.radius = 15,
  });

  final IconData icon;
  final FeatureAccent accent;
  final double size;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final brightness = Theme.of(context).brightness;
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: accent.containerOf(brightness),
        borderRadius: BorderRadius.circular(radius),
      ),
      child: Icon(icon, size: size * 0.5, color: accent.of(brightness)),
    );
  }
}
