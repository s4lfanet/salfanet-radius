class CollectorUser {
  CollectorUser({required this.id, required this.username, required this.name, this.phone, this.email, this.scopeLabel});

  final String id;
  final String username;
  final String name;
  final String? phone;
  final String? email;

  /// "Area X · Router Y" — the patch this collector is assigned to, as the
  /// web portal shows it in the topbar.
  final String? scopeLabel;

  factory CollectorUser.fromJson(Map<String, dynamic> json) {
    return CollectorUser(
      id: (json['id'] ?? '').toString(),
      username: (json['username'] ?? '').toString(),
      name: (json['name'] ?? json['username'] ?? '').toString(),
      phone: json['phone']?.toString(),
      email: json['email']?.toString(),
      scopeLabel: json['scopeLabel']?.toString(),
    );
  }
}
