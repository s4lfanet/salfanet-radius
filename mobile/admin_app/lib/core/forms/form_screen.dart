import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../api/api_client.dart';
import '../theme/app_theme.dart';
import '../widgets/detail.dart';
import '../widgets/dialogs.dart';
import '../widgets/entity_tile.dart';
import '../widgets/state_views.dart';
import 'field_spec.dart';

/// Opens a [FormScreen] and resolves to true when it was saved.
Future<bool> openForm(
  BuildContext context, {
  required String title,
  required List<FieldSpec> fields,
  Map<String, dynamic>? initial,
  String submitLabel = 'Simpan',
  required Future<void> Function(Map<String, dynamic> values) onSubmit,
  String? success,
}) async {
  final saved = await Navigator.of(context).push<bool>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => FormScreen(title: title, fields: fields, initial: initial, submitLabel: submitLabel, onSubmit: onSubmit),
    ),
  );
  if (saved == true && success != null && context.mounted) showToast(context, success);
  return saved == true;
}

class FormAction {
  const FormAction(this.label, this.icon, this.run);
  final String label;
  final IconData icon;

  /// Returns the message to show (server's own wording where available).
  final Future<String?> Function(Map<String, dynamic> values) run;
}

/// A settings page: loads the current values, then renders them as a form
/// that stays open after saving.
class SettingsFormScreen extends StatefulWidget {
  const SettingsFormScreen({
    super.key,
    required this.title,
    required this.load,
    required this.fields,
    required this.save,
    this.secondary = const [],
    this.header,
    this.savedMessage,
  });

  final String title;
  final Future<Map<String, dynamic>> Function() load;
  final List<FieldSpec> Function(Map<String, dynamic> current) fields;
  final Future<void> Function(Map<String, dynamic> values, Map<String, dynamic> current) save;
  final List<FormAction> secondary;
  final Widget? Function(BuildContext context, Map<String, dynamic> current)? header;
  final String? savedMessage;

  static Future<void> open(BuildContext context, SettingsFormScreen screen) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));

  @override
  State<SettingsFormScreen> createState() => _SettingsFormScreenState();
}

class _SettingsFormScreenState extends State<SettingsFormScreen> {
  Map<String, dynamic>? _current;
  String? _error;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// [rebuild] false after a save: the form already shows what was saved,
  /// and recreating it would drop the "saved" toast mid-flight.
  Future<void> _load({bool rebuild = true}) async {
    setState(() => _error = null);
    try {
      final data = await widget.load();
      if (mounted) {
        setState(() {
          _current = data;
          if (rebuild) _generation++;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final current = _current;
    if (current == null) {
      return Scaffold(
        appBar: AppBar(title: Text(widget.title)),
        body: _error != null ? ErrorView(message: _error!, onRetry: _load) : const LoadingView(),
      );
    }
    return FormScreen(
      key: ValueKey(_generation),
      title: widget.title,
      fields: widget.fields(current),
      initial: current,
      popOnSave: false,
      savedMessage: widget.savedMessage,
      secondary: widget.secondary,
      header: widget.header?.call(context, current),
      onSubmit: (v) async {
        await widget.save(v, current);
        await _load(rebuild: false);
      },
    );
  }
}

/// Full-screen add/edit form rendered from a list of [FieldSpec]s. The
/// server's error message is shown and the form stays open on failure, so
/// nothing typed is lost.
class FormScreen extends StatefulWidget {
  const FormScreen({
    super.key,
    required this.title,
    required this.fields,
    required this.onSubmit,
    this.initial,
    this.submitLabel = 'Simpan',
    this.popOnSave = true,
    this.savedMessage,
    this.secondary = const [],
    this.header,
  });

  final String title;
  final List<FieldSpec> fields;
  final Map<String, dynamic>? initial;
  final String submitLabel;
  final Future<void> Function(Map<String, dynamic> values) onSubmit;

  /// Settings pages stay open after saving and confirm with a toast.
  final bool popOnSave;
  final String? savedMessage;

  /// Extra actions that act on the current (unsaved) values, e.g. "Tes
  /// Koneksi" on gateway settings. Rendered as outlined buttons left of save.
  final List<FormAction> secondary;

  /// Content above the fields (status cards on settings pages).
  final Widget? header;

  @override
  State<FormScreen> createState() => _FormScreenState();
}

class _FormScreenState extends State<FormScreen> {
  final _formKey = GlobalKey<FormState>();
  final Map<String, dynamic> _values = {};
  final Map<String, TextEditingController> _text = {};
  final Map<String, FieldOptions> _options = {};
  final Map<String, String> _optionErrors = {};
  final Set<String> _revealed = {};
  bool _saving = false;
  String? _running;
  String? _error;

  Future<void> _runSecondary(FormAction a) async {
    FocusScope.of(context).unfocus();
    setState(() => _running = a.label);
    try {
      final msg = await a.run(_collect());
      if (mounted) showToast(context, msg ?? '${a.label} berhasil.');
    } on ApiException catch (e) {
      if (mounted) showToast(context, e.message);
    } finally {
      if (mounted) setState(() => _running = null);
    }
  }

  @override
  void initState() {
    super.initState();
    for (final f in widget.fields.where((f) => f.carriesValue)) {
      final raw = widget.initial != null && widget.initial!.containsKey(f.key) ? widget.initial![f.key] : f.initial;
      _values[f.key] = _normalize(f, raw);
      if (f.type == FieldType.location && f.pairKey != null) {
        _values[f.pairKey!] = (widget.initial?[f.pairKey!] ?? '').toString();
        _values[f.key] = (raw ?? '').toString();
      }
      if (f.isTextual) _text[f.key] = TextEditingController(text: _values[f.key]?.toString() ?? '');
      if (f.options != null) _options[f.key] = f.options!;
      if (f.options == null && f.loadOptions != null) _loadOptions(f);
    }
  }

  @override
  void dispose() {
    for (final c in _text.values) {
      c.dispose();
    }
    super.dispose();
  }

  Object? _normalize(FieldSpec f, Object? raw) {
    switch (f.type) {
      case FieldType.toggle:
        return raw == true || raw == 1 || raw == 'true' || raw == '1';
      case FieldType.multiSelect:
      case FieldType.images:
        return raw is List ? raw.map((e) => e.toString()).toList() : <String>[];
      case FieldType.date:
      case FieldType.dateTime:
        return raw is DateTime ? raw : DateTime.tryParse('${raw ?? ''}');
      case FieldType.integer:
      case FieldType.decimal:
        if (raw == null || raw == '') return null;
        final n = raw is num ? raw : num.tryParse(raw.toString());
        if (n == null) return raw.toString();
        return n == n.roundToDouble() && f.type == FieldType.integer ? n.toInt().toString() : _trimDecimal(n);
      default:
        return raw?.toString();
    }
  }

  String _trimDecimal(num n) => n == n.roundToDouble() ? n.toInt().toString() : n.toString();

  Future<void> _loadOptions(FieldSpec f) async {
    setState(() => _optionErrors.remove(f.key));
    try {
      final opts = await f.loadOptions!();
      if (mounted) setState(() => _options[f.key] = opts);
    } on ApiException catch (e) {
      if (mounted) setState(() => _optionErrors[f.key] = e.message);
    } catch (_) {
      if (mounted) setState(() => _optionErrors[f.key] = 'Pilihan gagal dimuat');
    }
  }

  Map<String, dynamic> _collect() {
    final out = <String, dynamic>{};
    for (final f in widget.fields.where((f) => f.carriesValue)) {
      if (!f.isVisible(_values)) continue;
      Object? v = _values[f.key];
      if (f.isTextual) {
        final t = _text[f.key]!.text.trim();
        if (t.isEmpty) {
          if (f.omitWhenEmpty) continue;
          // Numbers have no "blank" string form; send null.
          final numeric = f.type == FieldType.integer || f.type == FieldType.decimal;
          v = numeric || f.nullWhenEmpty ? null : '';
        } else if (f.type == FieldType.integer) {
          v = int.tryParse(t.replaceAll('.', '')) ?? num.tryParse(t);
        } else if (f.type == FieldType.decimal) {
          v = num.tryParse(t.replaceAll(',', '.'));
        } else {
          v = f.type == FieldType.password ? _text[f.key]!.text : t;
        }
      } else if (f.type == FieldType.location) {
        final lat = (v ?? '').toString().trim();
        final lng = (_values[f.pairKey] ?? '').toString().trim();
        out[f.key] = lat.isEmpty ? null : lat;
        if (f.pairKey != null) out[f.pairKey!] = lng.isEmpty ? null : lng;
        continue;
      } else if (f.type == FieldType.date || f.type == FieldType.dateTime) {
        // A blank date is left out, as the web forms do.
        if (v is! DateTime) continue;
        v = f.type == FieldType.date ? DateFormat('yyyy-MM-dd').format(v) : v.toIso8601String();
      } else if ((f.type == FieldType.select || f.type == FieldType.image || f.type == FieldType.time) && (v == null || v == '')) {
        if (f.omitWhenEmpty) continue;
        v = f.nullWhenEmpty ? null : '';
      }
      out[f.key] = f.transform != null ? f.transform!(v) : v;
    }
    return out;
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!(_formKey.currentState?.validate() ?? false)) {
      setState(() => _error = 'Periksa kembali isian yang ditandai.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.onSubmit(_collect());
      if (!mounted) return;
      if (widget.popOnSave) {
        Navigator.of(context).pop(true);
      } else {
        showToast(context, widget.savedMessage ?? 'Pengaturan disimpan.');
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String? _validate(FieldSpec f, Object? value) {
    if (f.type == FieldType.location) {
      final lng = (_values[f.pairKey] ?? '').toString().trim();
      if (f.required && ((value ?? '').toString().trim().isEmpty || lng.isEmpty)) return '${f.label} wajib diisi';
      if ((value ?? '').toString().isNotEmpty && double.tryParse(value.toString()) == null) return 'Latitude tidak valid';
      if (lng.isNotEmpty && double.tryParse(lng) == null) return 'Longitude tidak valid';
      return null;
    }
    final empty = value == null || (value is String && value.trim().isEmpty) || (value is List && value.isEmpty);
    if (f.required && empty) return '${f.label} wajib diisi';
    if (!empty && (f.type == FieldType.integer || f.type == FieldType.decimal)) {
      final n = num.tryParse(value.toString().replaceAll(',', '.'));
      if (n == null) return 'Harus berupa angka';
      if (f.min != null && n < f.min!) return 'Minimal ${f.min}';
      if (f.max != null && n > f.max!) return 'Maksimal ${f.max}';
    }
    if (!empty && f.type == FieldType.email && !value.toString().contains('@')) return 'Format email tidak valid';
    return f.validator?.call(value, _values);
  }

  @override
  Widget build(BuildContext context) {
    final visible = widget.fields.where((f) => f.isVisible(_values)).toList();
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      bottomNavigationBar: ActionBar(
        actions: [
          ActionSpec(widget.submitLabel, Icons.check_rounded, _submit, busy: _saving),
          for (final a in widget.secondary) ActionSpec(a.label, a.icon, _saving || _running != null ? null : () => _runSecondary(a), busy: _running == a.label),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: EdgeInsets.fromLTRB(Gap.page, Gap.md, Gap.page, Gap.xl),
          children: [
            if (widget.header != null) KeyedSubtree(key: const ValueKey('_header'), child: widget.header!),
            if (_error != null) _ErrorBanner(key: const ValueKey('_error'), message: _error!),
            // Keyed so inserting the error banner (or a conditional field)
            // doesn't shift fields onto each other's state and wipe their
            // validation messages.
            for (final f in visible) KeyedSubtree(key: ValueKey('field:${f.key}'), child: _field(context, f)),
          ],
        ),
      ),
    );
  }

  Widget _field(BuildContext context, FieldSpec f) {
    final muted = context.colors.onSurfaceVariant;
    switch (f.type) {
      case FieldType.section:
        return Padding(
          padding: const EdgeInsets.only(top: Gap.lg, bottom: Gap.sm, left: 2),
          child: Text(
            f.label,
            style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: muted),
          ),
        );
      case FieldType.note:
        return Padding(
          padding: const EdgeInsets.only(bottom: Gap.md),
          child: Text(f.label, style: TextStyle(fontSize: 12.5, color: muted, height: 1.4)),
        );
      default:
        return Padding(
          padding: const EdgeInsets.only(bottom: Gap.md),
          child: _input(context, f),
        );
    }
  }

  InputDecoration _decoration(FieldSpec f, {Widget? suffix}) => InputDecoration(
    labelText: f.required ? '${f.label} *' : f.label,
    hintText: f.hint,
    helperText: f.helper,
    helperMaxLines: 3,
    suffixIcon: suffix,
    alignLabelWithHint: f.type == FieldType.multiline,
  );

  Widget _input(BuildContext context, FieldSpec f) {
    switch (f.type) {
      case FieldType.toggle:
        return Card(
          child: SwitchListTile(
            value: _values[f.key] == true,
            onChanged: f.readOnly ? null : (v) => setState(() => _values[f.key] = v),
            title: Text(f.label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
            subtitle: f.helper == null ? null : Text(f.helper!, style: TextStyle(fontSize: 12, color: context.colors.onSurfaceVariant)),
          ),
        );
      case FieldType.select:
      case FieldType.multiSelect:
        return _SelectField(
          spec: f,
          decoration: _decoration(f),
          options: _options[f.key],
          error: _optionErrors[f.key],
          onRetry: f.loadOptions == null ? null : () => _loadOptions(f),
          value: _values[f.key],
          validator: (v) => _validate(f, v),
          onChanged: (v) => setState(() => _values[f.key] = v),
        );
      case FieldType.date:
      case FieldType.dateTime:
      case FieldType.time:
        return _DateField(
          spec: f,
          decoration: _decoration(f, suffix: const Icon(Icons.event_rounded)),
          value: _values[f.key],
          validator: (v) => _validate(f, v),
          onChanged: (v) => setState(() => _values[f.key] = v),
        );
      case FieldType.location:
        return _LocationField(
          spec: f,
          lat: _values[f.key]?.toString() ?? '',
          lng: _values[f.pairKey]?.toString() ?? '',
          validator: (v) => _validate(f, v),
          onChanged: (lat, lng) => setState(() {
            _values[f.key] = lat;
            if (f.pairKey != null) _values[f.pairKey!] = lng;
          }),
        );
      case FieldType.images:
        return _ImagesField(
          spec: f,
          value: ((_values[f.key] as List?) ?? const []).cast<String>(),
          validator: (v) => _validate(f, v),
          onChanged: (v) => setState(() => _values[f.key] = v),
        );
      case FieldType.image:
        return _ImageField(spec: f, value: _values[f.key]?.toString(), validator: (v) => _validate(f, v), onChanged: (v) => setState(() => _values[f.key] = v));
      default:
        final isPassword = f.type == FieldType.password;
        final hidden = isPassword && !_revealed.contains(f.key);
        return TextFormField(
          controller: _text[f.key],
          readOnly: f.readOnly,
          obscureText: hidden,
          keyboardType: f.keyboard,
          minLines: f.type == FieldType.multiline ? 3 : 1,
          maxLines: f.type == FieldType.multiline ? 8 : 1,
          textInputAction: f.type == FieldType.multiline ? TextInputAction.newline : TextInputAction.next,
          validator: (v) => _validate(f, v),
          onChanged: (v) {
            _values[f.key] = v;
            // Only rebuild when another field's visibility may depend on this.
            if (widget.fields.any((o) => o.visibleIf != null)) setState(() {});
          },
          decoration: _decoration(
            f,
            suffix: isPassword
                ? IconButton(
                    icon: Icon(hidden ? Icons.visibility_rounded : Icons.visibility_off_rounded),
                    onPressed: () => setState(() => hidden ? _revealed.add(f.key) : _revealed.remove(f.key)),
                  )
                : null,
          ),
        );
    }
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({super.key, required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    final c = context.tone(Tone.danger);
    return Container(
      margin: const EdgeInsets.only(bottom: Gap.md),
      padding: const EdgeInsets.all(Gap.md),
      decoration: BoxDecoration(
        color: c.withValues(alpha: Theme.of(context).brightness == Brightness.dark ? 0.18 : 0.07),
        borderRadius: BorderRadius.circular(AppTheme.radiusControl),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline_rounded, color: c, size: 20),
          const SizedBox(width: Gap.sm),
          Expanded(
            child: Text(
              message,
              style: TextStyle(color: c, fontWeight: FontWeight.w600, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}

/// Select rendered as a tappable field that opens a searchable sheet —
/// dropdown menus become unusable once a list has more than a screenful of
/// customers or routers.
class _SelectField extends StatelessWidget {
  const _SelectField({
    required this.spec,
    required this.decoration,
    required this.options,
    required this.error,
    required this.onRetry,
    required this.value,
    required this.validator,
    required this.onChanged,
  });

  final FieldSpec spec;
  final InputDecoration decoration;
  final FieldOptions? options;
  final String? error;
  final VoidCallback? onRetry;
  final Object? value;
  final String? Function(Object?) validator;
  final ValueChanged<Object?> onChanged;

  bool get _multi => spec.type == FieldType.multiSelect;

  String _display() {
    final opts = options ?? const [];
    String labelOf(String v) => opts.firstWhere((o) => o.$1 == v, orElse: () => (v, v)).$2;
    if (_multi) {
      final list = (value as List?)?.cast<String>() ?? const [];
      if (list.isEmpty) return '';
      return list.length <= 3 ? list.map(labelOf).join(', ') : '${list.length} dipilih';
    }
    final v = value?.toString();
    return v == null || v.isEmpty ? '' : labelOf(v);
  }

  Future<void> _pick(BuildContext context) async {
    final opts = options;
    if (opts == null) return;
    final result = await showModalBottomSheet<Object?>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _OptionSheet(title: spec.label, options: opts, multi: _multi, selected: value, allowClear: !spec.required && !_multi),
    );
    if (result != null) onChanged(result is _Cleared ? null : result);
  }

  @override
  Widget build(BuildContext context) {
    return FormField<Object?>(
      initialValue: value,
      validator: (_) => validator(value),
      builder: (state) {
        final loading = options == null && error == null;
        return InkWell(
          borderRadius: BorderRadius.circular(AppTheme.radiusControl),
          onTap: spec.readOnly || loading
              ? null
              : error != null
              ? onRetry
              : () => _pick(context),
          child: InputDecorator(
            isEmpty: _display().isEmpty,
            decoration: decoration.copyWith(
              errorText: state.errorText ?? error,
              suffixIcon: loading
                  ? const Padding(
                      padding: EdgeInsets.all(14),
                      child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                    )
                  : Icon(error != null ? Icons.refresh_rounded : Icons.expand_more_rounded),
            ),
            child: Text(_display(), maxLines: 2, overflow: TextOverflow.ellipsis),
          ),
        );
      },
    );
  }
}

class _Cleared {
  const _Cleared();
}

class _OptionSheet extends StatefulWidget {
  const _OptionSheet({required this.title, required this.options, required this.multi, required this.selected, required this.allowClear});
  final String title;
  final FieldOptions options;
  final bool multi;
  final Object? selected;
  final bool allowClear;

  @override
  State<_OptionSheet> createState() => _OptionSheetState();
}

class _OptionSheetState extends State<_OptionSheet> {
  String _query = '';
  late final Set<String> _picked = widget.multi ? {...((widget.selected as List?)?.cast<String>() ?? const [])} : {};

  @override
  Widget build(BuildContext context) {
    final q = _query.toLowerCase();
    final shown = q.isEmpty ? widget.options : widget.options.where((o) => o.$2.toLowerCase().contains(q) || o.$1.toLowerCase().contains(q)).toList();
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: widget.options.length > 8 ? 0.8 : 0.5,
      maxChildSize: 0.95,
      builder: (context, controller) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Gap.page, Gap.sm, Gap.sm, 0),
            child: Row(
              children: [
                Expanded(
                  child: Text(widget.title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                ),
                if (widget.allowClear) TextButton(onPressed: () => Navigator.pop(context, const _Cleared()), child: const Text('Kosongkan')),
                if (widget.multi) FilledButton(onPressed: () => Navigator.pop(context, _picked.toList()), child: Text('Pilih (${_picked.length})')),
              ],
            ),
          ),
          if (widget.options.length > 8) SearchField(hint: 'Cari', onChanged: (v) => setState(() => _query = v.trim())),
          Expanded(
            child: shown.isEmpty
                ? Center(
                    child: Text('Tidak ada pilihan', style: TextStyle(color: context.colors.onSurfaceVariant)),
                  )
                : ListView.builder(
                    controller: controller,
                    padding: EdgeInsets.only(bottom: listBottomPadding(context)),
                    itemCount: shown.length,
                    itemBuilder: (context, i) {
                      final (value, label) = shown[i];
                      if (widget.multi) {
                        return CheckboxListTile(
                          value: _picked.contains(value),
                          title: Text(label),
                          onChanged: (on) => setState(() => on == true ? _picked.add(value) : _picked.remove(value)),
                        );
                      }
                      final isSel = widget.selected?.toString() == value;
                      return ListTile(
                        title: Text(label, style: TextStyle(fontWeight: isSel ? FontWeight.w700 : FontWeight.w500)),
                        trailing: isSel ? Icon(Icons.check_rounded, color: context.colors.primary) : null,
                        onTap: () => Navigator.pop(context, value),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _DateField extends StatelessWidget {
  const _DateField({required this.spec, required this.decoration, required this.value, required this.validator, required this.onChanged});
  final FieldSpec spec;
  final InputDecoration decoration;
  final Object? value;
  final String? Function(Object?) validator;
  final ValueChanged<Object?> onChanged;

  String _display() {
    if (spec.type == FieldType.time) return value?.toString() ?? '';
    final d = value as DateTime?;
    if (d == null) return '';
    return DateFormat(spec.type == FieldType.dateTime ? 'd MMM yyyy, HH:mm' : 'd MMM yyyy', 'id_ID').format(d);
  }

  Future<void> _pick(BuildContext context) async {
    if (spec.type == FieldType.time) {
      final parts = (value?.toString() ?? '').split(':');
      final t = await showTimePicker(
        context: context,
        initialTime: parts.length >= 2 ? TimeOfDay(hour: int.tryParse(parts[0]) ?? 0, minute: int.tryParse(parts[1]) ?? 0) : TimeOfDay.now(),
      );
      if (t != null) onChanged('${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}');
      return;
    }
    final current = value as DateTime? ?? DateTime.now();
    final d = await showDatePicker(context: context, initialDate: current, firstDate: DateTime(2015), lastDate: DateTime(2100));
    if (d == null || !context.mounted) return;
    if (spec.type == FieldType.date) {
      onChanged(d);
      return;
    }
    final t = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(current));
    onChanged(DateTime(d.year, d.month, d.day, t?.hour ?? current.hour, t?.minute ?? current.minute));
  }

  @override
  Widget build(BuildContext context) {
    return FormField<Object?>(
      validator: (_) => validator(value),
      builder: (state) => InkWell(
        borderRadius: BorderRadius.circular(AppTheme.radiusControl),
        onTap: spec.readOnly ? null : () => _pick(context),
        child: InputDecorator(
          isEmpty: _display().isEmpty,
          decoration: decoration.copyWith(errorText: state.errorText),
          child: Text(_display()),
        ),
      ),
    );
  }
}

Future<XFile?> _pickImage(BuildContext context) async {
  final source = await showModalBottomSheet<ImageSource>(
    context: context,
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(leading: const Icon(Icons.photo_camera_rounded), title: const Text('Kamera'), onTap: () => Navigator.pop(ctx, ImageSource.camera)),
          ListTile(leading: const Icon(Icons.photo_library_rounded), title: const Text('Galeri'), onTap: () => Navigator.pop(ctx, ImageSource.gallery)),
        ],
      ),
    ),
  );
  if (source == null) return null;
  return ImagePicker().pickImage(source: source, maxWidth: 1600, imageQuality: 85);
}

class _ImagesField extends StatefulWidget {
  const _ImagesField({required this.spec, required this.value, required this.validator, required this.onChanged});
  final FieldSpec spec;
  final List<String> value;
  final String? Function(Object?) validator;
  final ValueChanged<Object?> onChanged;

  @override
  State<_ImagesField> createState() => _ImagesFieldState();
}

class _ImagesFieldState extends State<_ImagesField> {
  bool _uploading = false;

  Future<void> _add() async {
    final file = await _pickImage(context);
    if (file == null || widget.spec.uploader == null) return;
    setState(() => _uploading = true);
    try {
      final url = await widget.spec.uploader!(file);
      widget.onChanged([...widget.value, url]);
    } on ApiException catch (e) {
      if (mounted) showToast(context, e.message);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final max = widget.spec.max?.toInt() ?? 10;
    final base = ApiClient.instance.baseUrl;
    return FormField<Object?>(
      validator: (_) => widget.validator(widget.value),
      builder: (state) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${widget.spec.label} (${widget.value.length}/$max)',
            style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: context.colors.onSurfaceVariant),
          ),
          const SizedBox(height: Gap.sm),
          Wrap(
            spacing: Gap.sm,
            runSpacing: Gap.sm,
            children: [
              for (final url in widget.value)
                Stack(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(AppTheme.radiusControl),
                      child: Image.network(
                        url.startsWith('http') ? url : '$base${url.startsWith('/') ? '' : '/'}$url',
                        width: 88,
                        height: 88,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) =>
                            Container(width: 88, height: 88, color: context.colors.surfaceContainerHighest, child: const Icon(Icons.broken_image_rounded)),
                      ),
                    ),
                    Positioned(
                      right: 2,
                      top: 2,
                      child: InkWell(
                        onTap: () => widget.onChanged([...widget.value]..remove(url)),
                        child: const CircleAvatar(
                          radius: 12,
                          backgroundColor: Colors.black54,
                          child: Icon(Icons.close_rounded, size: 14, color: Colors.white),
                        ),
                      ),
                    ),
                  ],
                ),
              if (widget.value.length < max)
                InkWell(
                  onTap: _uploading ? null : _add,
                  borderRadius: BorderRadius.circular(AppTheme.radiusControl),
                  child: Container(
                    width: 88,
                    height: 88,
                    decoration: BoxDecoration(
                      border: Border.all(color: context.colors.outline),
                      borderRadius: BorderRadius.circular(AppTheme.radiusControl),
                    ),
                    child: Center(
                      child: _uploading
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                          : Icon(Icons.add_a_photo_rounded, color: context.colors.onSurfaceVariant),
                    ),
                  ),
                ),
            ],
          ),
          if (state.errorText != null)
            Padding(
              padding: const EdgeInsets.only(top: 4, left: 12),
              child: Text(state.errorText!, style: TextStyle(color: context.colors.error, fontSize: 12)),
            ),
        ],
      ),
    );
  }
}

class _ImageField extends StatefulWidget {
  const _ImageField({required this.spec, required this.value, required this.validator, required this.onChanged});
  final FieldSpec spec;
  final String? value;
  final String? Function(Object?) validator;
  final ValueChanged<Object?> onChanged;

  @override
  State<_ImageField> createState() => _ImageFieldState();
}

class _ImageFieldState extends State<_ImageField> {
  bool _uploading = false;

  Future<void> _pick() async {
    final file = await _pickImage(context);
    if (file == null || widget.spec.uploader == null) return;
    setState(() => _uploading = true);
    try {
      widget.onChanged(await widget.spec.uploader!(file));
    } on ApiException catch (e) {
      if (mounted) showToast(context, e.message);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = widget.value;
    return FormField<Object?>(
      validator: (_) => widget.validator(v),
      builder: (state) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            widget.spec.required ? '${widget.spec.label} *' : widget.spec.label,
            style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: context.colors.onSurfaceVariant),
          ),
          if (v != null && v.isNotEmpty) ProofImage(source: v, baseUrl: ApiClient.instance.baseUrl, title: 'Pratinjau'),
          const SizedBox(height: Gap.sm),
          Row(
            children: [
              OutlinedButton.icon(
                onPressed: _uploading ? null : _pick,
                icon: _uploading
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.upload_rounded, size: 18),
                label: Text(v == null || v.isEmpty ? 'Pilih gambar' : 'Ganti gambar'),
              ),
              if (v != null && v.isNotEmpty && !widget.spec.required) ...[
                const SizedBox(width: Gap.sm),
                TextButton(onPressed: () => widget.onChanged(null), child: const Text('Hapus')),
              ],
            ],
          ),
          if (state.errorText != null)
            Padding(
              padding: const EdgeInsets.only(top: 4, left: 12),
              child: Text(state.errorText!, style: TextStyle(color: context.colors.error, fontSize: 12)),
            ),
        ],
      ),
    );
  }
}

class _LocationField extends StatefulWidget {
  const _LocationField({required this.spec, required this.lat, required this.lng, required this.validator, required this.onChanged});
  final FieldSpec spec;
  final String lat;
  final String lng;
  final String? Function(Object?) validator;
  final void Function(String lat, String lng) onChanged;

  @override
  State<_LocationField> createState() => _LocationFieldState();
}

class _LocationFieldState extends State<_LocationField> {
  late final _lat = TextEditingController(text: widget.lat);
  late final _lng = TextEditingController(text: widget.lng);
  bool _locating = false;

  @override
  void dispose() {
    _lat.dispose();
    _lng.dispose();
    super.dispose();
  }

  Future<void> _useMine() async {
    setState(() => _locating = true);
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        if (mounted) showToast(context, 'Aktifkan GPS/lokasi di ponsel dulu.');
        return;
      }
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        if (mounted) showToast(context, 'Izin lokasi ditolak.');
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 20)),
      );
      _lat.text = pos.latitude.toStringAsFixed(7);
      _lng.text = pos.longitude.toStringAsFixed(7);
      widget.onChanged(_lat.text, _lng.text);
      if (mounted) showToast(context, 'Lokasi terisi (akurasi ±${pos.accuracy.round()} m).');
    } catch (_) {
      if (mounted) showToast(context, 'Lokasi tidak didapat. Coba di tempat terbuka.');
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FormField<Object?>(
      validator: (_) => widget.validator(_lat.text),
      builder: (state) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: Gap.sm, left: 2),
            child: Text(
              widget.spec.label,
              style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: context.colors.onSurfaceVariant),
            ),
          ),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _lat,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                  decoration: InputDecoration(labelText: widget.spec.required ? 'Latitude *' : 'Latitude'),
                  onChanged: (_) => widget.onChanged(_lat.text, _lng.text),
                ),
              ),
              const SizedBox(width: Gap.sm),
              Expanded(
                child: TextField(
                  controller: _lng,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                  decoration: InputDecoration(labelText: widget.spec.required ? 'Longitude *' : 'Longitude'),
                  onChanged: (_) => widget.onChanged(_lat.text, _lng.text),
                ),
              ),
            ],
          ),
          const SizedBox(height: Gap.sm),
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              onPressed: _locating ? null : _useMine,
              icon: _locating
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.my_location_rounded, size: 18),
              label: const Text('Pakai lokasi saya'),
            ),
          ),
          if (state.errorText != null)
            Padding(
              padding: const EdgeInsets.only(top: 4, left: 12),
              child: Text(state.errorText!, style: TextStyle(color: context.colors.error, fontSize: 12)),
            ),
        ],
      ),
    );
  }
}
