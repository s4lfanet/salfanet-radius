class AdminUser {
  AdminUser({required this.id, required this.username, required this.name, required this.role, this.email, this.permissions});

  final String id;
  final String username;
  final String name;
  final String role;
  final String? email;

  bool get isSuperAdmin => role == 'SUPER_ADMIN';

  /// Permission keys of this account, as the web sidebar uses them. Null
  /// when they could not be loaded (an older server refused the request):
  /// then nothing is hidden, as before.
  Set<String>? permissions;

  /// Whether a menu, tab or shortcut needing [key] is shown.
  bool can(String? key) => key == null || isSuperAdmin || permissions == null || permissions!.contains(key);

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
