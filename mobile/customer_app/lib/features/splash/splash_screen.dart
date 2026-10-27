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
    final company = context.watch<CompanyProvider>().info;
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ScaleTransition(
              scale: _logoScale,
              child: FadeTransition(
                opacity: _logoFade,
                child: CompanyLogo(company: company, size: 84, radius: 24),
              ),
            ),
            const SizedBox(height: 24),
            FadeTransition(
              opacity: _textIn,
              child: SlideTransition(
                position: Tween<Offset>(begin: const Offset(0, 0.4), end: Offset.zero).animate(_textIn),
                child: Column(
                  children: [
                    // The operator's name can land mid-splash (company info
                    // loads over the network); crossfade rather than jump.
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 250),
                      child: Text(
                        company?.name ?? 'Salfanet',
                        key: ValueKey(company?.name),
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800, height: 1.2),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text('Portal Pelanggan', style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant)),
                  ],
                ),
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
    );
  }
}
