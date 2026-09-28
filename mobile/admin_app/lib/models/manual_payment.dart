/// Mirrors rows returned by GET /api/manual-payments — customer-submitted
/// transfer proofs awaiting admin approve/reject.
class ManualPayment {
  ManualPayment({
    required this.id,
    required this.amount,
    required this.bankName,
    required this.accountName,
    required this.paymentDate,
    required this.status,
    required this.createdAt,
    this.accountNumber,
    this.receiptImage,
    this.notes,
    this.rejectionReason,
    this.customerName,
    this.customerUsername,
    this.customerPhone,
    this.invoiceNumber,
  });

  final String id;
  final num amount;
  final String bankName;
  final String accountName;
  final DateTime paymentDate;
  final String status;
  final DateTime createdAt;
  final String? accountNumber;
  final String? receiptImage;
  final String? notes;
  final String? rejectionReason;
  final String? customerName;
  final String? customerUsername;
  final String? customerPhone;
  final String? invoiceNumber;

  factory ManualPayment.fromJson(Map<String, dynamic> json) {
    final user = (json['user'] as Map?)?.cast<String, dynamic>();
    final invoice = (json['invoice'] as Map?)?.cast<String, dynamic>();
    return ManualPayment(
      id: (json['id'] ?? '').toString(),
      amount: json['amount'] is num ? json['amount'] as num : num.tryParse('${json['amount']}') ?? 0,
      bankName: (json['bankName'] ?? '-').toString(),
      accountName: (json['accountName'] ?? '-').toString(),
      paymentDate: DateTime.tryParse(json['paymentDate']?.toString() ?? '') ?? DateTime.now(),
      status: (json['status'] ?? 'PENDING').toString(),
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
      accountNumber: json['accountNumber']?.toString(),
      receiptImage: json['receiptImage']?.toString(),
      notes: json['notes']?.toString(),
      rejectionReason: json['rejectionReason']?.toString(),
      customerName: user?['name']?.toString(),
      customerUsername: user?['username']?.toString(),
      customerPhone: user?['phone']?.toString(),
      invoiceNumber: invoice?['invoiceNumber']?.toString(),
    );
  }
}
