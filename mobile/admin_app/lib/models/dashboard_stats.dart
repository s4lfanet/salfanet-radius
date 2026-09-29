/// Mirrors the object returned by GET /api/dashboard/stats
/// (backend/src/app/api/dashboard/stats/route.ts). Kept loose/dynamic for
/// the less-critical nested arrays (activities, agentSales) since those are
/// rendered generically — only the top-line counters get typed fields.
class DashboardStats {
  DashboardStats({
    required this.totalPppoeUsers,
    required this.activePppoeUsers,
    required this.activeSessionsPPPoE,
    required this.activeSessionsHotspot,
    required this.unusedVouchers,
    required this.isolatedCount,
    required this.suspendedCount,
    required this.newRegistrations,
    required this.upcomingInvoices,
    required this.voucherRevenueFormatted,
    required this.voucherRevenueTodayFormatted,
    required this.invoiceRevenueFormatted,
    required this.invoiceRevenueTodayFormatted,
    required this.invoiceCountToday,
    required this.invoiceCountMonth,
    required this.unpaidInvoicesCount,
    required this.totalAllTimeRevenueFormatted,
    required this.radiusOnline,
    required this.databaseOnline,
    required this.apiOnline,
    required this.periodLabel,
    required this.activities,
  });

  final int totalPppoeUsers;
  final int activePppoeUsers;
  final int activeSessionsPPPoE;
  final int activeSessionsHotspot;
  final int unusedVouchers;
  final int isolatedCount;
  final int suspendedCount;
  final int newRegistrations;
  final int upcomingInvoices;
  final String voucherRevenueFormatted;
  final String voucherRevenueTodayFormatted;
  final String invoiceRevenueFormatted;
  final String invoiceRevenueTodayFormatted;
  final int invoiceCountToday;
  final int invoiceCountMonth;
  final int unpaidInvoicesCount;
  final String totalAllTimeRevenueFormatted;

  /// Overridden by DashboardProvider with the real service state from
  /// /api/freeradius/status when the account can read it.
  bool radiusOnline;
  final bool databaseOnline;
  final bool apiOnline;
  final String periodLabel;
  final List<dynamic> activities;

  static int _i(dynamic v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
  static String _s(dynamic v) => v?.toString() ?? '-';
  // The backend sends real booleans for systemStatus (see
  // dashboard/stats/route.ts) — this used to go through _s() and get
  // stringified to "true"/"false", which the status chip then compared
  // against strings like 'online'/'healthy' and always lost, so RADIUS/
  // Database/API showed red regardless of actual status.
  static bool _b(dynamic v) => v == true;

  factory DashboardStats.fromJson(Map<String, dynamic> json) {
    final s = (json['stats'] as Map?)?.cast<String, dynamic>() ?? {};
    final systemStatus = (json['systemStatus'] as Map?)?.cast<String, dynamic>() ?? {};
    return DashboardStats(
      totalPppoeUsers: _i(s['totalPppoeUsers']),
      activePppoeUsers: _i(s['activePppoeUsers']),
      activeSessionsPPPoE: _i(s['activeSessionsPPPoE']),
      activeSessionsHotspot: _i(s['activeSessionsHotspot']),
      unusedVouchers: _i(s['unusedVouchers']),
      isolatedCount: _i(s['isolatedCount']),
      suspendedCount: _i(s['suspendedCount']),
      newRegistrations: _i(s['newRegistrations']),
      upcomingInvoices: _i(s['upcomingInvoices']),
      voucherRevenueFormatted: _s(s['voucherRevenueFormatted']),
      voucherRevenueTodayFormatted: _s(s['voucherRevenueTodayFormatted']),
      invoiceRevenueFormatted: _s(s['invoiceRevenueFormatted']),
      invoiceRevenueTodayFormatted: _s(s['invoiceRevenueTodayFormatted']),
      invoiceCountToday: _i(s['invoiceCountToday']),
      invoiceCountMonth: _i(s['invoiceCountMonth']),
      unpaidInvoicesCount: _i(s['unpaidInvoicesCount']),
      totalAllTimeRevenueFormatted: _s(s['totalAllTimeRevenueFormatted']),
      radiusOnline: _b(systemStatus['radius']),
      databaseOnline: _b(systemStatus['database']),
      apiOnline: _b(systemStatus['api']),
      periodLabel: _s(json['periodLabel']),
      activities: (json['activities'] as List?) ?? const [],
    );
  }
}
