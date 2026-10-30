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
    duration: const Duration(milliseconds: 1600),
  )..forward();

  late final _logoScale = CurvedAnimation(parent: _controller, curve: const Interval(0.0, 0.55, curve: Curves.easeOutBack));
  late final _logoFade = CurvedAnimation(parent: _controller, curve: const Interval(0.0, 0.25));
  late final _glow = CurvedAnimation(parent: _controller, curve: const Interval(0.05, 0.65, curve: Curves.easeOut));
  late final _titleIn = CurvedAnimation(parent: _controller, curve: const Interval(0.3, 0.72, curve: Curves.easeOut));
  late final _subIn = CurvedAnimation(parent: _controller, curve: const Interval(0.45, 0.88, curve: Curves.easeOut));
  late final _bar = CurvedAnimation(parent: _controller, curve: const Interval(0.15, 1.0, curve: Curves.easeInOut));
  late final _footIn = CurvedAnimation(parent: _controller, curve: const Interval(0.7, 1.0));

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Widget _buildMark() {
    return Stack(
      alignment: Alignment.center,
      children: [
        AnimatedBuilder(
          animation: _glow,
          builder: (_, __) => Transform.scale(
            scale: 0.55 + 0.45 * _glow.value,
            child: Opacity(
              opacity: 0.6 * _glow.value,
              child: Container(
                width: 180,
                height: 180,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      AppTheme.brand.withValues(alpha: 0.32),
                      AppTheme.brand.withValues(alpha: 0.0),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
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
                boxShadow: [
                  BoxShadow(
                    color: AppTheme.brand.withValues(alpha: 0.35),
                    blurRadius: 28,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: const Icon(Icons.payments_rounded, color: Colors.white, size: 36),
            ),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: Stack(
          children: [
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _buildMark(),
                  const SizedBox(height: Gap.xl),
                  FadeTransition(
                    opacity: _titleIn,
                    child: SlideTransition(
                      position: Tween<Offset>(begin: const Offset(0, 0.4), end: Offset.zero).animate(_titleIn),
                      child: const Text('Salfanet Kolektor', style: TextStyle(fontSize: 21, fontWeight: FontWeight.w800, height: 1.2)),
                    ),
                  ),
                  const SizedBox(height: Gap.xs),
                  FadeTransition(
                    opacity: _subIn,
                    child: SlideTransition(
                      position: Tween<Offset>(begin: const Offset(0, 0.35), end: Offset.zero).animate(_subIn),
                      child: Text('Alat kerja penagih lapangan', style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant)),
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
            Positioned(
              left: 0,
              right: 0,
              bottom: 24,
              child: FadeTransition(
                opacity: _footIn,
                child: Text(
                  'Powered by Salfanet Radius',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 11, letterSpacing: 0.4, color: scheme.outline),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
