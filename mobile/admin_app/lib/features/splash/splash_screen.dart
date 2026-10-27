import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

/// Branded first screen after the OS splash. Auth restores in the
/// background while the mark settles in; _AuthGate keeps this up for a
/// fixed hold so the motion reads once instead of flashing past.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1500),
  )..forward();

  late final _logoScale = CurvedAnimation(parent: _controller, curve: const Interval(0.0, 0.55, curve: Curves.easeOutBack));
  late final _logoFade = CurvedAnimation(parent: _controller, curve: const Interval(0.0, 0.25));
  late final _textIn = CurvedAnimation(parent: _controller, curve: const Interval(0.3, 0.8, curve: Curves.easeOut));
  late final _bar = CurvedAnimation(parent: _controller, curve: Curves.easeInOut);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ScaleTransition(
              scale: _logoScale,
              child: FadeTransition(
                opacity: _logoFade,
                child: Container(
                  width: 76,
                  height: 76,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [AppTheme.brand, AppTheme.brandDeep],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(AppTheme.radiusBrand),
                  ),
                  child: const Icon(Icons.shield_rounded, color: Colors.white, size: 36),
                ),
              ),
            ),
            const SizedBox(height: Gap.xl),
            FadeTransition(
              opacity: _textIn,
              child: SlideTransition(
                position: Tween<Offset>(begin: const Offset(0, 0.4), end: Offset.zero).animate(_textIn),
                child: Column(
                  children: [
                    const Text('Salfanet Admin', style: TextStyle(fontSize: 21, fontWeight: FontWeight.w800, height: 1.2)),
                    const SizedBox(height: Gap.xs),
                    Text('Panel operasional & monitoring', style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: Gap.xl + Gap.sm),
            SizedBox(
              width: 132,
              child: AnimatedBuilder(
                animation: _bar,
                builder: (_, __) => ClipRRect(
                  borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                  child: LinearProgressIndicator(
                    value: _bar.value,
                    minHeight: 3,
                    backgroundColor: scheme.surfaceContainerHighest,
                    valueColor: const AlwaysStoppedAnimation(AppTheme.brand),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
