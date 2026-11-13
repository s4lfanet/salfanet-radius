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

  /// Whether this account may change anything at all. Fail-closed: when the
  /// permission list could not be read (null) a non-Super-Admin is treated as
  /// read-only, so buttons for add, edit and delete stay hidden. The server
  /// still enforces every write; this only keeps the screen honest.
  bool get canWrite => isSuperAdmin || (permissions?.any(_isWriteKey) ?? false);

  static bool _isWriteKey(String k) => const [
        '.create', '.edit', '.delete', '.manage', '.generate', '.approve', '.reject',
        '.send', '.broadcast', '.isolate', '.templates', '.providers', '.categories', '.permissions',
      ].any(k.endsWith);

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
