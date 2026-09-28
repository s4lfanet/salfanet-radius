import 'package:intl/intl.dart';

final _currencyFormat = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);
final _dateFormat = DateFormat('d MMM yyyy', 'id_ID');
final _dateTimeFormat = DateFormat('d MMM yyyy, HH:mm', 'id_ID');

String formatCurrency(num value) => _currencyFormat.format(value);
String formatDate(DateTime date) => _dateFormat.format(date);
String formatDateTime(DateTime date) => _dateTimeFormat.format(date);

/// How long a PPPoE session has been up, e.g. "2 hari 4 jam" or "12 menit".
/// Coarsened to the two largest units — a customer checking uptime doesn't
/// need seconds.
String formatDuration(Duration d) {
  if (d.inDays > 0) return '${d.inDays} hari ${d.inHours % 24} jam';
  if (d.inHours > 0) return '${d.inHours} jam ${d.inMinutes % 60} menit';
  if (d.inMinutes > 0) return '${d.inMinutes} menit';
  return 'Baru saja';
}

/// Safe accessors for the raw JSON maps the lighter screens render
/// directly — the backend mixes numbers, numeric strings and nulls.
String? str(Map<String, dynamic>? m, String key) {
  final v = m?[key];
  if (v == null) return null;
  final s = v.toString();
  return s.isEmpty ? null : s;
}

num numOf(Map<String, dynamic>? m, String key) {
  final v = m?[key];
  if (v is num) return v;
  return num.tryParse('${v ?? ''}') ?? 0;
}

// No .toLocal(): many DB timestamps are stored as WIB wall-clock values
// tagged UTC (see backend lib/timezone.ts), so converting would shift them
// by +7h on a WIB phone. Matches how the models have always parsed dates.
DateTime? dateOf(Map<String, dynamic>? m, String key) => DateTime.tryParse('${m?[key] ?? ''}');

Map<String, dynamic>? mapOf(Map<String, dynamic>? m, String key) => (m?[key] as Map?)?.cast<String, dynamic>();

String? formatDateOrNull(DateTime? d) => d == null ? null : formatDate(d);
String? formatDateTimeOrNull(DateTime? d) => d == null ? null : formatDateTime(d);

/// "Diperbarui X lalu" caption for data pulled by a background refresh — this
/// is a real client-side fetch timestamp, not a decorative freshness claim.
String formatRelativeTime(DateTime time) {
  final diff = DateTime.now().difference(time);
  if (diff.inSeconds < 10) return 'baru saja';
  if (diff.inSeconds < 60) return '${diff.inSeconds} detik lalu';
  if (diff.inMinutes < 60) return '${diff.inMinutes} menit lalu';
  if (diff.inHours < 24) return '${diff.inHours} jam lalu';
  return formatDate(time);
}
