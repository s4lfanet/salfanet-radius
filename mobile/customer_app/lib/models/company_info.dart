class BankAccount {
  const BankAccount({required this.bankName, required this.accountNumber, required this.accountName});
  final String bankName;
  final String accountNumber;
  final String accountName;

  factory BankAccount.fromJson(Map<String, dynamic> json) => BankAccount(
        bankName: json['bankName']?.toString() ?? '-',
        accountNumber: json['accountNumber']?.toString() ?? '-',
        accountName: json['accountName']?.toString() ?? '-',
      );
}

class CompanyInfo {
  const CompanyInfo({
    required this.name,
    this.logo,
    this.phone,
    this.email,
    this.address,
    this.poweredBy,
    this.bankAccounts = const [],
  });

  final String name;
  final String? logo;
  final String? phone;
  final String? email;
  final String? address;
  final String? poweredBy;
  final List<BankAccount> bankAccounts;

  factory CompanyInfo.fromJson(Map<String, dynamic> json) => CompanyInfo(
        name: (json['name']?.toString().isNotEmpty ?? false) ? json['name'].toString() : 'Internet Service Provider',
        logo: json['logo']?.toString(),
        phone: json['phone']?.toString(),
        email: json['email']?.toString(),
        address: json['address']?.toString(),
        poweredBy: json['poweredBy']?.toString(),
        bankAccounts: (json['bankAccounts'] as List? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(BankAccount.fromJson)
            .toList(),
      );
}
