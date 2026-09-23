class NotificationEvent {
  const NotificationEvent({
    required this.id,
    required this.type,
    required this.title,
    required this.message,
    required this.timestamp,
    required this.isRead,
  });

  final String id;
  final String type;
  final String title;
  final String message;
  final DateTime timestamp;
  final bool isRead;

  factory NotificationEvent.fromJson(Map<String, dynamic> json) => NotificationEvent(
        id: json['id']?.toString() ?? '',
        type: json['type']?.toString() ?? '',
        title: json['title']?.toString() ?? '-',
        message: json['message']?.toString() ?? '',
        timestamp: DateTime.tryParse(json['timestamp']?.toString() ?? '') ?? DateTime.now(),
        isRead: json['isRead'] as bool? ?? false,
      );
}
