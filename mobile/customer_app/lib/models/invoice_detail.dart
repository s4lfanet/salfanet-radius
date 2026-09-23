import 'company_info.dart';

class InvoiceLineItem {
  const InvoiceLineItem({required this.description, required this.quantity, required this.price, required this.total});
  final String description;
  final int quantity;
  final double price;
  final double total;

  factory InvoiceLineItem.fromJson(Map<String, dynamic> json) => InvoiceLineItem(
        description: json['description']?.toString() ?? '-',
        quantity: (json['quantity'] as num?)?.toInt() ?? 1,
        price: (json['price'] as num?)?.toDouble() ?? 0,
        total: (json['total'] as num?)?.toDouble() ?? 0,
      );
}

class InvoiceFee {
  const InvoiceFee({required this.name, required this.amount});
  final String name;
  final double amount;

  factory InvoiceFee.fromJson(Map<String, dynamic> json) => InvoiceFee(
        name: (json['name'] ?? json['description'])?.toString() ?? '-',
        amount: (json['amount'] as num?)?.toDouble() ?? 0,
      );
}

class InvoiceTax {
  const InvoiceTax({required this.hasTax, required this.baseAmount, required this.taxRate, required this.taxAmount});
  final bool hasTax;
  final double baseAmount;
  final double taxRate;
  final double taxAmount;

  factory InvoiceTax.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const InvoiceTax(hasTax: false, baseAmount: 0, taxRate: 0, taxAmount: 0);
    return InvoiceTax(
      hasTax: json['hasTax'] as bool? ?? false,
      baseAmount: (json['baseAmount'] as num?)?.toDouble() ?? 0,
      taxRate: (json['taxRate'] as num?)?.toDouble() ?? 0,
      taxAmount: (json['taxAmount'] as num?)?.toDouble() ?? 0,
    );
  }
}

class InvoiceCustomer {
  const InvoiceCustomer({
    required this.name,
    this.phone,
    this.email,
    this.username,
    this.address,
    this.customerId,
    this.area,
  });
  final String name;
  final String? phone;
  final String? email;
  final String? username;
  final String? address;
  final String? customerId;
  final String? area;

  factory InvoiceCustomer.fromJson(Map<String, dynamic> json) => InvoiceCustomer(
        name: json['name']?.toString() ?? '-',
        phone: json['phone']?.toString(),
        email: json['email']?.toString(),
        username: json['username']?.toString(),
        address: json['address']?.toString(),
        customerId: json['customerId']?.toString(),
        area: json['area']?.toString(),
      );
}

class InvoiceDetailData {
  const InvoiceDetailData({
    required this.company,
    required this.customer,
    required this.number,
    required this.date,
    required this.dueDate,
    required this.status,
    this.paidAt,
    required this.items,
    required this.additionalFees,
    required this.tax,
    required this.subtotal,
    required this.total,
    required this.amountFormatted,
    this.paymentLink,
    this.paidVia,
  });

  final CompanyInfo company;
  final InvoiceCustomer customer;
  final String number;
  final String date;
  final String dueDate;
  final String status;
  final String? paidAt;
  final List<InvoiceLineItem> items;
  final List<InvoiceFee> additionalFees;
  final InvoiceTax tax;
  final double subtotal;
  final double total;
  final String amountFormatted;
  final String? paymentLink;
  final String? paidVia;

  bool get isPaid => status.toUpperCase() == 'PAID';

  factory InvoiceDetailData.fromJson(Map<String, dynamic> json) {
    final invoice = json['invoice'] as Map<String, dynamic>? ?? const {};
    return InvoiceDetailData(
      company: CompanyInfo.fromJson(json['company'] as Map<String, dynamic>? ?? const {}),
      customer: InvoiceCustomer.fromJson(json['customer'] as Map<String, dynamic>? ?? const {}),
      number: invoice['number']?.toString() ?? '-',
      date: invoice['date']?.toString() ?? '-',
      dueDate: invoice['dueDate']?.toString() ?? '-',
      status: invoice['status']?.toString() ?? 'PENDING',
      paidAt: invoice['paidAt']?.toString(),
      items: (json['items'] as List? ?? []).whereType<Map<String, dynamic>>().map(InvoiceLineItem.fromJson).toList(),
      additionalFees:
          (json['additionalFees'] as List? ?? []).whereType<Map<String, dynamic>>().map(InvoiceFee.fromJson).toList(),
      tax: InvoiceTax.fromJson(json['tax'] as Map<String, dynamic>?),
      subtotal: (json['subtotal'] as num?)?.toDouble() ?? 0,
      total: (json['total'] as num?)?.toDouble() ?? 0,
      amountFormatted: json['amountFormatted']?.toString() ?? '-',
      paymentLink: json['paymentLink']?.toString(),
      paidVia: json['paidVia']?.toString(),
    );
  }
}
