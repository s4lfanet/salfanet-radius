class PackageProfile {
  const PackageProfile({
    required this.id,
    required this.name,
    this.downloadSpeed,
    this.uploadSpeed,
    this.price,
  });

  final String id;
  final String name;
  final int? downloadSpeed;
  final int? uploadSpeed;
  final double? price;

  factory PackageProfile.fromJson(Map<String, dynamic> json) => PackageProfile(
        id: json['id']?.toString() ?? '',
        name: json['name']?.toString() ?? '-',
        downloadSpeed: (json['downloadSpeed'] as num?)?.toInt(),
        uploadSpeed: (json['uploadSpeed'] as num?)?.toInt(),
        price: (json['price'] as num?)?.toDouble(),
      );
}

class CustomerProfile {
  const CustomerProfile({
    required this.id,
    required this.username,
    required this.name,
    required this.phone,
    this.email,
    required this.status,
    this.expiredAt,
    this.balance,
    this.autoRenewal,
    this.customerId,
    this.address,
    this.latitude,
    this.longitude,
    this.profile,
  });

  final String id;
  final String username;
  final String name;
  final String phone;
  final String? email;
  final String status;
  final DateTime? expiredAt;
  final double? balance;
  final bool? autoRenewal;
  final String? customerId;
  final String? address;

  /// Coordinates recorded when the line was installed. Offered as the
  /// fallback when creating a ticket from somewhere other than home, or when
  /// the device refuses to give a GPS fix.
  final double? latitude;
  final double? longitude;

  final PackageProfile? profile;

  bool get isActive => status.toUpperCase() == 'ACTIVE';

  bool get hasRegisteredCoords => latitude != null && longitude != null;

  factory CustomerProfile.fromJson(Map<String, dynamic> json) => CustomerProfile(
        id: json['id']?.toString() ?? '',
        username: json['username']?.toString() ?? '',
        name: json['name']?.toString() ?? '-',
        phone: json['phone']?.toString() ?? '',
        email: json['email']?.toString(),
        status: json['status']?.toString() ?? 'UNKNOWN',
        expiredAt: json['expiredAt'] != null ? DateTime.tryParse(json['expiredAt'].toString()) : null,
        balance: (json['balance'] as num?)?.toDouble(),
        autoRenewal: json['autoRenewal'] as bool?,
        customerId: json['customerId']?.toString(),
        address: json['address']?.toString(),
        latitude: (json['latitude'] as num?)?.toDouble(),
        longitude: (json['longitude'] as num?)?.toDouble(),
        profile: json['profile'] is Map<String, dynamic> ? PackageProfile.fromJson(json['profile']) : null,
      );
}
