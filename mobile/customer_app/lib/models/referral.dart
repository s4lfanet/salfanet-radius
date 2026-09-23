class ReferralInfo {
  const ReferralInfo({
    required this.code,
    required this.shareUrl,
    required this.totalReferred,
    required this.totalRewardsCredited,
    required this.pendingRewardsAmount,
    required this.enabled,
    required this.rewardAmount,
  });

  final String? code;
  final String? shareUrl;
  final int totalReferred;
  final double totalRewardsCredited;
  final double pendingRewardsAmount;
  final bool enabled;
  final double rewardAmount;

  factory ReferralInfo.fromJson(Map<String, dynamic> json) {
    final referral = json['referral'] as Map<String, dynamic>? ?? const {};
    final stats = referral['stats'] as Map<String, dynamic>? ?? const {};
    final config = json['config'] as Map<String, dynamic>? ?? const {};
    return ReferralInfo(
      code: referral['code']?.toString(),
      shareUrl: referral['shareUrl']?.toString(),
      totalReferred: (stats['totalReferred'] as num?)?.toInt() ?? 0,
      totalRewardsCredited: (stats['totalRewardsCredited'] as num?)?.toDouble() ?? 0,
      pendingRewardsAmount: (stats['pendingRewardsAmount'] as num?)?.toDouble() ?? 0,
      enabled: config['enabled'] as bool? ?? false,
      rewardAmount: (config['rewardAmount'] as num?)?.toDouble() ?? 0,
    );
  }
}
