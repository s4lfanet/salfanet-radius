import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// The standard list row used by every list screen: tone-tinted icon,
/// title, up to two muted lines, a trailing slot, and an optional footer
/// (usually row actions). One layout for all rows keeps padding, type sizes
/// and badge position identical from screen to screen.
class EntityTile extends StatelessWidget {
  const EntityTile({
    super.key,
    required this.icon,
    required this.tone,
    required this.title,
    this.subtitle,
    this.meta,
    this.trailing,
    this.onTap,
    this.footer,
    this.leading,
    this.onLongPress,
  });

  final IconData icon;
  final Tone tone;
  final String title;
  final String? subtitle;
  final String? meta;
  final Widget? trailing;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final Widget? footer;

  /// Replaces the icon tile when a row needs a different leading visual
  /// (e.g. a receipt thumbnail).
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    final muted = context.colors.onSurfaceVariant;
    final body = Padding(
      padding: const EdgeInsets.fromLTRB(14, 14, 12, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              leading ?? RoleIconTile(icon: icon, color: context.tone(tone)),
              const SizedBox(width: Gap.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700),
                    ),
                    if (subtitle != null && subtitle!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12.5, color: muted),
                      ),
                    ],
                    if (meta != null && meta!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        meta!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 11.5, color: muted),
                      ),
                    ],
                  ],
                ),
              ),
              if (trailing != null) ...[
                const SizedBox(width: Gap.sm),
                // Capped and scaled down rather than overflowing: a long
                // amount or "Menunggu Pelanggan" pill on a 320dp phone
                // should shrink, never push the row past the card edge.
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 132),
                  child: FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerRight, child: trailing!),
                ),
              ],
              if (onTap != null && trailing == null) Icon(Icons.chevron_right_rounded, color: muted, size: 20),
            ],
          ),
          if (footer != null) ...[const SizedBox(height: Gap.md), footer!],
        ],
      ),
    );

    return Card(
      clipBehavior: Clip.antiAlias,
      child: onTap == null && onLongPress == null ? body : InkWell(onTap: onTap, onLongPress: onLongPress, child: body),
    );
  }
}

/// Status pill — radius 999 is reserved for these (DESIGN.md "Bentuk").
class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.label, required this.tone});

  /// Convenience for the common case: label and tone both from a raw status.
  factory StatusPill.status(String status, {Key? key}) => StatusPill(key: key, label: statusLabel(status), tone: statusTone(status));

  final String label;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final c = context.tone(tone);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        // 7% in light mode keeps every tone's text at >=4.5:1 on its own
        // tint (10% dropped danger/success/warning just under).
        color: c.withValues(alpha: Theme.of(context).brightness == Brightness.dark ? 0.18 : 0.07),
        borderRadius: BorderRadius.circular(AppTheme.radiusPill),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: c),
      ),
    );
  }
}

/// Amount + pill stacked, right-aligned — the trailing slot for any row
/// whose deciding field is money.
class AmountTrailing extends StatelessWidget {
  const AmountTrailing({super.key, required this.amount, this.pill});
  final String amount;
  final Widget? pill;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(amount, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
        if (pill != null) ...[const SizedBox(height: 6), pill!],
      ],
    );
  }
}

/// Horizontal filter strip shared by every list with a status filter.
class FilterChipRow extends StatelessWidget {
  const FilterChipRow({super.key, required this.options, required this.selected, required this.onSelected});

  final List<(String value, String label)> options;
  final String? selected;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    final scheme = context.colors;
    return SizedBox(
      height: 48,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: Gap.page, vertical: 6),
        itemCount: options.length,
        separatorBuilder: (_, __) => const SizedBox(width: Gap.sm),
        itemBuilder: (context, i) {
          final (value, label) = options[i];
          final isSelected = selected == value;
          return ChoiceChip(
            label: Text(
              label,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w600,
                // Explicit per state: left to the chip theme, the selected
                // label kept the unselected text color on a blue fill.
                color: isSelected ? onColor(scheme.primary) : scheme.onSurface,
              ),
            ),
            selected: isSelected,
            onSelected: (_) => onSelected(value),
          );
        },
      ),
    );
  }
}

/// Search field with the standard page inset.
class SearchField extends StatelessWidget {
  const SearchField({super.key, required this.hint, required this.onChanged, this.controller});
  final String hint;
  final ValueChanged<String> onChanged;
  final TextEditingController? controller;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, 0),
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        textInputAction: TextInputAction.search,
        decoration: InputDecoration(hintText: hint, prefixIcon: const Icon(Icons.search_rounded)),
      ),
    );
  }
}

/// Pull-to-refresh list with the standard page padding and row gap. Every
/// list screen renders its rows through this.
class RefreshableList extends StatelessWidget {
  const RefreshableList({
    super.key,
    required this.itemCount,
    required this.itemBuilder,
    required this.onRefresh,
    this.controller,
    this.header,
    this.loadingMore = false,
    this.hasFab = false,
  });

  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;
  final Future<void> Function() onRefresh;
  final ScrollController? controller;
  final Widget? header;
  final bool loadingMore;

  /// Set on screens with a floating action button, so the last row can be
  /// scrolled clear of it instead of staying underneath.
  final bool hasFab;

  @override
  Widget build(BuildContext context) {
    final extra = (header != null ? 1 : 0);
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView.separated(
        controller: controller,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, listBottomPadding(context, hasFab: hasFab)),
        itemCount: itemCount + extra + (loadingMore ? 1 : 0),
        separatorBuilder: (_, __) => const SizedBox(height: Gap.sm),
        itemBuilder: (context, i) {
          if (header != null && i == 0) return header!;
          final index = i - extra;
          if (index >= itemCount) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: Gap.lg),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            );
          }
          return itemBuilder(context, index);
        },
      ),
    );
  }
}

/// Bottom padding for any scrollable page body.
///
/// Android 15 (targetSdk 35, Flutter's default) forces edge-to-edge: the app
/// draws under the system navigation bar. A ListView given its own padding
/// does not add that inset, so the last rows sat behind the nav bar and could
/// never be scrolled into view (reported on Sesi Online). Add the inset back,
/// plus room for a floating action button where there is one.
double listBottomPadding(BuildContext context, {bool hasFab = false}) {
  return Gap.xl + MediaQuery.viewPaddingOf(context).bottom + (hasFab ? 72 : 0);
}

/// Section title with an optional trailing action, used above grouped
/// content on dashboards and detail screens.
class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.action, this.onAction});
  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Gap.sm, left: 2),
      child: Row(
        children: [
          Expanded(
            child: Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
          ),
          if (action != null)
            TextButton(
              onPressed: onAction,
              style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
              child: Text(action!),
            ),
        ],
      ),
    );
  }
}
