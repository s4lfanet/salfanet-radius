class AgentUser {
  AgentUser({required this.id, required this.name, required this.phone, this.email});

  final String id;
  final String name;
  final String phone;
  final String? email;

  factory AgentUser.fromJson(Map<String, dynamic> json) {
    return AgentUser(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      phone: (json['phone'] ?? '').toString(),
      email: json['email']?.toString(),
    );
  }
}
