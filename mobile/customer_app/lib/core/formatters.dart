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
