/// Mirrors rows returned by GET /api/invoices (backend/src/app/api/invoices/route.ts).
class Invoice {
  Invoice({
    required this.id,
    required this.invoiceNumber,
    required this.amount,
    required this.status,
    required this.dueDate,
    this.paidAt,
    this.createdAt,
    this.customerName,
    this.customerPhone,
    this.customerEmail,
    this.customerUsername,
    this.customerId,
    this.profileName,
    this.areaName,
    this.userId,
    this.notes,
    this.paymentLink,
    this.paymentMethod,
    this.invoiceType,
    this.baseAmount,
  });

  final String id;
  final String invoiceNumber;
  final int amount;
  final String status;
  final DateTime dueDate;
  final DateTime? paidAt;
  final DateTime? createdAt;
  final String? customerName;
  final String? customerPhone;
  final String? customerEmail;
  final String? customerUsername;
  final String? customerId;
  final String? profileName;
  final String? areaName;
  final String? userId;
  final String? notes;
  final String? paymentLink;
  final String? paymentMethod;
  final String? invoiceType;
  final int? baseAmount;

  bool get isPaid => status.toUpperCase() == 'PAID';

  static String? _s(dynamic v) {
    final s = v?.toString();
    return (s == null || s.isEmpty) ? null : s;
  }

  factory Invoice.fromJson(Map<String, dynamic> json) {
    final user = (json['user'] as Map?)?.cast<String, dynamic>();
    final profile = (user?['profile'] as Map?)?.cast<String, dynamic>();
    final area = (user?['area'] as Map?)?.cast<String, dynamic>();
    return Invoice(
      id: (json['id'] ?? '').toString(),
      invoiceNumber: (json['invoiceNumber'] ?? '').toString(),
      amount: json['amount'] is num ? (json['amount'] as num).toInt() : int.tryParse('${json['amount']}') ?? 0,
      status: (json['status'] ?? 'PENDING').toString(),
      dueDate: DateTime.tryParse(json['dueDate']?.toString() ?? '') ?? DateTime.now(),
      paidAt: json['paidAt'] != null ? DateTime.tryParse(json['paidAt'].toString()) : null,
      createdAt: json['createdAt'] != null ? DateTime.tryParse(json['createdAt'].toString()) : null,
      customerName: _s(json['customerName']) ?? _s(user?['name']),
      customerPhone: _s(json['customerPhone']) ?? _s(user?['phone']),
      customerEmail: _s(json['customerEmail']) ?? _s(user?['email']),
      customerUsername: _s(json['customerUsername']) ?? _s(user?['username']),
      customerId: _s(user?['customerId']),
      profileName: _s(profile?['name']),
      areaName: _s(area?['name']),
      userId: _s(json['userId']),
      notes: _s(json['notes']),
      paymentLink: _s(json['paymentLink']),
      paymentMethod: _s(json['paymentMethod']),
      invoiceType: _s(json['invoiceType']),
      baseAmount: json['baseAmount'] is num ? (json['baseAmount'] as num).toInt() : null,
    );
  }
}

const invoiceTypeLabels = {'MONTHLY': 'Bulanan', 'INSTALLATION': 'Pemasangan', 'ADDON': 'Tambahan', 'TOPUP': 'Top Up', 'RENEWAL': 'Perpanjangan'};

class InvoiceStats {
  InvoiceStats({
    required this.total,
    required this.unpaid,
    required this.paid,
    required this.pending,
    required this.overdue,
    required this.totalUnpaidAmount,
    required this.totalPaidAmount,
  });

  final int total;
  final int unpaid;
  final int paid;
  final int pending;
  final int overdue;
  final int totalUnpaidAmount;
  final int totalPaidAmount;

  static int _i(dynamic v) => v is num ? v.toInt() : 0;

  factory InvoiceStats.fromJson(Map<String, dynamic> json) {
    return InvoiceStats(
      total: _i(json['total']),
      unpaid: _i(json['unpaid']),
      paid: _i(json['paid']),
      pending: _i(json['pending']),
      overdue: _i(json['overdue']),
      totalUnpaidAmount: _i(json['totalUnpaidAmount']),
      totalPaidAmount: _i(json['totalPaidAmount']),
    );
  }
}
