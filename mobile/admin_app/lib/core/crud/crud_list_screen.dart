import 'dart:async';

import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../forms/field_spec.dart';
import '../forms/form_screen.dart';
import '../theme/app_theme.dart';
import '../widgets/detail.dart';
import '../widgets/dialogs.dart';
import '../widgets/entity_tile.dart';
import '../widgets/result_screen.dart';
import '../widgets/state_views.dart';

typedef Json = Map<String, dynamic>;

/// A per-row or toolbar action beyond add/edit/delete (sync, test,
/// restart, reset password …). [run] returns true when the list should
/// reload afterwards.
class CrudAction {
  const CrudAction(this.label, this.icon, this.run, {this.kind = ActionKind.neutral, this.visible});
  final String label;
  final IconData icon;
  final ActionKind kind;
  final Future<bool> Function(BuildContext context, Json item) run;
  final bool Function(Json item)? visible;
}

/// Declarative description of one admin resource: how to list it, how a
/// row and its detail look, and which mutations it supports. Every web
/// CRUD page that is "table + modal form + delete" maps onto this, so the
/// app gets them all with one tested implementation.
class CrudConfig {
  const CrudConfig({
    required this.title,
    required this.noun,
    required this.icon,
    required this.fetch,
    required this.titleOf,
    this.tone = Tone.primary,
    this.listKey,
    this.parse,
    this.subtitleOf,
    this.metaOf,
    this.trailingOf,
    this.iconOf,
    this.toneOf,
    this.statusOf,
    this.figureOf,
    this.figureLabel,
    this.sectionsOf,
    this.fields,
    this.initialOf,
    this.create,
    this.update,
    this.delete,
    this.deleteMessage,
    this.canEdit,
    this.canDelete,
    this.itemActions = const [],
    this.toolbar = const [],
    this.filters,
    this.filterParam = 'status',
    this.filterOf,
    this.initialFilter,
    this.searchable = true,
    this.searchHint,
    this.searchParam,
    this.searchTextOf,
    this.emptyIcon,
    this.emptyMessage,
    this.emptyHint,
    this.header,
    this.onOpen,
    this.createLabel,
    this.bulkActions = const [],
    this.idKey = 'id',
    this.fetchLimitNote,
    this.afterCreate,
  });

  final String title;

  /// Singular name used in messages: "Area disimpan", "Hapus Area?".
  final String noun;
  final IconData icon;
  final Tone tone;

  /// Loads the list. Receives the active search/filter as query params
  /// when [searchParam] / [filterParam] are server-side.
  final Future<dynamic> Function(Json query) fetch;
  final String? listKey;
  final List<Json> Function(dynamic res)? parse;

  final String Function(Json item) titleOf;
  final String? Function(Json item)? subtitleOf;
  final String? Function(Json item)? metaOf;
  final Widget? Function(BuildContext context, Json item)? trailingOf;
  final IconData Function(Json item)? iconOf;
  final Tone Function(Json item)? toneOf;
  final Widget? Function(Json item)? statusOf;
  final String? Function(Json item)? figureOf;
  final String? figureLabel;

  /// Detail sheet body. Defaults to one section listing every form field.
  final List<Widget> Function(BuildContext context, Json item)? sectionsOf;

  /// Form fields; [item] is null when creating.
  final List<FieldSpec> Function(Json? item)? fields;

  /// Maps a record onto form values when editing (defaults to the record).
  final Json Function(Json item)? initialOf;

  final Future<void> Function(Json values)? create;
  final Future<void> Function(Json item, Json values)? update;
  final Future<void> Function(Json item)? delete;
  final String Function(Json item)? deleteMessage;
  final bool Function(Json item)? canEdit;
  final bool Function(Json item)? canDelete;

  final List<CrudAction> itemActions;

  /// App-bar actions for the whole resource (sync all, delete expired …);
  /// they receive the current list under the key `items`.
  final List<CrudAction> toolbar;

  final List<(String value, String label)>? filters;
  final String filterParam;

  /// When set, filtering happens on the client using this value.
  final String? Function(Json item)? filterOf;
  final String? initialFilter;

  final bool searchable;
  final String? searchHint;

  /// Server-side search parameter; when null, search filters locally over
  /// [searchTextOf] (or title + subtitle + meta).
  final String? searchParam;
  final String Function(Json item)? searchTextOf;

  final IconData? emptyIcon;
  final String? emptyMessage;
  final String? emptyHint;

  /// Summary card above the rows.
  final Widget? Function(BuildContext context, List<Json> items)? header;

  /// Replaces the detail sheet (e.g. push a full detail screen).
  final Future<void> Function(BuildContext context, Json item)? onOpen;
  final String? createLabel;

  /// Actions on several rows (long-press to select). They receive the
  /// selected rows under the key `items`.
  final List<CrudAction> bulkActions;
  final String idKey;

  /// Shown under the list when the endpoint caps how many rows it returns.
  final String? fetchLimitNote;

  /// Runs after a successful create, e.g. to show generated credentials.
  final Future<void> Function(BuildContext context)? afterCreate;
}

/// REST helpers for the two conventions the backend uses.
class CrudRoutes {
  /// `/x` GET/POST, `/x/:id` PUT/DELETE.
  static Future<void> Function(Json) postTo(String path) =>
      (v) => ApiClient.instance.post(path, data: v);
  static Future<void> Function(Json, Json) putById(String path, {String method = 'PUT', String idKey = 'id'}) =>
      (item, v) => method == 'PATCH' ? ApiClient.instance.patch('$path/${item[idKey]}', data: v) : ApiClient.instance.put('$path/${item[idKey]}', data: v);
  static Future<void> Function(Json) deleteById(String path, {String idKey = 'id'}) =>
      (item) => ApiClient.instance.delete('$path/${item[idKey]}');

  /// `/x` for everything, id in the PUT body and the DELETE query.
  static Future<void> Function(Json, Json) putWithBodyId(String path, {String method = 'PUT', String idKey = 'id'}) =>
      (item, v) =>
          method == 'PATCH' ? ApiClient.instance.patch(path, data: {idKey: item[idKey], ...v}) : ApiClient.instance.put(path, data: {idKey: item[idKey], ...v});
  static Future<void> Function(Json) deleteWithQueryId(String path, {String idKey = 'id', String param = 'id'}) =>
      (item) => ApiClient.instance.delete(path, query: {param: item[idKey]});
}

class CrudListScreen extends StatefulWidget {
  const CrudListScreen({super.key, required this.config});
  final CrudConfig config;

  static Future<void> open(BuildContext context, CrudConfig config) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => CrudListScreen(config: config)));

  @override
  State<CrudListScreen> createState() => _CrudListScreenState();
}

class _CrudListScreenState extends State<CrudListScreen> {
  List<Json> _items = [];
  bool _loading = true;
  String? _error;
  String _search = '';
  String? _filter;
  Timer? _debounce;
  final Set<String> _selected = {};

  CrudConfig get c => widget.config;

  String _id(Json i) => '${i[c.idKey]}';
  bool get _selecting => _selected.isNotEmpty;
  void _toggle(Json i) => setState(() => _selected.contains(_id(i)) ? _selected.remove(_id(i)) : _selected.add(_id(i)));

  Future<void> _runBulk(CrudAction a) async {
    final items = _items.where((i) => _selected.contains(_id(i))).toList();
    final reload = await _safeRun(context, a, {'items': items});
    if (reload && mounted) {
      setState(_selected.clear);
      _load();
    }
  }

  PreferredSizeWidget _selectionBar() {
    return AppBar(
      leading: IconButton(icon: const Icon(Icons.close_rounded), onPressed: () => setState(_selected.clear)),
      title: Text('${_selected.length} dipilih'),
      actions: [
        IconButton(tooltip: 'Pilih semua', icon: const Icon(Icons.select_all_rounded), onPressed: () => setState(() => _selected.addAll(_visible.map(_id)))),
        if (c.bulkActions.length <= 2)
          for (final a in c.bulkActions) IconButton(tooltip: a.label, icon: Icon(a.icon), onPressed: () => _runBulk(a))
        else
          PopupMenuButton<CrudAction>(onSelected: _runBulk, itemBuilder: (_) => [for (final a in c.bulkActions) _menuItem(a)]),
      ],
    );
  }

  PopupMenuItem<CrudAction> _menuItem(CrudAction a) => PopupMenuItem(
    value: a,
    child: Row(
      children: [
        Icon(a.icon, size: 20, color: a.kind == ActionKind.danger ? context.tone(Tone.danger) : null),
        const SizedBox(width: Gap.md),
        Flexible(
          child: Text(a.label, style: TextStyle(color: a.kind == ActionKind.danger ? context.tone(Tone.danger) : null)),
        ),
      ],
    ),
  );

  @override
  void initState() {
    super.initState();
    _filter = c.initialFilter ?? c.filters?.first.$1;
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _items.isEmpty;
      _error = null;
    });
    try {
      final query = <String, dynamic>{
        if (c.searchParam != null && _search.isNotEmpty) c.searchParam!: _search,
        if (c.filterOf == null && _filter != null && _filter != 'all' && _filter!.isNotEmpty) c.filterParam: _filter,
      };
      final res = await c.fetch(query);
      _items = c.parse != null ? c.parse!(res) : extractList(res, listKey: c.listKey);
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Json> get _visible {
    Iterable<Json> list = _items;
    if (c.filterOf != null && _filter != null && _filter != 'all') {
      list = list.where((i) => c.filterOf!(i) == _filter);
    }
    if (c.searchParam == null && _search.isNotEmpty) {
      final q = _search.toLowerCase();
      list = list.where((i) {
        final text = c.searchTextOf?.call(i) ?? [c.titleOf(i), c.subtitleOf?.call(i), c.metaOf?.call(i)].whereType<String>().join(' ');
        return text.toLowerCase().contains(q);
      });
    }
    return list.toList();
  }

  bool get _canCreate => c.create != null && c.fields != null;
  bool _canEdit(Json i) => c.update != null && c.fields != null && (c.canEdit?.call(i) ?? true);
  bool _canDelete(Json i) => c.delete != null && (c.canDelete?.call(i) ?? true);

  Future<void> _openCreate() async {
    final saved = await openForm(context, title: 'Tambah ${c.noun}', fields: c.fields!(null), onSubmit: c.create!, success: '${c.noun} ditambahkan.');
    if (saved) {
      _load();
      if (c.afterCreate != null && mounted) await c.afterCreate!(context);
    }
  }

  Future<bool> _openEdit(BuildContext ctx, Json item) {
    return openForm(
      ctx,
      title: 'Edit ${c.noun}',
      fields: c.fields!(item),
      initial: c.initialOf?.call(item) ?? item,
      onSubmit: (v) => c.update!(item, v),
      success: '${c.noun} disimpan.',
    );
  }

  Future<bool> _delete(BuildContext ctx, Json item) async {
    final ok = await confirmAction(
      ctx,
      title: 'Hapus ${c.noun}?',
      message: c.deleteMessage?.call(item) ?? '"${c.titleOf(item)}" akan dihapus permanen.',
      confirmLabel: 'Hapus',
      destructive: true,
    );
    if (!ok || !ctx.mounted) return false;
    return runAction(ctx, () => c.delete!(item), success: '${c.noun} dihapus.');
  }

  List<Widget> _defaultSections(Json item) {
    final fields = c.fields?.call(item) ?? const <FieldSpec>[];
    final rows = <InfoRow>[];
    for (final f in fields.where((f) => f.carriesValue && f.type != FieldType.password && f.type != FieldType.image)) {
      final v = item[f.key];
      String? text;
      if (v == null) {
        text = null;
      } else if (f.type == FieldType.toggle) {
        text = (v == true || v == 1) ? 'Ya' : 'Tidak';
      } else if (f.options != null) {
        text = f.options!.firstWhere((o) => o.$1 == v.toString(), orElse: () => (v.toString(), v.toString())).$2;
      } else if (v is List) {
        text = v.join(', ');
      } else if (v is Map) {
        text = (v['name'] ?? v['id'])?.toString();
      } else {
        text = v.toString();
      }
      rows.add(InfoRow(f.label, text));
    }
    return [DetailSection(rows: rows)];
  }

  Future<void> _openDetail(Json item) async {
    if (c.onOpen != null) {
      await c.onOpen!(context, item);
      _load();
      return;
    }
    final extra = c.itemActions.where((a) => a.visible?.call(item) ?? true).toList();
    await showDetailSheet(
      context,
      header: DetailHeader(
        icon: c.iconOf?.call(item) ?? c.icon,
        tone: c.toneOf?.call(item) ?? c.tone,
        title: c.titleOf(item),
        subtitle: c.subtitleOf?.call(item),
        status: c.statusOf?.call(item),
        figureLabel: c.figureLabel,
        figure: c.figureOf?.call(item),
      ),
      sections: [
        ...(c.sectionsOf?.call(context, item) ?? _defaultSections(item)),
        if (extra.isNotEmpty)
          Builder(
            builder: (sheet) => _ActionList(
              actions: extra,
              onRun: (a) async {
                final reload = await _safeRun(sheet, a, item);
                if (reload) {
                  if (sheet.mounted) Navigator.of(sheet).maybePop();
                  _load();
                }
              },
            ),
          ),
      ],
      actions: (sheet) => [
        if (_canEdit(item))
          ActionSpec('Edit', Icons.edit_rounded, () async {
            final saved = await _openEdit(sheet, item);
            if (saved) {
              if (sheet.mounted) Navigator.pop(sheet);
              _load();
            }
          }),
        if (_canDelete(item))
          ActionSpec('Hapus', Icons.delete_outline_rounded, () async {
            final done = await _delete(sheet, item);
            if (done) {
              if (sheet.mounted) Navigator.pop(sheet);
              _load();
            }
          }, kind: ActionKind.danger),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final visible = _visible;
    final header = c.header?.call(context, _items);
    return PopScope(
      canPop: !_selecting,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) setState(_selected.clear);
      },
      child: Scaffold(
        appBar: _selecting
            ? _selectionBar()
            : AppBar(
                title: Text(c.title),
                actions: [
                  if (c.toolbar.length == 1)
                    IconButton(tooltip: c.toolbar.first.label, icon: Icon(c.toolbar.first.icon), onPressed: () => _runToolbar(c.toolbar.first)),
                  if (c.toolbar.length > 1) PopupMenuButton<CrudAction>(onSelected: _runToolbar, itemBuilder: (_) => [for (final a in c.toolbar) _menuItem(a)]),
                ],
              ),
        floatingActionButton: _canCreate && !_selecting
            ? FloatingActionButton.extended(onPressed: _openCreate, icon: const Icon(Icons.add_rounded), label: Text(c.createLabel ?? 'Tambah ${c.noun}'))
            : null,
        body: Column(
          children: [
            if (c.searchable)
              SearchField(
                hint: c.searchHint ?? 'Cari ${c.noun.toLowerCase()}',
                onChanged: (v) {
                  _debounce?.cancel();
                  _debounce = Timer(Duration(milliseconds: c.searchParam == null ? 150 : 400), () {
                    _search = v.trim();
                    c.searchParam == null ? setState(() {}) : _load();
                  });
                },
              ),
            if (c.filters != null)
              FilterChipRow(
                options: c.filters!,
                selected: _filter,
                onSelected: (v) {
                  setState(() => _filter = v);
                  if (c.filterOf == null) {
                    _items = [];
                    _load();
                  }
                },
              ),
            Expanded(
              child: DataStateView(
                loading: _loading,
                error: _error,
                onRetry: _load,
                isEmpty: visible.isEmpty && header == null,
                emptyIcon: c.emptyIcon ?? c.icon,
                emptyMessage: _search.isNotEmpty ? 'Tidak ada ${c.noun.toLowerCase()} yang cocok' : (c.emptyMessage ?? 'Belum ada ${c.noun.toLowerCase()}'),
                emptyHint: _search.isNotEmpty ? null : c.emptyHint,
                child: RefreshableList(
                  onRefresh: _load,
                  hasFab: _canCreate,
                  header: header,
                  itemCount: visible.length,
                  itemBuilder: (context, i) {
                    final item = visible[i];
                    final canSelect = c.bulkActions.isNotEmpty;
                    return EntityTile(
                      leading: _selecting ? Checkbox(value: _selected.contains(_id(item)), onChanged: (_) => _toggle(item)) : null,
                      onLongPress: canSelect ? () => _toggle(item) : null,
                      icon: c.iconOf?.call(item) ?? c.icon,
                      tone: c.toneOf?.call(item) ?? c.tone,
                      title: c.titleOf(item),
                      subtitle: c.subtitleOf?.call(item),
                      meta: c.metaOf?.call(item),
                      trailing: c.trailingOf?.call(context, item) ?? c.statusOf?.call(item),
                      onTap: () => _selecting ? _toggle(item) : _openDetail(item),
                    );
                  },
                ),
              ),
            ),
            if (c.fetchLimitNote != null && _items.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(Gap.page, 0, Gap.page, Gap.sm),
                child: Text(c.fetchLimitNote!, style: TextStyle(fontSize: 11.5, color: context.colors.onSurfaceVariant)),
              ),
          ],
        ),
      ),
    );
  }

  /// Actions may call the API directly; surface failures as a toast
  /// rather than an unhandled exception.
  Future<bool> _safeRun(BuildContext ctx, CrudAction a, Json item) async {
    try {
      return await a.run(ctx, item);
    } on ApiException catch (e) {
      if (ctx.mounted) showToast(ctx, e.message);
      return false;
    }
  }

  Future<void> _runToolbar(CrudAction a) async {
    final reload = await _safeRun(context, a, {'items': _items});
    if (reload) _load();
  }
}

class _ActionList extends StatelessWidget {
  const _ActionList({required this.actions, required this.onRun});
  final List<CrudAction> actions;
  final Future<void> Function(CrudAction) onRun;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: Gap.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 2, bottom: Gap.sm),
            child: Text(
              'Tindakan',
              style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: context.colors.onSurfaceVariant),
            ),
          ),
          Card(
            child: Column(
              children: [
                for (var i = 0; i < actions.length; i++) ...[
                  if (i > 0) const Divider(indent: Gap.lg, endIndent: Gap.lg),
                  ListTile(
                    leading: Icon(actions[i].icon, color: _color(context, actions[i].kind)),
                    title: Text(
                      actions[i].label,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: actions[i].kind == ActionKind.danger ? context.tone(Tone.danger) : null,
                      ),
                    ),
                    trailing: Icon(Icons.chevron_right_rounded, color: context.colors.onSurfaceVariant),
                    onTap: () => onRun(actions[i]),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Color? _color(BuildContext context, ActionKind k) => switch (k) {
    ActionKind.danger => context.tone(Tone.danger),
    ActionKind.success => context.tone(Tone.success),
    ActionKind.warning => context.tone(Tone.warning),
    ActionKind.primary => context.colors.primary,
    ActionKind.neutral => context.colors.onSurfaceVariant,
  };
}

/// Convenience actions used across many resources.
class CommonActions {
  /// POST with confirmation and a toast, e.g. "Sinkron ke MikroTik".
  static CrudAction confirmPost(
    String label,
    IconData icon,
    String Function(Json item) path, {
    String? confirm,
    Json Function(Json item)? body,
    String? success,
    ActionKind kind = ActionKind.neutral,
    bool long = false,
    bool Function(Json item)? visible,
    bool reload = true,
  }) {
    return CrudAction(
      label,
      icon,
      (ctx, item) async {
        if (confirm != null) {
          final ok = await confirmAction(ctx, title: '$label?', message: confirm, confirmLabel: label, destructive: kind == ActionKind.danger);
          if (!ok || !ctx.mounted) return false;
        }
        String? msg;
        final done = await runAction(ctx, () async {
          final data = body?.call(item);
          final res = long ? await ApiClient.instance.postLong(path(item), data: data) : await ApiClient.instance.post(path(item), data: data);
          msg = res is Map ? (res['message'] ?? res['msg'])?.toString() : null;
        });
        if (done && ctx.mounted) showToast(ctx, msg ?? success ?? '$label selesai.');
        return done && reload;
      },
      kind: kind,
      visible: visible,
    );
  }

  /// Calls the server and shows what it returned (scripts, credentials,
  /// command output) on a result page.
  static CrudAction showResult(
    String label,
    IconData icon,
    String Function(Json item) path, {
    String method = 'POST',
    Json Function(Json item)? body,
    Json Function(Json item)? query,
    String? confirm,
    String? intro,
    Map<String, String> labels = const {},
    ActionKind kind = ActionKind.neutral,
    bool Function(Json item)? visible,
  }) {
    return CrudAction(
      label,
      icon,
      (ctx, item) async {
        if (confirm != null) {
          final ok = await confirmAction(ctx, title: '$label?', message: confirm, confirmLabel: label);
          if (!ok || !ctx.mounted) return false;
        }
        dynamic res;
        final done = await runAction(ctx, () async {
          res = method == 'GET'
              ? await ApiClient.instance.get(path(item), query: query?.call(item))
              : await ApiClient.instance.postLong(path(item), data: body?.call(item));
        });
        if (done && ctx.mounted && res is Map) {
          await showResultScreen(ctx, title: label, data: (res as Map).cast<String, dynamic>(), intro: intro, labels: labels);
        }
        return false;
      },
      kind: kind,
      visible: visible,
    );
  }

  /// Opens a form and submits it.
  static CrudAction form(
    String label,
    IconData icon, {
    required List<FieldSpec> Function(Json item) fields,
    required Future<void> Function(Json item, Json values) submit,
    Json Function(Json item)? initial,
    String? success,
    String submitLabel = 'Simpan',
    ActionKind kind = ActionKind.neutral,
    bool Function(Json item)? visible,
  }) {
    return CrudAction(
      label,
      icon,
      (ctx, item) {
        return openForm(
          ctx,
          title: label,
          fields: fields(item),
          initial: initial?.call(item),
          submitLabel: submitLabel,
          onSubmit: (v) => submit(item, v),
          success: success ?? '$label berhasil.',
        );
      },
      kind: kind,
      visible: visible,
    );
  }
}
