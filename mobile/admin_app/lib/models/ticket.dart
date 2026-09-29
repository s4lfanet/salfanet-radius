/// Mirrors rows returned by GET /api/tickets.
class Ticket {
  Ticket({
    required this.id,
    required this.ticketNumber,
    required this.subject,
    required this.description,
    required this.priority,
    required this.status,
    required this.customerName,
    required this.customerPhone,
    required this.createdAt,
    this.categoryName,
    this.messageCount = 0,
    this.estimatedRepair,
    this.raw = const {},
  });

  /// The row as returned, for edit forms that need fields not modelled here.
  final Map<String, dynamic> raw;

  final String id;
  final String ticketNumber;
  final String subject;
  final String description;
  final String priority;
  final String status;
  final String customerName;
  final String customerPhone;
  final DateTime createdAt;
  final String? categoryName;
  final int messageCount;
  final String? estimatedRepair;

  factory Ticket.fromJson(Map<String, dynamic> json) {
    final category = (json['category'] as Map?)?.cast<String, dynamic>();
    final count = (json['_count'] as Map?)?.cast<String, dynamic>();
    return Ticket(
      id: (json['id'] ?? '').toString(),
      ticketNumber: (json['ticketNumber'] ?? '').toString(),
      subject: (json['subject'] ?? '').toString(),
      description: (json['description'] ?? '').toString(),
      priority: (json['priority'] ?? 'MEDIUM').toString(),
      status: (json['status'] ?? 'OPEN').toString(),
      customerName: (json['customerName'] ?? '-').toString(),
      customerPhone: (json['customerPhone'] ?? '').toString(),
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
      categoryName: category?['name']?.toString(),
      messageCount: count?['messages'] is num ? (count!['messages'] as num).toInt() : 0,
      estimatedRepair: json['estimatedRepair']?.toString(),
      raw: json,
    );
  }
}

class TicketMessage {
  TicketMessage({
    required this.id,
    required this.senderType,
    required this.senderName,
    required this.message,
    required this.createdAt,
    this.isInternal = false,
  });

  final String id;
  final String senderType;
  final String senderName;
  final String message;
  final DateTime createdAt;
  final bool isInternal;

  factory TicketMessage.fromJson(Map<String, dynamic> json) {
    return TicketMessage(
      id: (json['id'] ?? '').toString(),
      senderType: (json['senderType'] ?? '').toString(),
      senderName: (json['senderName'] ?? '-').toString(),
      message: (json['message'] ?? '').toString(),
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
      isInternal: json['isInternal'] == true,
    );
  }
}
