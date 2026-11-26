import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Pilihan tunggal dalam grid rata (tanpa geser): [columns] kolom, sel sama lebar.
class FilterGrid extends StatelessWidget {
  const FilterGrid({super.key, required this.options, required this.selected, required this.onSelected, this.columns = 3, this.padding = const EdgeInsets.symmetric(horizontal: Gap.page)});

  final List<(String value, String label)> options;
  final String selected;
  final ValueChanged<String> onSelected;
  final int columns;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final rows = <List<(String, String)>>[];
    for (var i = 0; i < options.length; i += columns) {
      rows.add(options.sublist(i, i + columns > options.length ? options.length : i + columns));
    }
    return Padding(
      padding: padding,
      child: Column(
        children: [
          for (var r = 0; r < rows.length; r++) ...[
            if (r > 0) const SizedBox(height: Gap.sm),
            Row(
              children: [
                for (var i = 0; i < columns; i++) ...[
                  if (i > 0) const SizedBox(width: Gap.sm),
                  Expanded(
                    child: i < rows[r].length
                        ? _Cell(
                            label: rows[r][i].$2,
                            selected: selected == rows[r][i].$1,
                            onTap: () => onSelected(rows[r][i].$1),
                            primary: c.primary,
                            muted: c.onSurfaceVariant,
                            border: c.outline,
                            surface: c.surface,
                          )
                        : const SizedBox.shrink(),
                  ),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _Cell extends StatelessWidget {
  const _Cell({required this.label, required this.selected, required this.onTap, required this.primary, required this.muted, required this.border, required this.surface});
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Color primary, muted, border, surface;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? primary : surface,
      borderRadius: BorderRadius.circular(AppTheme.radiusControl),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppTheme.radiusControl),
        onTap: onTap,
        child: Container(
          height: 40,
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 4),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppTheme.radiusControl),
            border: Border.all(color: selected ? primary : border.withValues(alpha: 0.5)),
          ),
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: selected ? onColor(primary) : muted)),
          ),
        ),
      ),
    );
  }
}
