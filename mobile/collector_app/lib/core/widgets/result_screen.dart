import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';

import '../theme/app_theme.dart';
import 'detail.dart';
import 'entity_tile.dart';

/// Shows what a server action produced — credentials, generated RouterOS
/// scripts, command output — with copy/share, so staff can paste it into
/// Winbox or send it to the technician on site.
Future<void> showResultScreen(
  BuildContext context, {
  required String title,
  required Map<String, dynamic> data,
  String? intro,
  Map<String, String> labels = const {},
  List<String> scriptKeys = const ['script', 'scriptRos7', 'scriptRos6', 'routerosScript', 'output', 'log', 'logs', 'config'],
  List<String> hiddenKeys = const ['success', 'message'],
}) {
  return Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => _ResultScreen(title: title, data: data, intro: intro, labels: labels, scriptKeys: scriptKeys, hiddenKeys: hiddenKeys),
    ),
  );
}

class _ResultScreen extends StatelessWidget {
  const _ResultScreen({required this.title, required this.data, required this.intro, required this.labels, required this.scriptKeys, required this.hiddenKeys});
  final String title;
  final Map<String, dynamic> data;
  final String? intro;
  final Map<String, String> labels;
  final List<String> scriptKeys;
  final List<String> hiddenKeys;

  /// Nested maps (e.g. `credentials`, `client`) are flattened one level so
  /// their fields show as rows too.
  Map<String, Object?> get _flat {
    final out = <String, Object?>{};
    for (final e in data.entries) {
      if (hiddenKeys.contains(e.key) || scriptKeys.contains(e.key)) continue;
      if (e.value is Map) {
        for (final n in (e.value as Map).entries) {
          if (n.value is! Map && n.value is! List) out['${e.key}.${n.key}'] = n.value;
        }
      } else if (e.value is! List) {
        out[e.key] = e.value;
      }
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final message = data['message']?.toString();
    final scripts = [
      for (final k in scriptKeys)
        if (data[k] is String && (data[k] as String).trim().isNotEmpty) (k, data[k] as String),
    ];
    final rows = _flat.entries.where((e) => e.value != null && '${e.value}'.isNotEmpty).toList();
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: ListView(
        padding: EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, listBottomPadding(context)),
        children: [
          if (intro != null || message != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(Gap.lg),
                child: Text([intro, message].whereType<String>().join('\n\n'), style: const TextStyle(height: 1.4)),
              ),
            ),
          if (rows.isNotEmpty) DetailSection(rows: [for (final e in rows) InfoRow(labels[e.key] ?? e.key, '${e.value}', copyable: true)]),
          for (final (key, text) in scripts) _ScriptBlock(label: labels[key] ?? key, text: text),
        ],
      ),
    );
  }
}

class _ScriptBlock extends StatelessWidget {
  const _ScriptBlock({required this.label, required this.text});
  final String label;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: Gap.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: context.colors.onSurfaceVariant),
                ),
              ),
              IconButton(
                tooltip: 'Salin',
                icon: const Icon(Icons.copy_rounded, size: 18),
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: text));
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$label disalin')));
                },
              ),
              IconButton(
                tooltip: 'Bagikan',
                icon: const Icon(Icons.share_rounded, size: 18),
                onPressed: () => Share.share(text, subject: label),
              ),
            ],
          ),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(Gap.md),
              child: SelectableText(text, style: const TextStyle(fontFamily: 'monospace', fontSize: 12, height: 1.35)),
            ),
          ),
        ],
      ),
    );
  }
}
