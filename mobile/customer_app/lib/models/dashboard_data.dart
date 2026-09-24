class DashboardData {
  const DashboardData({
    required this.isOnline,
    required this.ipAddress,
    required this.sessionStartTime,
    required this.downloadBytes,
    required this.uploadBytes,
    required this.unpaidCount,
    required this.totalUnpaid,
    required this.nextDueDate,
  });

  final bool isOnline;
  final String? ipAddress;

  /// When the current PPPoE session started (RADIUS acctstarttime), null when
  /// offline or when the session came from the MikroTik-active fallback path
  /// rather than accounting records. Used to show how long the line has been
  /// up, not just whether it happens to be up right now.
  final DateTime? sessionStartTime;

  final int downloadBytes;
  final int uploadBytes;
  final int unpaidCount;
  final double totalUnpaid;
  final DateTime? nextDueDate;

  factory DashboardData.fromJson(Map<String, dynamic> json) {
    final session = json['session'] as Map<String, dynamic>? ?? const {};
    final usage = json['usage'] as Map<String, dynamic>? ?? const {};
    final invoice = json['invoice'] as Map<String, dynamic>? ?? const {};
    return DashboardData(
      isOnline: session['isOnline'] as bool? ?? false,
      ipAddress: session['ipAddress']?.toString(),
      sessionStartTime:
          session['startTime'] != null ? DateTime.tryParse(session['startTime'].toString()) : null,
      downloadBytes: (usage['download'] as num?)?.toInt() ?? 0,
      uploadBytes: (usage['upload'] as num?)?.toInt() ?? 0,
      unpaidCount: (invoice['unpaidCount'] as num?)?.toInt() ?? 0,
      totalUnpaid: (invoice['totalUnpaid'] as num?)?.toDouble() ?? 0,
      nextDueDate: invoice['nextDueDate'] != null ? DateTime.tryParse(invoice['nextDueDate'].toString()) : null,
    );
  }
}

String formatBytes(int bytes) {
  if (bytes <= 0) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  var value = bytes.toDouble();
  var unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return '${value.toStringAsFixed(1)} ${units[unitIndex]}';
}
