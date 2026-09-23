class TicketCategory {
  const TicketCategory({required this.id, required this.name, this.color});
  final String id;
  final String name;
  final String? color;

  factory TicketCategory.fromJson(Map<String, dynamic> json) => TicketCategory(
        id: json['id']?.toString() ?? '',
        name: json['name']?.toString() ?? '-',
        color: json['color']?.toString(),
      );
}

class Ticket {
  const Ticket({
    required this.id,
    required this.ticketNumber,
    required this.subject,
    required this.description,
    required this.status,
    required this.priority,
    required this.createdAt,
    this.category,
    this.resolvedAt,
  });

  final String id;
  final String ticketNumber;
  final String subject;
  final String description;
  final String status;
  final String priority;
  final DateTime createdAt;
  final TicketCategory? category;
  final DateTime? resolvedAt;

  bool get isOpen => status.toUpperCase() == 'OPEN' || status.toUpperCase() == 'IN_PROGRESS';

  factory Ticket.fromJson(Map<String, dynamic> json) => Ticket(
        id: json['id']?.toString() ?? '',
        ticketNumber: json['ticketNumber']?.toString() ?? '-',
        subject: json['subject']?.toString() ?? '-',
        description: json['description']?.toString() ?? '',
        status: json['status']?.toString() ?? 'OPEN',
        priority: json['priority']?.toString() ?? 'MEDIUM',
        createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
        category: json['category'] is Map<String, dynamic> ? TicketCategory.fromJson(json['category']) : null,
        resolvedAt: json['resolvedAt'] != null ? DateTime.tryParse(json['resolvedAt'].toString()) : null,
      );
}

class TicketMessage {
  const TicketMessage({
    required this.id,
    required this.senderType,
    required this.senderName,
    required this.message,
    required this.createdAt,
  });

  final String id;
  final String senderType;
  final String senderName;
  final String message;
  final DateTime createdAt;

  bool get isFromCustomer => senderType.toUpperCase() == 'CUSTOMER';

  factory TicketMessage.fromJson(Map<String, dynamic> json) => TicketMessage(
        id: json['id']?.toString() ?? '',
        senderType: json['senderType']?.toString() ?? 'CUSTOMER',
        senderName: json['senderName']?.toString() ?? '-',
        message: json['message']?.toString() ?? '',
        createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
      );
}
