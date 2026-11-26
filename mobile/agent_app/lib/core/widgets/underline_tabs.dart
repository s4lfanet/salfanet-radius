import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Tab teks dengan garis bawah untuk filter (status, periode). Menggulir
/// mendatar bila tidak muat, jadi label tidak pernah dikecilkan atau terpotong.
class UnderlineTabs extends StatelessWidget {
  const UnderlineTabs({super.key, required this.options, required this.selected, required this.onSelected, this.padding = const EdgeInsets.symmetric(horizontal: Gap.page)});

  final List<(String value, String label)> options;
  final String selected;
  final ValueChanged<String> onSelected;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return DecoratedBox(
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.outlineVariant))),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: padding,
        child: Row(
          children: [
            for (final o in options)
              InkWell(
                onTap: () => onSelected(o.$1),
                child: Container(
                  padding: const EdgeInsets.fromLTRB(2, 10, 2, 10),
                  margin: const EdgeInsets.only(right: Gap.xl),
                  decoration: BoxDecoration(
                    border: Border(bottom: BorderSide(color: selected == o.$1 ? c.primary : Colors.transparent, width: 2.5)),
                  ),
                  child: Text(
                    o.$2,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: selected == o.$1 ? FontWeight.w800 : FontWeight.w600,
                      color: selected == o.$1 ? c.primary : c.onSurfaceVariant,
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
