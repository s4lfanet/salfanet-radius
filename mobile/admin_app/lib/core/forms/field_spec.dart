import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

enum FieldType {
  text,
  multiline,
  integer,
  decimal,
  password,
  phone,
  email,
  url,
  select,
  multiSelect,
  toggle,
  date,
  dateTime,
  time,
  image,

  /// Several uploaded images (a list of URLs); [FieldSpec.max] caps the count.
  images,

  /// Latitude in [FieldSpec.key], longitude in [FieldSpec.pairKey], with a
  /// "use my location" button — staff add customers standing at the house.
  location,

  /// A heading that groups the fields after it. Carries no value.
  section,

  /// Read-only explanatory text between fields. Carries no value.
  note,
}

typedef FieldOptions = List<(String value, String label)>;

/// One input on a [FormScreen]. Forms are declared as lists of these so
/// every add/edit screen in the app renders, validates and serializes the
/// same way the web panel's modals do.
class FieldSpec {
  const FieldSpec(
    this.key,
    this.label, {
    this.type = FieldType.text,
    this.required = false,
    this.hint,
    this.helper,
    this.options,
    this.loadOptions,
    this.initial,
    this.visibleIf,
    this.readOnly = false,
    this.uploader,
    this.validator,
    this.min,
    this.max,
    this.nullWhenEmpty = false,
    this.omitWhenEmpty = false,
    this.transform,
    this.pairKey,
  });

  const FieldSpec.section(String title) : this('_section_$title', title, type: FieldType.section);

  const FieldSpec.note(String text) : this('_note_$text', text, type: FieldType.note);

  final String key;
  final String label;
  final FieldType type;
  final bool required;
  final String? hint;
  final String? helper;

  /// Static choices for select / multiSelect.
  final FieldOptions? options;

  /// Choices fetched from the API when the form opens (routers, areas,
  /// profiles …). Used when [options] is null.
  final Future<FieldOptions> Function()? loadOptions;

  /// Default for a new record. On edit the record's own value wins.
  final Object? initial;

  /// Hides the field (and drops it from the payload) unless this returns
  /// true for the current values — the web forms' conditional sections.
  final bool Function(Map<String, dynamic> values)? visibleIf;

  final bool readOnly;

  /// For [FieldType.image]: uploads the picked file and returns the URL or
  /// path the backend stores.
  final Future<String> Function(XFile file)? uploader;

  final String? Function(Object? value, Map<String, dynamic> values)? validator;
  final num? min;
  final num? max;

  /// Blank text/select fields are sent as "" — what the web forms send, and
  /// what zod `.optional()` string schemas accept (they reject null). Set
  /// this where the route needs an explicit null to clear a value.
  final bool nullWhenEmpty;

  /// Leave the key out of the payload entirely when blank (password fields
  /// on edit: blank means keep the current one).
  final bool omitWhenEmpty;

  /// Final conversion of the serialized value before it goes into the
  /// payload (e.g. a select whose ids are numbers on the backend).
  final Object? Function(Object? value)? transform;

  final String? pairKey;

  bool get carriesValue => type != FieldType.section && type != FieldType.note;

  bool isVisible(Map<String, dynamic> values) => visibleIf == null || visibleIf!(values);

  TextInputType? get keyboard {
    switch (type) {
      case FieldType.integer:
        return TextInputType.number;
      case FieldType.decimal:
        return const TextInputType.numberWithOptions(decimal: true);
      case FieldType.phone:
        return TextInputType.phone;
      case FieldType.email:
        return TextInputType.emailAddress;
      case FieldType.url:
        return TextInputType.url;
      case FieldType.multiline:
        return TextInputType.multiline;
      default:
        return TextInputType.text;
    }
  }

  bool get isTextual => const {
    FieldType.text,
    FieldType.multiline,
    FieldType.integer,
    FieldType.decimal,
    FieldType.password,
    FieldType.phone,
    FieldType.email,
    FieldType.url,
  }.contains(type);
}

/// Options builder for API lists: maps each item to (id, label).
Future<FieldOptions> optionsFrom(
  Future<dynamic> Function() fetch, {
  String? listKey,
  String valueKey = 'id',
  String Function(Map<String, dynamic> item)? label,
  String labelKey = 'name',
}) async {
  final res = await fetch();
  final list = extractList(res, listKey: listKey);
  return [
    for (final m in list)
      if (m[valueKey] != null) (m[valueKey].toString(), label?.call(m) ?? (m[labelKey] ?? m[valueKey]).toString()),
  ];
}

/// Finds the array in a list response. Routes differ: some return the
/// array itself, most wrap it under a resource-named key.
List<Map<String, dynamic>> extractList(dynamic res, {String? listKey}) {
  List? raw;
  if (res is List) {
    raw = res;
  } else if (res is Map) {
    if (listKey != null) {
      raw = res[listKey] as List?;
    } else {
      final data = res['data'];
      if (data is List) {
        raw = data;
      } else if (data is Map) {
        raw = data.values.whereType<List>().firstOrNull;
      }
      raw ??= res.values.whereType<List>().firstOrNull;
    }
  }
  return (raw ?? const []).whereType<Map>().map((e) => e.cast<String, dynamic>()).toList();
}

/// True for values a form sends for an untouched field ("" or null).
bool isBlank(Object? v) => v == null || v == '' || (v is List && v.isEmpty);
