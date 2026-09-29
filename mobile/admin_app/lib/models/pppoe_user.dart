/// Mirrors rows from GET /api/pppoe/users (listPppoeUsers) and the `user`
/// object from GET /api/pppoe/users/:id (getPppoeUserById). Carries the
/// same field set the web panel's customer detail shows.
class PppoeUser {
  PppoeUser({
    required this.id,
    required this.username,
    required this.name,
    required this.phone,
    required this.status,
    required this.isOnline,
    this.customerId,
    this.password,
    this.email,
    this.address,
    this.expiredAt,
    this.createdAt,
    this.installDate,
    this.profileName,
    this.profilePrice,
    this.areaName,
    this.routerName,
    this.ipAddress,
    this.macAddress,
    this.subscriptionType,
    this.connectionType,
    this.billingDay,
    this.balance,
    this.comment,
    this.latitude,
    this.longitude,
    this.odp,
  });

  final String id;
  final String username;
  final String name;
  final String phone;
  final String status;

  /// Mutable: the list/detail refresh it from /api/pppoe/users/online-status
  /// after the initial load (see features/pppoe/online_status.dart).
  bool isOnline;
  final String? customerId;
  final String? password;
  final String? email;
  final String? address;
  final DateTime? expiredAt;
  final DateTime? createdAt;
  final DateTime? installDate;
  final String? profileName;
  final int? profilePrice;
  final String? areaName;
  final String? routerName;
  final String? ipAddress;
  final String? macAddress;
  final String? subscriptionType;
  final String? connectionType;
  final int? billingDay;
  final int? balance;
  final String? comment;
  final double? latitude;
  final double? longitude;
  final String? odp;

  bool get hasLocation => latitude != null && longitude != null && (latitude != 0 || longitude != 0);

  static DateTime? _d(dynamic v) => v == null ? null : DateTime.tryParse(v.toString());
  static int? _i(dynamic v) => v is num ? v.toInt() : int.tryParse('${v ?? ''}');
  static double? _f(dynamic v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}');
  static String? _s(dynamic v) {
    final s = v?.toString();
    return (s == null || s.isEmpty) ? null : s;
  }

  factory PppoeUser.fromJson(Map<String, dynamic> json) {
    final profile = (json['profile'] as Map?)?.cast<String, dynamic>();
    final area = (json['area'] as Map?)?.cast<String, dynamic>();
    final router = (json['router'] as Map?)?.cast<String, dynamic>();
    return PppoeUser(
      id: (json['id'] ?? '').toString(),
      username: (json['username'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      phone: (json['phone'] ?? '').toString(),
      status: (json['status'] ?? 'active').toString(),
      isOnline: json['isOnline'] == true,
      customerId: _s(json['customerId']),
      password: _s(json['password']),
      email: _s(json['email']),
      address: _s(json['address']),
      expiredAt: _d(json['expiredAt']),
      createdAt: _d(json['createdAt']),
      installDate: _d(json['installDate']),
      profileName: _s(profile?['name']),
      profilePrice: _i(profile?['price']),
      areaName: _s(area?['name']),
      routerName: _s(router?['name']),
      ipAddress: _s(json['ipAddress']),
      macAddress: _s(json['macAddress']),
      subscriptionType: _s(json['subscriptionType']),
      connectionType: _s(json['connectionType']),
      billingDay: _i(json['billingDay']),
      balance: _i(json['balance']),
      comment: _s(json['comment']),
      latitude: _f(json['latitude']),
      longitude: _f(json['longitude']),
      odp: _s(json['odp']),
    );
  }
}
