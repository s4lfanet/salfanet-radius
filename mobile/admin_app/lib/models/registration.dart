/// Mirrors rows returned by GET /api/admin/registrations.
class Registration {
  Registration({
    required this.id,
    required this.name,
    required this.phone,
    required this.address,
    required this.status,
    required this.createdAt,
    this.email,
    this.profileName,
    this.profilePrice,
    this.profileSpeed,
    this.areaName,
    this.areaId,
    this.notes,
    this.rejectionReason,
    this.installationFee,
    this.idCardNumber,
    this.idCardPhoto,
    this.referralCode,
    this.latitude,
    this.longitude,
    this.invoiceNumber,
    this.invoiceStatus,
    this.pppoeUsername,
    this.pppoeUserId,
  });

  final String id;
  final String name;
  final String phone;
  final String address;
  final String status;
  final DateTime createdAt;
  final String? email;
  final String? profileName;
  final int? profilePrice;
  final String? profileSpeed;
  final String? areaName;
  final String? areaId;
  final String? notes;
  final String? rejectionReason;
  final num? installationFee;
  final String? idCardNumber;
  final String? idCardPhoto;
  final String? referralCode;
  final double? latitude;
  final double? longitude;
  final String? invoiceNumber;
  final String? invoiceStatus;
  final String? pppoeUsername;
  final String? pppoeUserId;

  bool get hasLocation => latitude != null && longitude != null && (latitude != 0 || longitude != 0);

  static String? _s(dynamic v) {
    final s = v?.toString();
    return (s == null || s.isEmpty) ? null : s;
  }

  factory Registration.fromJson(Map<String, dynamic> json) {
    final profile = (json['profile'] as Map?)?.cast<String, dynamic>();
    final area = (json['area'] as Map?)?.cast<String, dynamic>();
    final invoice = (json['invoice'] as Map?)?.cast<String, dynamic>();
    final user = (json['pppoeUser'] as Map?)?.cast<String, dynamic>();
    final down = profile?['downloadSpeed'];
    final up = profile?['uploadSpeed'];
    return Registration(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      phone: (json['phone'] ?? '').toString(),
      address: (json['address'] ?? '').toString(),
      status: (json['status'] ?? 'PENDING').toString(),
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
      email: _s(json['email']),
      profileName: _s(profile?['name']),
      profilePrice: profile?['price'] is num ? (profile!['price'] as num).toInt() : null,
      profileSpeed: down != null ? '$down/${up ?? '-'} Mbps' : null,
      areaName: _s(area?['name']),
      areaId: _s(area?['id'] ?? json['areaId']),
      notes: _s(json['notes']),
      rejectionReason: _s(json['rejectionReason']),
      installationFee: num.tryParse('${json['installationFee'] ?? ''}'),
      idCardNumber: _s(json['idCardNumber']),
      idCardPhoto: _s(json['idCardPhoto']),
      referralCode: _s(json['referralCode']),
      latitude: json['latitude'] is num ? (json['latitude'] as num).toDouble() : null,
      longitude: json['longitude'] is num ? (json['longitude'] as num).toDouble() : null,
      invoiceNumber: _s(invoice?['invoiceNumber']),
      invoiceStatus: _s(invoice?['status']),
      pppoeUsername: _s(user?['username']),
      pppoeUserId: _s(user?['id']),
    );
  }
}

class RegistrationStats {
  RegistrationStats({required this.pending, required this.approved, required this.installed, required this.active, required this.rejected});
  final int pending;
  final int approved;
  final int installed;
  final int active;
  final int rejected;

  static int _i(dynamic v) => v is num ? v.toInt() : 0;

  factory RegistrationStats.fromJson(Map<String, dynamic> json) {
    return RegistrationStats(
      pending: _i(json['pending']),
      approved: _i(json['approved']),
      installed: _i(json['installed']),
      active: _i(json['active']),
      rejected: _i(json['rejected']),
    );
  }
}
