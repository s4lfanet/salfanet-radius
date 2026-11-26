import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Tab teks dengan garis bawah untuk filter (status, periode). Menggulir
/// mendatar bila tidak muat, jadi label tidak pernah dikecilkan atau terpotong.
class UnderlineTabs extends StatelessWidget {
  const UnderlineTabs({super.key, required this.options, required this.selected, required this.onSelected, this.padding = const EdgeInsets.symmetric(horizontal: Gap.page), this.fill = false});

  /// Bagi lebar rata ke semua tab (tanpa geser) — untuk 3–5 tab berlabel pendek.
  final bool fill;

  final List<(String value, String label)> options;
  final String selected;
  final ValueChanged<String> onSelected;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return DecoratedBox(
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.outlineVariant))),
      child: Padding(
        padding: padding,
        child: Row(
          children: [
            for (final o in options)
              Expanded(
                flex: o.$2.length + 4,
                child: InkWell(
                onTap: () => onSelected(o.$1),
                child: Container(
                  alignment: Alignment.center,
                  padding: const EdgeInsets.fromLTRB(2, 11, 2, 10),
                  decoration: BoxDecoration(
                    border: Border(bottom: BorderSide(color: selected == o.$1 ? c.primary : Colors.transparent, width: 2.5)),
                  ),
                  child: FittedBox(fit: BoxFit.scaleDown, child: Text(
                    o.$2,
                    style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: selected == o.$1 ? FontWeight.w800 : FontWeight.w600,
                      color: selected == o.$1 ? c.primary : c.onSurfaceVariant,
                    ),
                  )),
                ),
              ),
              ),
          ],
        ),
      ),
    );
  }
}
