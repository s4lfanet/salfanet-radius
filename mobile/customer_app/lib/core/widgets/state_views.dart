import 'package:flutter/material.dart';
import '../theme/feature_colors.dart';

/// Keeps a centered state readable while staying pull-to-refresh friendly:
/// RefreshIndicator needs a scrollable child, and a bare Center is not one.
class ScrollableCenter extends StatelessWidget {
  const ScrollableCenter({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: Center(child: Padding(padding: const EdgeInsets.all(28), child: child)),
        ),
      ),
    );
  }
}

/// Empty state.
///
/// [message] must say why the screen is empty and what fills it. "Belum ada
/// data" tells a customer nothing about whether something is broken or simply
/// hasn't happened yet.
class AppEmptyState extends StatelessWidget {
  const AppEmptyState({
    super.key,
    required this.icon,
    required this.accent,
    required this.title,
    required this.message,
    this.action,
  });

  final IconData icon;
  final FeatureAccent accent;
  final String title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        FeatureIconTile(icon: icon, accent: accent, size: 64, radius: 20),
        const SizedBox(height: 18),
        Text(title, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 6),
        Text(
          message,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
        ),
        if (action != null) ...[const SizedBox(height: 20), action!],
      ],
    );
  }
}

/// Error state: what failed, then the way out. Never a bare "terjadi kesalahan".
class AppErrorState extends StatelessWidget {
  const AppErrorState({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 64,
          height: 64,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: scheme.errorContainer,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Icon(Icons.cloud_off_rounded, size: 32, color: scheme.onErrorContainer),
        ),
        const SizedBox(height: 18),
        Text('Gagal memuat data', textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 6),
        Text(
          message,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
        ),
        if (onRetry != null) ...[
          const SizedBox(height: 20),
          OutlinedButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh, size: 18),
            label: const Text('Coba Lagi'),
          ),
        ],
      ],
    );
  }
}

/// Loading state with a label, so it is announced rather than being a silent
/// spinning circle for anyone using a screen reader.
class AppLoadingState extends StatelessWidget {
  const AppLoadingState({super.key, this.label = 'Memuat...'});
  final String label;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 28, width: 28, child: CircularProgressIndicator(strokeWidth: 2.5)),
        const SizedBox(height: 14),
        Text(label, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
      ],
    );
  }
}

/// Small inline label + value block. The typographic motif of the app: the
/// number is what the customer came for, the label just names it.
class StatBlock extends StatelessWidget {
  const StatBlock({
    super.key,
    required this.label,
    required this.value,
    this.valueColor,
    this.icon,
    this.crossAxisAlignment = CrossAxisAlignment.start,
  });

  final String label;
  final String value;
  final Color? valueColor;
  final IconData? icon;
  final CrossAxisAlignment crossAxisAlignment;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: crossAxisAlignment,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(color: scheme.onSurfaceVariant),
        ),
        const SizedBox(height: 3),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 15, color: valueColor ?? scheme.onSurface),
              const SizedBox(width: 4),
            ],
            Text(
              value,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(color: valueColor ?? scheme.onSurface),
            ),
          ],
        ),
      ],
    );
  }
}
