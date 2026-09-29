import 'package:flutter/material.dart';

import '../../core/crud/crud_list_screen.dart';
import '../../core/forms/form_screen.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/entity_tile.dart';
import '../activity_log/activity_log_screen.dart';
import '../resources/genieacs_resources.dart';
import '../resources/hotspot_resources.dart';
import '../resources/messaging_resources.dart';
import '../resources/network_resources.dart';
import '../resources/pppoe_resources.dart';
import '../resources/radius_resources.dart';
import '../resources/settings_resources.dart';
import '../resources/team_resources.dart';
import '../tickets/ticket_tools.dart';
import '../agents/agent_deposit_list_screen.dart';
import '../approvals/approval_list_screen.dart';
import '../collector_settlements/collector_settlement_screen.dart';
import '../keuangan/keuangan_screen.dart';
import '../manual_payments/manual_payment_list_screen.dart';
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
import '../suspend_requests/suspend_request_list_screen.dart';
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

  static WidgetBuilder _crud(CrudConfig Function() c) =>
      (_) => CrudListScreen(config: c());
  static WidgetBuilder _settings(SettingsFormScreen Function() s) =>
      (_) => s();

  static final _sections = <(String, List<_Entry>)>[
    (
      'Pelanggan',
      [
        _Entry(Icons.person_add_alt_1_rounded, 'Registrasi', 'Pendaftaran baru dari halaman daftar', Tone.accent, (_) => const RegistrationListScreen()),
        _Entry(Icons.how_to_reg_rounded, 'Persetujuan', 'Akun dari teknisi/referral yang perlu dicek', Tone.primary, (_) => const ApprovalListScreen()),
        _Entry(Icons.pause_circle_outline_rounded, 'Permintaan Suspend', 'Cuti langganan sementara', Tone.warning, (_) => const SuspendRequestListScreen()),
        _Entry(Icons.support_agent_rounded, 'Tiket Bantuan', 'Keluhan dan gangguan pelanggan', Tone.violet, (_) => const TicketListScreen()),
        _Entry(Icons.label_rounded, 'Kategori Tiket', 'Jenis keluhan untuk tiket', Tone.violet, _crud(ticketCategoriesConfig)),
      ],
    ),
    (
      'Layanan PPPoE',
      [
        _Entry(Icons.speed_rounded, 'Paket PPPoE', 'Harga, kecepatan, sinkron RADIUS/MikroTik', Tone.primary, _crud(pppoeProfilesConfig)),
        _Entry(Icons.map_rounded, 'Area', 'Wilayah layanan', Tone.accent, _crud(pppoeAreasConfig)),
        _Entry(Icons.extension_rounded, 'Add-on Layanan', 'Tambahan tagihan (IP publik, dll.)', Tone.violet, _crud(addonTypesConfig)),
        _Entry(Icons.lan_rounded, 'IP Pool RADIUS', 'Pool alamat dan mapping ke group', Tone.accent, _crud(ipPoolsConfig)),
      ],
    ),
    (
      'Pembayaran',
      [
        _Entry(Icons.receipt_rounded, 'Pembayaran Manual', 'Bukti transfer dari pelanggan', Tone.success, (_) => const ManualPaymentListScreen()),
        _Entry(Icons.image_search_rounded, 'Bukti Pembayaran Kolektor', 'Foto bukti bayar dari lapangan', Tone.success, (_) => const PaymentProofListScreen()),
        _Entry(Icons.badge_rounded, 'Setoran Kolektor', 'Rekap tagihan tertagih per kolektor', Tone.warning, (_) => const CollectorSettlementScreen()),
        _Entry(Icons.savings_rounded, 'Top Up Saldo', 'Isi saldo prabayar pelanggan', Tone.success, (_) => const TopupRequestListScreen()),
        _Entry(Icons.account_balance_rounded, 'Keuangan', 'Pemasukan, pengeluaran, saldo', Tone.primary, (_) => const KeuanganScreen()),
        _Entry(Icons.category_rounded, 'Kategori Keuangan', 'Jenis pemasukan & pengeluaran', Tone.primary, _crud(keuanganCategoriesConfig)),
        _Entry(Icons.card_giftcard_rounded, 'Referral', 'Bonus pelanggan yang mengajak', Tone.accent, (_) => const ReferralListScreen()),
        _Entry(Icons.credit_card_rounded, 'Payment Gateway', 'Midtrans, Xendit, Duitku, Tripay, QRIS', Tone.success, (_) => const PaymentGatewayScreen()),
        _Entry(Icons.account_balance_rounded, 'Rekening Bank', 'Tujuan transfer manual', Tone.success, _crud(bankAccountsConfig)),
      ],
    ),
    (
      'Hotspot & Agent',
      [
        _Entry(Icons.confirmation_number_rounded, 'Voucher Hotspot', 'Buat, ubah, hapus, kirim voucher', Tone.primary, _crud(vouchersConfig)),
        _Entry(Icons.wifi_rounded, 'Profil Hotspot', 'Harga, kecepatan, kuota', Tone.accent, _crud(hotspotProfilesConfig)),
        _Entry(Icons.print_rounded, 'Template Voucher', 'Desain cetak voucher', Tone.violet, _crud(voucherTemplatesConfig)),
        _Entry(Icons.shopping_bag_rounded, 'Pesanan E-Voucher', 'Pembelian voucher online', Tone.violet, _crud(evoucherOrdersConfig)),
        _Entry(Icons.storefront_rounded, 'Agent', 'Reseller, saldo, penjualan', Tone.accent, _crud(agentsConfig)),
        _Entry(Icons.account_balance_wallet_rounded, 'Deposit Agent', 'Isi saldo agent via transfer', Tone.success, (_) => const AgentDepositListScreen()),
      ],
    ),
    (
      'Jaringan',
      [
        _Entry(Icons.wifi_tethering_rounded, 'Sesi Online', 'PPPoE dan hotspot yang terhubung', Tone.success, (_) => const SessionListScreen()),
        _Entry(Icons.router_rounded, 'Router / NAS', 'MikroTik, script RADIUS & isolir', Tone.primary, _crud(routersConfig)),
        _Entry(Icons.dns_rounded, 'Status OLT', 'Kondisi OLT & kelola ONU', Tone.accent, (_) => const OltStatusScreen()),
        _Entry(Icons.dns_outlined, 'Data OLT', 'Tambah, ubah, hapus OLT', Tone.accent, _crud(oltsConfig)),
        _Entry(Icons.warning_amber_rounded, 'Alert OLT', 'ONU offline, sinyal lemah, dll', Tone.danger, (_) => const OltAlertScreen()),
        _Entry(Icons.hub_rounded, 'ODC', 'Optical distribution cabinet', Tone.violet, _crud(odcsConfig)),
        _Entry(Icons.device_hub_rounded, 'ODP', 'Optical distribution point', Tone.accent, _crud(odpsConfig)),
        _Entry(Icons.person_pin_circle_rounded, 'Pelanggan per ODP', 'Penempatan port ODP', Tone.success, _crud(customerAssignmentsConfig)),
        _Entry(Icons.merge_type_rounded, 'Joint Closure', 'JC dan sambungannya', Tone.warning, _crud(jointClosuresConfig)),
        _Entry(Icons.inventory_2_rounded, 'OTB', 'Optical terminal box & segmen', Tone.primary, _crud(otbsConfig)),
        _Entry(Icons.cable_rounded, 'Kabel Fiber', 'Kabel, tube, core', Tone.accent, _crud(cablesConfig)),
        _Entry(Icons.grain_rounded, 'Core Fiber', 'Pesan, lepas, tandai rusak', Tone.neutral, _crud(coresConfig)),
        _Entry(Icons.linear_scale_rounded, 'Titik Sambung', 'Splice antar core', Tone.violet, _crud(splicesConfig)),
        _Entry(Icons.storage_rounded, 'Server', 'Server billing / VPS di peta', Tone.neutral, _crud(serversConfig)),
        _Entry(Icons.vpn_lock_rounded, 'VPN Server', 'MikroTik CHR / VPS, L2TP/PPTP/SSTP', Tone.violet, _crud(vpnServersConfig)),
        _Entry(Icons.vpn_key_rounded, 'VPN Client', 'NAS lewat VPN, WireGuard/L2TP', Tone.violet, _crud(vpnClientsConfig)),
        _Entry(Icons.assignment_return_rounded, 'Penarikan ONT', 'Tugas ambil perangkat pelanggan berhenti', Tone.warning, (_) => const OntRemovalScreen()),
      ],
    ),
    (
      'Teknis',
      [
        _Entry(Icons.security_rounded, 'FreeRADIUS', 'Status, restart, konfigurasi, radcheck, log', Tone.accent, (_) => const FreeradiusScreen()),
        _Entry(Icons.settings_remote_rounded, 'GenieACS', 'ONT/CPE: WiFi, WAN, preset, provision', Tone.accent, (_) => const GenieacsScreen()),
        _Entry(Icons.schedule_rounded, 'Jadwal Otomatis', 'Cron job & riwayat eksekusi', Tone.accent, _crud(cronConfig)),
        _Entry(Icons.backup_rounded, 'Backup Database', 'Buat, unduh, pulihkan', Tone.accent, _crud(databaseBackupsConfig)),
        _Entry(Icons.cloud_rounded, 'Cloudflare Tunnel', 'Akses publik tanpa IP publik', Tone.accent, (_) => const CloudflareTunnelScreen()),
        _Entry(Icons.system_update_rounded, 'Sistem & Pembaruan', 'Versi dan update aplikasi server', Tone.accent, (_) => const SystemUpdateScreen()),
        _Entry(Icons.android_rounded, 'Build APK', 'APK admin, pelanggan, teknisi, agent', Tone.accent, (_) => const ApkBuilderScreen()),
      ],
    ),
    (
      'Komunikasi',
      [
        _Entry(Icons.campaign_rounded, 'Broadcast Notifikasi', 'Push ke aplikasi pelanggan', Tone.primary, (_) => const PushBroadcastScreen()),
        _Entry(Icons.chat_rounded, 'Kirim WhatsApp', 'Pesan tunggal atau broadcast', Tone.success, (_) => const _WhatsappSendScreen()),
        _Entry(Icons.hub_rounded, 'Provider WhatsApp', 'Gateway, QR, tes kirim', Tone.success, _crud(whatsappProvidersConfig)),
        _Entry(Icons.text_snippet_rounded, 'Template WhatsApp', 'Isi pesan otomatis', Tone.success, _crud(whatsappTemplatesConfig)),
        _Entry(Icons.alarm_rounded, 'Pengingat & OTP', 'Jadwal pengingat tagihan WhatsApp', Tone.success, _settings(whatsappReminderSettings)),
        _Entry(Icons.history_rounded, 'Riwayat WhatsApp', 'Pesan terkirim & gagal', Tone.success, _crud(whatsappHistoryConfig)),
        _Entry(Icons.mail_rounded, 'Email SMTP', 'Server email & notifikasi', Tone.primary, _settings(emailSettings)),
        _Entry(Icons.drafts_rounded, 'Template Email', 'Isi email otomatis', Tone.primary, _crud(emailTemplatesConfig)),
        _Entry(Icons.outbox_rounded, 'Riwayat Email', 'Email terkirim & gagal', Tone.primary, _crud(emailHistoryConfig)),
        _Entry(Icons.send_rounded, 'Telegram Backup', 'Backup & laporan ke grup Telegram', Tone.accent, _settings(telegramSettings)),
        _Entry(Icons.smart_toy_rounded, 'Bot Telegram', 'Perintah cek pelanggan & redaman', Tone.accent, _settings(telegramBotSettings)),
        _Entry(Icons.notifications_rounded, 'Notifikasi', 'Pemberitahuan sistem untuk admin', Tone.warning, (_) => const NotificationsScreen()),
      ],
    ),
    (
      'Tim',
      [
        _Entry(Icons.groups_rounded, 'Staf & Tim', 'Akun admin dan hak aksesnya', Tone.primary, _crud(staffConfig)),
        _Entry(Icons.badge_rounded, 'Kolektor', 'Penagih lapangan per area', Tone.warning, _crud(collectorsConfig)),
        _Entry(Icons.engineering_rounded, 'Teknisi Lapangan', 'Akun aplikasi teknisi', Tone.accent, _crud(techniciansConfig)),
        _Entry(Icons.history_rounded, 'Log Aktivitas', 'Siapa melakukan apa', Tone.neutral, (_) => const ActivityLogScreen()),
      ],
    ),
    (
      'Pengaturan',
      [
        _Entry(Icons.business_rounded, 'Profil Perusahaan', 'Nama, logo, URL, zona waktu', Tone.neutral, _settings(companySettings)),
        _Entry(Icons.short_text_rounded, 'Footer Portal', 'Teks footer tiap aplikasi', Tone.neutral, _settings(footerSettings)),
        _Entry(Icons.block_rounded, 'Isolir', 'Aturan & jaringan isolir', Tone.warning, _settings(isolationSettings)),
        _Entry(Icons.text_snippet_rounded, 'Template Isolir', 'Pesan & halaman isolir', Tone.warning, _crud(isolationTemplatesConfig)),
        _Entry(Icons.photo_rounded, 'Banner Promo', 'Banner di portal pelanggan', Tone.violet, _crud(promoBannersConfig)),
        _Entry(Icons.card_giftcard_rounded, 'Program Referral', 'Besaran & syarat bonus', Tone.accent, _settings(referralSettings)),
        _Entry(Icons.map_outlined, 'Peta', 'Pusat peta & routing kabel', Tone.neutral, _settings(mapSettings)),
        _Entry(Icons.verified_user_rounded, 'Keamanan Akun (2FA)', 'Verifikasi dua langkah', Tone.success, (_) => const TwoFactorSettingsScreen()),
        _Entry(Icons.settings_rounded, 'Profil & Tampilan', 'Tema, server, keluar', Tone.neutral, (_) => const ProfileScreen()),
      ],
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Lainnya')),
      body: ListView(
        padding: EdgeInsets.fromLTRB(Gap.page, Gap.xs, Gap.page, listBottomPadding(context)),
        children: [
          for (final (title, entries) in _sections) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(2, Gap.lg, 0, Gap.sm),
              child: Text(
                title,
                style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: context.colors.onSurfaceVariant),
              ),
            ),
            Card(
              clipBehavior: Clip.antiAlias,
              child: Column(
                children: [
                  for (var i = 0; i < entries.length; i++) ...[if (i > 0) const Divider(indent: 68), _Row(entry: entries[i])],
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
                  Text(
                    entry.hint,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12, color: context.colors.onSurfaceVariant),
                  ),
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

/// Entry point for the web "Kirim WhatsApp" page: single or broadcast.
class _WhatsappSendScreen extends StatelessWidget {
  const _WhatsappSendScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Kirim WhatsApp')),
      body: ListView(
        padding: const EdgeInsets.all(Gap.page),
        children: [
          EntityTile(
            icon: Icons.person_rounded,
            tone: Tone.success,
            title: 'Pesan ke satu nomor',
            subtitle: 'Kirim cepat ke nomor mana pun',
            onTap: () => sendWhatsappSingle(context),
          ),
          const SizedBox(height: Gap.sm),
          EntityTile(
            icon: Icons.groups_rounded,
            tone: Tone.success,
            title: 'Broadcast ke pelanggan',
            subtitle: 'Pilih dengan filter status, paket, router',
            onTap: () => sendWhatsappBroadcast(context),
          ),
        ],
      ),
    );
  }
}
