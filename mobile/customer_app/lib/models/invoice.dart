class Invoice {
  const Invoice({
    required this.id,
    required this.invoiceNumber,
    required this.amount,
    required this.status,
    required this.dueDate,
    this.paidAt,
    this.paymentLink,
    required this.createdAt,
    required this.invoiceType,
    this.profileName,
    this.paymentSource,
    this.manualPaymentStatus,
    this.manualPaymentBank,
  });

  final String id;
  final String invoiceNumber;
  final double amount;
  final String status;
  final DateTime dueDate;
  final DateTime? paidAt;
  final String? paymentLink;
  final DateTime createdAt;
  final String invoiceType;
  final String? profileName;
  final String? paymentSource;
  final String? manualPaymentStatus;
  final String? manualPaymentBank;

  bool get isPaid => status.toUpperCase() == 'PAID';
  bool get isOverdue => status.toUpperCase() == 'OVERDUE';
  bool get isPayable => status.toUpperCase() == 'PENDING' || isOverdue;

  /// True while a manual (transfer/collector) payment proof is awaiting admin review.
  bool get isPendingReview => manualPaymentStatus?.toUpperCase() == 'PENDING';

  factory Invoice.fromJson(Map<String, dynamic> json) => Invoice(
        id: json['id']?.toString() ?? '',
        invoiceNumber: json['invoiceNumber']?.toString() ?? '-',
        amount: (json['amount'] as num?)?.toDouble() ?? 0,
        status: json['status']?.toString() ?? 'PENDING',
        dueDate: DateTime.tryParse(json['dueDate']?.toString() ?? '') ?? DateTime.now(),
        paidAt: json['paidAt'] != null ? DateTime.tryParse(json['paidAt'].toString()) : null,
        paymentLink: json['paymentLink']?.toString(),
        createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
        invoiceType: json['invoiceType']?.toString() ?? 'MONTHLY',
        profileName: json['profileName']?.toString(),
        paymentSource: json['paymentSource']?.toString(),
        manualPaymentStatus: json['manualPaymentStatus']?.toString(),
        manualPaymentBank: json['manualPaymentBank']?.toString(),
      );
}

class InvoicePage {
  const InvoicePage({required this.invoices, required this.page, required this.totalPages});
  final List<Invoice> invoices;
  final int page;
  final int totalPages;

  factory InvoicePage.fromJson(Map<String, dynamic> json) {
    final list = (json['invoices'] as List? ?? [])
        .map((e) => Invoice.fromJson(e as Map<String, dynamic>))
        .toList();
    final pagination = json['pagination'] as Map<String, dynamic>? ?? const {};
    return InvoicePage(
      invoices: list,
      page: (pagination['page'] as num?)?.toInt() ?? 1,
      totalPages: (pagination['totalPages'] as num?)?.toInt() ?? 1,
    );
  }
}
