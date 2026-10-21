import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_theme.dart';
import '../widgets/entity_tile.dart' show listBottomPadding;

/// The admin panel guides, the same text as the web's Panduan
/// (assets/guides.json, exported with tool/export_guides.ts).
///
/// A screen opened from the menu or a tab is wrapped in [GuideScope] with
/// the web page it mirrors; [GuideAction] in its app bar opens that page's
/// guide, and hides itself when the screen has none.

class Guide {
  Guide({required this.path, required this.title, required this.section, required this.summary, required this.steps, required this.notes, required this.related});

  final String path;
  final String title;
  final String section;
  final String summary;
  final List<String> steps;
  final List<String> notes;
  final List<String> related;

  factory Guide.fromJson(Map<String, dynamic> j) => Guide(
        path: j['path'] as String,
        title: j['title'] as String,
        section: j['section'] as String,
        summary: j['summary'] as String,
        steps: [for (final s in j['steps'] as List) s as String],
        notes: [for (final s in (j['notes'] as List?) ?? const []) s as String],
        related: [for (final r in (j['related'] as List?) ?? const []) (r as Map)['label'] as String],
      );
}

class SetupStep {
  SetupStep({required this.title, required this.detail, required this.pages});
  final String title;
  final String detail;
  final List<String> pages;

  factory SetupStep.fromJson(Map<String, dynamic> j) => SetupStep(
        title: j['title'] as String,
        detail: j['detail'] as String,
        pages: [for (final l in j['links'] as List) (l as Map)['label'] as String],
      );
}

class GuideBook {
  GuideBook(this.setup, this.guides);
  final List<SetupStep> setup;
  final List<Guide> guides;

  static Future<GuideBook>? _loading;

  /// Loaded once from the bundled asset.
  static Future<GuideBook> load() => _loading ??= () async {
        final data = jsonDecode(await rootBundle.loadString('assets/guides.json')) as Map<String, dynamic>;
        return GuideBook(
          [for (final s in data['setup'] as List) SetupStep.fromJson(s as Map<String, dynamic>)],
          [for (final g in data['guides'] as List) Guide.fromJson(g as Map<String, dynamic>)],
        );
      }();

  /// Exact path, or the longest guide path it sits under (as on the web).
  Guide? forPath(String path) {
    Guide? best;
    for (final g in guides) {
      final hit = path == g.path || (g.path != '/admin' && path.startsWith('${g.path}/'));
      if (hit && (best == null || g.path.length > best.path.length)) best = g;
    }
    return best;
  }
}

/// Marks the web page a screen mirrors, for its [GuideAction].
class GuideScope extends InheritedWidget {
  const GuideScope({super.key, required this.path, required super.child});
  final String path;

  static String? of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<GuideScope>()?.path;

  @override
  bool updateShouldNotify(GuideScope oldWidget) => path != oldWidget.path;
}

/// App bar button that opens the guide of the current screen.
class GuideAction extends StatelessWidget {
  const GuideAction({super.key});

  @override
  Widget build(BuildContext context) {
    final path = GuideScope.of(context);
    if (path == null) return const SizedBox.shrink();
    return FutureBuilder<GuideBook>(
      future: GuideBook.load(),
      builder: (context, snap) {
        final guide = snap.data?.forPath(path);
        if (guide == null) return const SizedBox.shrink();
        return IconButton(
          tooltip: 'Panduan',
          icon: const Icon(Icons.menu_book_outlined),
          onPressed: () => showGuideSheet(context, guide),
        );
      },
    );
  }
}

Future<void> showGuideSheet(BuildContext context, Guide guide) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (ctx, scroll) => ListView(
        controller: scroll,
        padding: const EdgeInsets.fromLTRB(Gap.page, 0, Gap.page, Gap.xl),
        children: [
          Text('Panduan', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Theme.of(ctx).colorScheme.primary)),
          const SizedBox(height: 2),
          Text(guide.title, style: Theme.of(ctx).textTheme.titleLarge),
          const SizedBox(height: Gap.md),
          GuideBody(guide: guide),
          const SizedBox(height: Gap.lg),
          Text(
            'Panduan ini ditulis untuk panel web. Di aplikasi, letak tombol bisa sedikit berbeda.',
            style: TextStyle(fontSize: 12, color: ctx.colors.onSurfaceVariant),
          ),
        ],
      ),
    ),
  );
}

/// Summary, numbered steps, notes and related pages of one guide.
class GuideBody extends StatelessWidget {
  const GuideBody({super.key, required this.guide});
  final Guide guide;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final muted = context.colors.onSurfaceVariant;
    final warn = context.tone(Tone.warning);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(guide.summary, style: const TextStyle(fontSize: 14, height: 1.45)),
        const SizedBox(height: Gap.lg),
        Text('Cara pakai', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: muted)),
        const SizedBox(height: Gap.sm),
        for (var i = 0; i < guide.steps.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: Gap.sm),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 22,
                  height: 22,
                  margin: const EdgeInsets.only(top: 1, right: Gap.md),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: scheme.primary.withValues(alpha: 0.14), shape: BoxShape.circle),
                  child: Text('${i + 1}', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: scheme.primary)),
                ),
                Expanded(child: Text(guide.steps[i], style: const TextStyle(fontSize: 14, height: 1.45))),
              ],
            ),
          ),
        if (guide.notes.isNotEmpty) ...[
          const SizedBox(height: Gap.sm),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(Gap.md),
            decoration: BoxDecoration(
              color: warn.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: warn.withValues(alpha: 0.35)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Perhatikan', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: warn)),
                const SizedBox(height: Gap.xs),
                for (final n in guide.notes)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text('•  $n', style: const TextStyle(fontSize: 13.5, height: 1.45)),
                  ),
              ],
            ),
          ),
        ],
        if (guide.related.isNotEmpty) ...[
          const SizedBox(height: Gap.lg),
          Text('Halaman terkait', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: muted)),
          const SizedBox(height: Gap.xs),
          Text(guide.related.join(' · '), style: const TextStyle(fontSize: 13.5, height: 1.45)),
        ],
      ],
    );
  }
}

/// Pusat Panduan: setup order, then every guide grouped like the web
/// sidebar, searchable.
class GuideHubScreen extends StatefulWidget {
  const GuideHubScreen({super.key});

  @override
  State<GuideHubScreen> createState() => _GuideHubScreenState();
}

class _GuideHubScreenState extends State<GuideHubScreen> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final muted = context.colors.onSurfaceVariant;
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Pusat Panduan')),
      body: FutureBuilder<GuideBook>(
        future: GuideBook.load(),
        builder: (context, snap) {
          if (snap.hasError) return Center(child: Text('Panduan tidak bisa dimuat.', style: TextStyle(color: muted)));
          final book = snap.data;
          if (book == null) return const Center(child: CircularProgressIndicator());

          final q = _query.trim().toLowerCase();
          bool match(Guide g) =>
              q.isEmpty || [g.title, g.summary, ...g.steps, ...g.notes].any((t) => t.toLowerCase().contains(q));
          final sections = <String, List<Guide>>{};
          for (final g in book.guides.where(match)) {
            sections.putIfAbsent(g.section, () => []).add(g);
          }

          return ListView(
            padding: EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.page, listBottomPadding(context)),
            children: [
              TextField(
                decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Cari, mis. isolir, voucher, router'),
                onChanged: (v) => setState(() => _query = v),
              ),
              const SizedBox(height: Gap.md),
              if (q.isEmpty) ...[
                Text('Mulai di sini: urutan setup', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 2),
                Text(
                  'Kerjakan berurutan dari panel web. Langkah berikutnya bergantung pada langkah sebelumnya.',
                  style: TextStyle(fontSize: 13, color: muted),
                ),
                const SizedBox(height: Gap.md),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(Gap.md),
                    child: Column(
                      children: [
                        for (var i = 0; i < book.setup.length; i++)
                          Padding(
                            padding: EdgeInsets.only(bottom: i == book.setup.length - 1 ? 0 : Gap.md),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Container(
                                  width: 26,
                                  height: 26,
                                  margin: const EdgeInsets.only(right: Gap.md),
                                  alignment: Alignment.center,
                                  decoration: BoxDecoration(color: scheme.primary, shape: BoxShape.circle),
                                  child: Text('${i + 1}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: scheme.onPrimary)),
                                ),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(book.setup[i].title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                                      const SizedBox(height: 2),
                                      Text(book.setup[i].detail, style: TextStyle(fontSize: 13, height: 1.45, color: muted)),
                                      const SizedBox(height: 4),
                                      Text('Menu: ${book.setup[i].pages.join(', ')}', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: Gap.lg),
              ],
              if (sections.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: Gap.xl),
                  child: Text('Tidak ada panduan yang cocok dengan "$_query".', textAlign: TextAlign.center, style: TextStyle(color: muted)),
                ),
              for (final MapEntry(key: section, value: guides) in sections.entries) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(2, Gap.sm, 0, Gap.sm),
                  child: Text(section, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: muted)),
                ),
                Card(
                  clipBehavior: Clip.antiAlias,
                  child: Column(
                    children: [
                      for (var i = 0; i < guides.length; i++) ...[
                        if (i > 0) const Divider(height: 1),
                        ExpansionTile(
                          key: PageStorageKey(guides[i].path),
                          initiallyExpanded: q.isNotEmpty && guides.length <= 2,
                          shape: const Border(),
                          title: Text(guides[i].title, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
                          subtitle: Text(guides[i].summary, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: muted)),
                          childrenPadding: const EdgeInsets.fromLTRB(Gap.lg, 0, Gap.lg, Gap.lg),
                          children: [GuideBody(guide: guides[i])],
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}
