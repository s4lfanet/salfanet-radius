class SuspendRequestModel {
  const SuspendRequestModel({
    required this.id,
    required this.status,
    required this.startDate,
    required this.endDate,
    this.reason,
  });

  final String id;
  final String status;
  final DateTime startDate;
  final DateTime endDate;
  final String? reason;

  bool get isPending => status.toUpperCase() == 'PENDING';
  bool get isApproved => status.toUpperCase() == 'APPROVED';

  factory SuspendRequestModel.fromJson(Map<String, dynamic> json) => SuspendRequestModel(
        id: json['id']?.toString() ?? '',
        status: json['status']?.toString() ?? 'PENDING',
        startDate: DateTime.tryParse(json['startDate']?.toString() ?? '') ?? DateTime.now(),
        endDate: DateTime.tryParse(json['endDate']?.toString() ?? '') ?? DateTime.now(),
        reason: json['reason']?.toString(),
      );
}
