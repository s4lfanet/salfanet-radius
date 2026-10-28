import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/app_theme.dart';

/// In-app user guide ("Panduan") — helps customers understand each feature.
/// Content ships in assets/guides.json so it can be revised without touching
/// code; entries carry an icon key mapped here.
class GuideEntry {
  const GuideEntry({required this.icon, required this.title, required this.summary, required this.steps, required this.notes});

  final IconData icon;
  final String title;
  final String summary;
  final List<String> steps;
  final List<String> notes;

  static const _icons = <String, IconData>{
    'home': Icons.home_rounded,
    'invoice': Icons.receipt_long_rounded,
    'wifi': Icons.wifi_rounded,
    'ticket': Icons.support_agent_rounded,
    'renewal': Icons.autorenew_rounded,
    'upgrade': Icons.trending_up_rounded,
    'topup': Icons.card_giftcard_rounded,
    'suspend': Icons.pause_circle_outline_rounded,
    'speedtest': Icons.network_check_rounded,
    'bell': Icons.notifications_rounded,
    'profile': Icons.person_rounded,
  };

  factory GuideEntry.fromJson(Map<String, dynamic> j) => GuideEntry(
        icon: _icons[j['icon']] ?? Icons.menu_book_rounded,
        title: j['title'] as String,
        summary: j['summary'] as String,
        steps: [for (final s in j['steps'] as List) s as String],
        notes: [for (final s in (j['notes'] as List?) ?? const []) s as String],
      );
}

class GuideScreen extends StatelessWidget {
  const GuideScreen({super.key});

  Future<List<GuideEntry>> _load() async {
    final data = jsonDecode(await rootBundle.loadString('assets/guides.json')) as Map<String, dynamic>;
    return [for (final g in data['guides'] as List) GuideEntry.fromJson(g as Map<String, dynamic>)];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Panduan')),
      body: FutureBuilder<List<GuideEntry>>(
        future: _load(),
        builder: (context, snap) {
          final guides = snap.data;
          if (guides == null) {
            return const Center(child: CircularProgressIndicator());
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
            itemCount: guides.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, i) {
              final g = guides[i];
              final scheme = Theme.of(context).colorScheme;
              return Card(
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: () => _showGuide(context, g),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    child: Row(
                      children: [
                        Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: scheme.primaryContainer,
                            borderRadius: BorderRadius.circular(AppRadius.control),
                          ),
                          child: Icon(g.icon, size: 20, color: scheme.onPrimaryContainer),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(g.title, style: Theme.of(context).textTheme.titleSmall),
                              const SizedBox(height: 2),
                              Text(
                                g.summary,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                              ),
                            ],
                          ),
                        ),
                        Icon(Icons.chevron_right_rounded, color: scheme.onSurfaceVariant),
                      ],
                    ),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  void _showGuide(BuildContext context, GuideEntry g) {
    final scheme = Theme.of(context).colorScheme;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.7,
        minChildSize: 0.4,
        maxChildSize: 0.95,
        builder: (ctx, scroll) => ListView(
          controller: scroll,
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
          children: [
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: scheme.primaryContainer,
                    borderRadius: BorderRadius.circular(AppRadius.control),
                  ),
                  child: Icon(g.icon, size: 22, color: scheme.onPrimaryContainer),
                ),
                const SizedBox(width: 12),
                Expanded(child: Text(g.title, style: Theme.of(ctx).textTheme.titleLarge)),
              ],
            ),
            const SizedBox(height: 12),
            Text(g.summary, style: Theme.of(ctx).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
            if (g.steps.isNotEmpty) ...[
              const SizedBox(height: 20),
              ...g.steps.asMap().entries.map((e) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 22,
                          height: 22,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(color: scheme.primary, shape: BoxShape.circle),
                          child: Text('${e.key + 1}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: scheme.onPrimary)),
                        ),
                        const SizedBox(width: 10),
                        Expanded(child: Text(e.value, style: Theme.of(ctx).textTheme.bodyMedium)),
                      ],
                    ),
                  )),
            ],
            if (g.notes.isNotEmpty) ...[
              const SizedBox(height: 8),
              ...g.notes.map((n) => Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: scheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(AppRadius.control),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.info_outline_rounded, size: 16, color: scheme.primary),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(n, style: Theme.of(ctx).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                        ),
                      ],
                    ),
                  )),
            ],
          ],
        ),
      ),
    );
  }
}
