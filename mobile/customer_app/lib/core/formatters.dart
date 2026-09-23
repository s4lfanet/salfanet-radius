import 'package:intl/intl.dart';

final _currencyFormat = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);
final _dateFormat = DateFormat('d MMM yyyy', 'id_ID');
final _dateTimeFormat = DateFormat('d MMM yyyy, HH:mm', 'id_ID');

String formatCurrency(num value) => _currencyFormat.format(value);
String formatDate(DateTime date) => _dateFormat.format(date);
String formatDateTime(DateTime date) => _dateTimeFormat.format(date);
