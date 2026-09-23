class PackageOption {
  const PackageOption({
    required this.id,
    required this.name,
    required this.downloadSpeed,
    required this.uploadSpeed,
    required this.price,
    this.description,
  });

  final String id;
  final String name;
  final int downloadSpeed;
  final int uploadSpeed;
  final double price;
  final String? description;

  factory PackageOption.fromJson(Map<String, dynamic> json) => PackageOption(
        id: json['id']?.toString() ?? '',
        name: json['name']?.toString() ?? '-',
        downloadSpeed: (json['downloadSpeed'] as num?)?.toInt() ?? 0,
        uploadSpeed: (json['uploadSpeed'] as num?)?.toInt() ?? 0,
        price: (json['price'] as num?)?.toDouble() ?? 0,
        description: json['description']?.toString(),
      );
}

class PaymentGatewayOption {
  const PaymentGatewayOption({required this.id, required this.name, required this.provider});
  final String id;
  final String name;
  final String provider;

  factory PaymentGatewayOption.fromJson(Map<String, dynamic> json) => PaymentGatewayOption(
        id: json['id']?.toString() ?? '',
        name: json['name']?.toString() ?? '-',
        provider: json['provider']?.toString() ?? '',
      );
}

class PaymentChannel {
  const PaymentChannel({required this.code, required this.name, this.totalFee});
  final String code;
  final String name;
  final double? totalFee;

  factory PaymentChannel.fromJson(Map<String, dynamic> json) => PaymentChannel(
        code: json['code']?.toString() ?? '',
        name: json['name']?.toString() ?? '-',
        totalFee: (json['totalFee'] as num?)?.toDouble(),
      );
}
