import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_theme.dart';
import 'entity_tile.dart';

/// Top card of every detail screen / sheet: icon, title, subtitle, status,
/// and optionally one large figure (amount, balance) as the focal point.
class DetailHeader extends StatelessWidget {
  const DetailHeader({super.key, required this.icon, required this.tone, required this.title, this.subtitle, this.status, this.figureLabel, this.figure});

  final IconData icon;
  final Tone tone;
  final String title;
  final String? subtitle;
  final Widget? status;
  final String? figureLabel;
  final String? figure;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(Gap.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                RoleIconTile(icon: icon, color: context.tone(tone), size: 48),
                const SizedBox(width: Gap.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, height: 1.25)),
                      if (subtitle != null && subtitle!.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(subtitle!, style: TextStyle(fontSize: 13, color: context.colors.onSurfaceVariant)),
                      ],
                    ],
                  ),
                ),
                if (status != null) ...[const SizedBox(width: Gap.sm), status!],
              ],
            ),
            if (figure != null) ...[const SizedBox(height: Gap.lg), LabeledFigure(label: figureLabel ?? '', value: figure!, valueSize: 24)],
          ],
        ),
      ),
    );
  }
}

/// A titled card of label/value rows. Rows whose value is null or empty are
/// dropped, so callers can list every field the API may return without
/// guarding each one.
class DetailSection extends StatelessWidget {
  const DetailSection({super.key, this.title, required this.rows, this.trailing});
  final String? title;
  final List<InfoRow?> rows;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final visible = rows.whereType<InfoRow>().where((r) => r.hasValue).toList();
    if (visible.isEmpty && trailing == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: Gap.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (title != null)
            Padding(
              padding: const EdgeInsets.only(left: 2, bottom: Gap.sm),
              child: Text(
                title!,
                style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: context.colors.onSurfaceVariant),
              ),
            ),
          Card(
            child: Column(
              children: [
                for (var i = 0; i < visible.length; i++) ...[if (i > 0) const Divider(indent: Gap.lg, endIndent: Gap.lg), visible[i]],
                if (trailing != null) ...[if (visible.isNotEmpty) const Divider(), trailing!],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// One label/value line. [copyable] adds a copy action (usernames,
/// passwords, codes, account numbers are things staff read out or paste).
class InfoRow extends StatelessWidget {
  const InfoRow(this.label, this.value, {super.key, this.copyable = false, this.valueColor, this.onTap, this.trailing});

  final String label;
  final String? value;
  final bool copyable;
  final Color? valueColor;
  final VoidCallback? onTap;
  final Widget? trailing;

  bool get hasValue => value != null && value!.trim().isNotEmpty && value != 'null';

  @override
  Widget build(BuildContext context) {
    final row = Padding(
      padding: const EdgeInsets.symmetric(horizontal: Gap.lg, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(label, style: TextStyle(fontSize: 13, color: context.colors.onSurfaceVariant)),
          ),
          const SizedBox(width: Gap.sm),
          Expanded(
            child: Text(
              value ?? '-',
              style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: valueColor ?? (onTap != null ? context.colors.primary : null)),
            ),
          ),
          if (trailing != null) trailing!,
          if (copyable)
            InkResponse(
              radius: 18,
              onTap: () {
                Clipboard.setData(ClipboardData(text: value ?? ''));
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$label disalin')));
              },
              child: Padding(
                padding: const EdgeInsets.only(left: Gap.sm),
                child: Icon(Icons.copy_rounded, size: 16, color: context.colors.onSurfaceVariant),
              ),
            ),
        ],
      ),
    );
    return onTap == null ? row : InkWell(onTap: onTap, child: row);
  }
}

enum ActionKind { primary, success, danger, warning, neutral }

class ActionSpec {
  const ActionSpec(this.label, this.icon, this.onPressed, {this.kind = ActionKind.primary, this.busy = false});
  final String label;
  final IconData icon;
  final VoidCallback? onPressed;
  final ActionKind kind;
  final bool busy;
}

/// The one way actions are rendered on detail screens and sheets: the
/// first spec is the filled primary action, the rest are outlined, all in
/// one row pinned to the bottom. Replaces the old free-form Wrap of four
/// differently-colored solid buttons (audit-003 #12).
class ActionBar extends StatelessWidget {
  const ActionBar({super.key, required this.actions, this.pinned = true});
  final List<ActionSpec> actions;
  final bool pinned;

  Color _kindColor(BuildContext context, ActionKind kind) {
    switch (kind) {
      case ActionKind.success:
        return context.tone(Tone.success);
      case ActionKind.danger:
        return context.tone(Tone.danger);
      case ActionKind.warning:
        return context.tone(Tone.warning);
      case ActionKind.neutral:
        return context.colors.onSurface;
      case ActionKind.primary:
        return context.colors.primary;
    }
  }

  Widget _button(BuildContext context, ActionSpec a, {required bool filled}) {
    final c = _kindColor(context, a.kind);
    final iconWidget = a.busy
        ? SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: filled ? onColor(c) : c))
        : Icon(a.icon, size: 18);
    final label = Text(a.label, maxLines: 1, overflow: TextOverflow.ellipsis);
    final onPressed = a.busy ? null : a.onPressed;
    if (filled) {
      return FilledButton.icon(
        onPressed: onPressed,
        style: FilledButton.styleFrom(backgroundColor: c, foregroundColor: onColor(c)),
        icon: iconWidget,
        label: label,
      );
    }
    return OutlinedButton.icon(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: a.kind == ActionKind.neutral || a.kind == ActionKind.primary ? null : c,
        side: BorderSide(color: a.kind == ActionKind.neutral || a.kind == ActionKind.primary ? context.colors.outline : c.withValues(alpha: 0.5)),
      ),
      icon: iconWidget,
      label: label,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (actions.isEmpty) return const SizedBox.shrink();
    // Filled primary goes last (rightmost) so the destructive/secondary
    // choice is never where the thumb lands by default.
    final primary = actions.first;
    final rest = actions.skip(1).toList();
    final row = Row(
      children: [
        for (final a in rest) ...[Expanded(child: _button(context, a, filled: false)), const SizedBox(width: Gap.sm)],
        Expanded(child: _button(context, primary, filled: true)),
      ],
    );
    if (!pinned) return row;
    return Container(
      decoration: BoxDecoration(
        color: context.colors.surface,
        border: Border(top: BorderSide(color: context.colors.outline)),
      ),
      padding: const EdgeInsets.fromLTRB(Gap.page, Gap.md, Gap.page, Gap.md),
      child: SafeArea(top: false, child: row),
    );
  }
}

/// Opens a scrollable bottom sheet with a header, sections and actions —
/// the detail view for list rows that don't warrant a full screen.
Future<T?> showDetailSheet<T>(
  BuildContext context, {
  required Widget header,
  List<Widget> sections = const [],
  List<ActionSpec> Function(BuildContext sheetContext)? actions,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (sheetContext) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.72,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (ctx, controller) {
        final acts = actions?.call(sheetContext) ?? const <ActionSpec>[];
        return Column(
          children: [
            Expanded(
              child: ListView(
                controller: controller,
                // With an ActionBar the bar handles the nav-bar inset itself.
                padding: EdgeInsets.fromLTRB(Gap.page, 0, Gap.page, acts.isEmpty ? listBottomPadding(ctx) : Gap.xl),
                children: [header, ...sections],
              ),
            ),
            if (acts.isNotEmpty) ActionBar(actions: acts),
          ],
        );
      },
    ),
  );
}

/// Receipt / proof image that accepts the three shapes the backend stores:
/// a data: URI, an absolute URL, or a path relative to the server.
class ProofImage extends StatelessWidget {
  const ProofImage({super.key, required this.source, required this.baseUrl, this.relativePrefix = '', this.title = 'Bukti Transfer'});
  final String title;
  final String? source;
  final String baseUrl;
  final String relativePrefix;

  ImageProvider? get _provider {
    final raw = source;
    if (raw == null || raw.isEmpty) return null;
    if (raw.startsWith('data:image')) {
      try {
        return MemoryImage(base64Decode(raw.split(',').last));
      } catch (_) {
        return null;
      }
    }
    if (raw.startsWith('http://') || raw.startsWith('https://')) return NetworkImage(raw);
    final path = raw.startsWith('/') ? raw : '$relativePrefix$raw';
    return NetworkImage('$baseUrl${path.startsWith('/') ? '' : '/'}$path');
  }

  @override
  Widget build(BuildContext context) {
    final provider = _provider;
    if (provider == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: Gap.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 2, bottom: Gap.sm),
            child: Text(
              title,
              style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: context.colors.onSurfaceVariant),
            ),
          ),
          GestureDetector(
            onTap: () => showDialog(
              context: context,
              builder: (_) => Dialog(
                insetPadding: const EdgeInsets.all(Gap.md),
                clipBehavior: Clip.antiAlias,
                child: InteractiveViewer(
                  child: Image(image: provider, fit: BoxFit.contain),
                ),
              ),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(AppTheme.radiusCard),
              child: Image(
                image: provider,
                height: 260,
                fit: BoxFit.cover,
                errorBuilder: (context, _, __) => Container(
                  height: 120,
                  alignment: Alignment.center,
                  color: context.colors.surfaceContainerHighest,
                  child: Text('Gambar bukti tidak bisa dimuat', style: TextStyle(color: context.colors.onSurfaceVariant)),
                ),
                loadingBuilder: (context, child, progress) =>
                    progress == null ? child : const SizedBox(height: 160, child: Center(child: CircularProgressIndicator())),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
