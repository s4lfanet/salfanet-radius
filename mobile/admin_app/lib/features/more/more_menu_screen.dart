import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../activity_log/activity_log_screen.dart';
import '../agents/agent_deposit_list_screen.dart';
import '../agents/agent_list_screen.dart';
import '../approvals/approval_list_screen.dart';
import '../collector_settlements/collector_settlement_screen.dart';
import '../hotspot/voucher_list_screen.dart';
import '../keuangan/keuangan_screen.dart';
import '../manual_payments/manual_payment_list_screen.dart';
import '../network/network_screen.dart';
import '../notifications/notifications_screen.dart';
import '../olt/olt_status_screen.dart';
import '../olt_alerts/olt_alert_screen.dart';
import '../ont_removal/ont_removal_screen.dart';
import '../payment_proofs/payment_proof_list_screen.dart';
import '../profile/profile_screen.dart';
import '../push_broadcast/push_broadcast_screen.dart';
import '../referrals/referral_list_screen.dart';
import '../registrations/registration_list_screen.dart';
import '../sessions/session_list_screen.dart';
import '../staff/staff_list_screen.dart';
import '../suspend_requests/suspend_request_list_screen.dart';
import '../technicians/technician_list_screen.dart';
import '../tickets/ticket_list_screen.dart';
import '../topup_requests/topup_request_list_screen.dart';

class _Entry {
  const _Entry(this.icon, this.label, this.hint, this.tone, this.builder);
  final IconData icon;
  final String label;
  final String hint;
  final Tone tone;
  final WidgetBuilder builder;
}

/// "Lainnya" tab: every module beyond the three primary tabs, grouped the
/// same way the web sidebar groups them so staff find things where they
/// already expect them.
class MoreMenuScreen extends StatelessWidget {
  const MoreMenuScreen({super.key});

  static final _sections = <(String, List<_Entry>)>[
    ('Pelanggan', [
      _Entry(Icons.person_add_alt_1_rounded, 'Registrasi', 'Pendaftaran baru dari halaman daftar', Tone.accent, (_) => const RegistrationListScreen()),
      _Entry(Icons.how_to_reg_rounded, 'Persetujuan', 'Akun dari teknisi/referral yang perlu dicek', Tone.primary, (_) => const ApprovalListScreen()),
      _Entry(Icons.pause_circle_outline_rounded, 'Permintaan Suspend', 'Cuti langganan sementara', Tone.warning, (_) => const SuspendRequestListScreen()),
      _Entry(Icons.support_agent_rounded, 'Tiket Bantuan', 'Keluhan dan gangguan pelanggan', Tone.violet, (_) => const TicketListScreen()),
    ]),
    ('Pembayaran', [
      _Entry(Icons.receipt_rounded, 'Pembayaran Manual', 'Bukti transfer dari pelanggan', Tone.success, (_) => const ManualPaymentListScreen()),
      _Entry(Icons.image_search_rounded, 'Bukti Pembayaran Kolektor', 'Foto bukti bayar dari lapangan', Tone.success, (_) => const PaymentProofListScreen()),
      _Entry(Icons.badge_rounded, 'Setoran Kolektor', 'Rekap tagihan tertagih per kolektor', Tone.warning, (_) => const CollectorSettlementScreen()),
      _Entry(Icons.savings_rounded, 'Top Up Saldo', 'Isi saldo prabayar pelanggan', Tone.success, (_) => const TopupRequestListScreen()),
      _Entry(Icons.account_balance_rounded, 'Keuangan', 'Pemasukan, pengeluaran, saldo', Tone.primary, (_) => const KeuanganScreen()),
      _Entry(Icons.card_giftcard_rounded, 'Referral', 'Bonus pelanggan yang mengajak', Tone.accent, (_) => const ReferralListScreen()),
    ]),
    ('Hotspot & Agent', [
      _Entry(Icons.confirmation_number_rounded, 'Voucher Hotspot', 'Lihat dan buat voucher', Tone.primary, (_) => const VoucherListScreen()),
      _Entry(Icons.storefront_rounded, 'Agent', 'Saldo dan penjualan reseller', Tone.accent, (_) => const AgentListScreen()),
      _Entry(Icons.account_balance_wallet_rounded, 'Deposit Agent', 'Isi saldo agent via transfer', Tone.success, (_) => const AgentDepositListScreen()),
    ]),
    ('Jaringan', [
      _Entry(Icons.wifi_tethering_rounded, 'Sesi Online', 'PPPoE dan hotspot yang terhubung', Tone.success, (_) => const SessionListScreen()),
      _Entry(Icons.router_rounded, 'Router / NAS', 'Status MikroTik', Tone.primary, (_) => const NetworkScreen()),
      _Entry(Icons.dns_rounded, 'Status OLT', 'Kondisi OLT dari monitoring', Tone.accent, (_) => const OltStatusScreen()),
      _Entry(Icons.warning_amber_rounded, 'Alert OLT', 'ONU offline, sinyal lemah, dll', Tone.danger, (_) => const OltAlertScreen()),
      _Entry(Icons.assignment_return_rounded, 'Penarikan ONT', 'Tugas ambil perangkat pelanggan berhenti', Tone.warning, (_) => const OntRemovalScreen()),
    ]),
    ('Tim & Komunikasi', [
      _Entry(Icons.campaign_rounded, 'Broadcast Notifikasi', 'Kirim pengumuman ke pelanggan', Tone.primary, (_) => const PushBroadcastScreen()),
      _Entry(Icons.notifications_rounded, 'Notifikasi', 'Pemberitahuan sistem untuk admin', Tone.warning, (_) => const NotificationsScreen()),
      _Entry(Icons.groups_rounded, 'Staf & Tim', 'Akun admin dan hak aksesnya', Tone.primary, (_) => const StaffListScreen()),
      _Entry(Icons.engineering_rounded, 'Teknisi Lapangan', 'Daftar teknisi', Tone.accent, (_) => const TechnicianListScreen()),
      _Entry(Icons.history_rounded, 'Log Aktivitas', 'Siapa melakukan apa', Tone.neutral, (_) => const ActivityLogScreen()),
    ]),
    ('Akun', [
      _Entry(Icons.settings_rounded, 'Profil & Pengaturan', 'Tampilan, server, keluar', Tone.neutral, (_) => const ProfileScreen()),
    ]),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Lainnya')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Gap.page, Gap.xs, Gap.page, Gap.xl),
        children: [
          for (final (title, entries) in _sections) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(2, Gap.lg, 0, Gap.sm),
              child: Text(title, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: context.colors.onSurfaceVariant)),
            ),
            Card(
              clipBehavior: Clip.antiAlias,
              child: Column(
                children: [
                  for (var i = 0; i < entries.length; i++) ...[
                    if (i > 0) const Divider(indent: 68),
                    _Row(entry: entries[i]),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.entry});
  final _Entry entry;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: entry.builder)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.md, Gap.md, Gap.md),
        child: Row(
          children: [
            RoleIconTile(icon: entry.icon, color: context.tone(entry.tone), size: 38),
            const SizedBox(width: Gap.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(entry.label, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 1),
                  Text(entry.hint, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: context.colors.onSurfaceVariant)),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: context.colors.onSurfaceVariant),
          ],
        ),
      ),
    );
  }
}
