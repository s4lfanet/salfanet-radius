import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/company/company_logo.dart';
import '../../core/company/company_provider.dart';

/// Branded first screen after the OS splash. Auth restores in the
/// background while the operator's mark settles in; _AuthGate keeps this
/// up for a fixed hold so the motion reads once instead of flashing past.
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

  Widget _buildMark(Color accent, Widget mark) {
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
                width: 190,
                height: 190,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      accent.withValues(alpha: 0.28),
                      accent.withValues(alpha: 0.0),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        ScaleTransition(
          scale: _logoScale,
          child: FadeTransition(opacity: _logoFade, child: mark),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final company = context.watch<CompanyProvider>().info;
    return Scaffold(
      body: SafeArea(
        child: Stack(
          children: [
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _buildMark(scheme.primary, CompanyLogo(company: company, size: 84, radius: 24)),
                  const SizedBox(height: 24),
                  FadeTransition(
                    opacity: _titleIn,
                    child: SlideTransition(
                      position: Tween<Offset>(begin: const Offset(0, 0.4), end: Offset.zero).animate(_titleIn),
                      // The operator's name can land mid-splash (company info
                      // loads over the network); crossfade rather than jump.
                      child: AnimatedSwitcher(
                        duration: const Duration(milliseconds: 250),
                        child: Text(
                          company?.name ?? 'Salfanet',
                          key: ValueKey(company?.name),
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800, height: 1.2),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  FadeTransition(
                    opacity: _subIn,
                    child: SlideTransition(
                      position: Tween<Offset>(begin: const Offset(0, 0.35), end: Offset.zero).animate(_subIn),
                      child: Text('Portal Pelanggan', style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant)),
                    ),
                  ),
                  const SizedBox(height: 32),
                  SizedBox(
                    width: 132,
                    child: AnimatedBuilder(
                      animation: _bar,
                      builder: (_, __) => ClipRRect(
                        borderRadius: BorderRadius.circular(999),
                        child: LinearProgressIndicator(
                          value: _bar.value,
                          minHeight: 3,
                          backgroundColor: scheme.surfaceContainerHighest,
                          valueColor: AlwaysStoppedAnimation(scheme.primary),
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
