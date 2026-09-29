class AdminUser {
  AdminUser({required this.id, required this.username, required this.name, required this.role, this.email});

  final String id;
  final String username;
  final String name;
  final String role;
  final String? email;

  bool get isSuperAdmin => role == 'SUPER_ADMIN';

  factory AdminUser.fromJson(Map<String, dynamic> json) {
    return AdminUser(
      id: (json['id'] ?? '').toString(),
      username: (json['username'] ?? '').toString(),
      name: (json['name'] ?? json['username'] ?? '').toString(),
      role: (json['role'] ?? '').toString(),
      email: json['email']?.toString(),
    );
  }
}
