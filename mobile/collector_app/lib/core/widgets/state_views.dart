import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Empty state: says what's missing and, where there is one, what to do
/// about it (R-27) — not a bare "Tidak ada data".
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.message, this.hint, this.action});

  final IconData icon;
  final String message;
  final String? hint;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return _Centered(
      children: [
        RoleIconTile(icon: icon, color: context.tone(Tone.neutral), size: 56),
        const SizedBox(height: Gap.lg),
        Text(
          message,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
        ),
        if (hint != null) ...[
          const SizedBox(height: Gap.xs),
          Text(
            hint!,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, height: 1.4, color: context.colors.onSurfaceVariant),
          ),
        ],
        if (action != null) ...[const SizedBox(height: Gap.lg), action!],
      ],
    );
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final forbidden = message.toLowerCase().contains('forbidden') || message.toLowerCase().contains('permission');
    return _Centered(
      children: [
        RoleIconTile(icon: forbidden ? Icons.lock_outline_rounded : Icons.cloud_off_rounded, color: context.tone(Tone.danger), size: 56),
        const SizedBox(height: Gap.lg),
        Text(forbidden ? 'Akses ditolak' : 'Gagal memuat data', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
        const SizedBox(height: Gap.xs),
        Text(
          forbidden ? 'Akun Anda tidak punya izin untuk membuka menu ini. Minta Super Admin menambahkan izinnya.' : message,
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, height: 1.4, color: context.colors.onSurfaceVariant),
        ),
        if (onRetry != null && !forbidden) ...[
          const SizedBox(height: Gap.lg),
          OutlinedButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh_rounded, size: 18), label: const Text('Coba Lagi')),
        ],
      ],
    );
  }
}

class _Centered extends StatelessWidget {
  const _Centered({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    // Scrollable so pull-to-refresh still works on an empty/error screen.
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 32),
              child: Column(mainAxisSize: MainAxisSize.min, children: children),
            ),
          ),
        ),
      ),
    );
  }
}

class LoadingView extends StatelessWidget {
  const LoadingView({super.key});

  @override
  Widget build(BuildContext context) => const Center(child: CircularProgressIndicator());
}

/// Loading / error / empty / content — the four states every data screen
/// needs, in one place so every screen handles them the same way.
class DataStateView extends StatelessWidget {
  const DataStateView({
    super.key,
    required this.loading,
    required this.error,
    required this.isEmpty,
    required this.emptyIcon,
    required this.emptyMessage,
    required this.child,
    this.emptyHint,
    this.onRetry,
    this.emptyAction,
  });

  final bool loading;
  final String? error;
  final bool isEmpty;
  final IconData emptyIcon;
  final String emptyMessage;
  final String? emptyHint;
  final Widget child;
  final VoidCallback? onRetry;
  final Widget? emptyAction;

  @override
  Widget build(BuildContext context) {
    if (loading) return const LoadingView();
    if (error != null) {
      return onRetry != null
          ? RefreshIndicator(
              onRefresh: () async => onRetry!(),
              child: ErrorView(message: error!, onRetry: onRetry),
            )
          : ErrorView(message: error!);
    }
    if (isEmpty) {
      final empty = EmptyState(icon: emptyIcon, message: emptyMessage, hint: emptyHint, action: emptyAction);
      return onRetry != null ? RefreshIndicator(onRefresh: () async => onRetry!(), child: empty) : empty;
    }
    return child;
  }
}
