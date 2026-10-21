/**
 * In-app guides for the admin panel, in one place.
 *
 * The Panduan button in the top bar shows the guide for the page that is
 * open; /admin/panduan lists the setup order and every guide. A guide
 * matches its path and everything below it (/admin/pppoe/users also covers
 * a customer's detail page); the longest matching path wins.
 */

export interface GuideLink {
  label: string;
  href: string;
}

export interface PageGuide {
  path: string;
  title: string;
  /** Sidebar group the page sits in, used to group the guide hub. */
  section: string;
  /** What the page is for, in a sentence or two. */
  summary: string;
  /** How to use it, in order. */
  steps: string[];
  /** Things that commonly go wrong or are easy to miss. */
  notes?: string[];
  related?: GuideLink[];
}

export interface SetupStep {
  title: string;
  detail: string;
  links: GuideLink[];
}

/** First-time setup, in the order the parts depend on each other. */
export const SETUP_STEPS: SetupStep[] = [
  {
    title: 'Isi profil perusahaan',
    detail:
      'Nama, logo, telepon, Base URL (alamat panel yang dipakai di link bayar dan pesan), zona waktu, dan berapa hari sebelum jatuh tempo tagihan dibuat. Base URL yang salah membuat link pembayaran di WhatsApp tidak bisa dibuka pelanggan.',
    links: [{ label: 'Profil Perusahaan', href: '/admin/settings/company' }],
  },
  {
    title: 'Sambungkan router MikroTik (NAS)',
    detail:
      'Bila router tidak punya IP publik atau berada di jaringan lain, buat VPN dulu. Lalu tambahkan router, klik Test & Simpan, buat RADIUS Script dan tempel di terminal MikroTik. Tanpa langkah ini pelanggan tidak bisa login PPPoE atau hotspot.',
    links: [
      { label: 'VPN Server', href: '/admin/network/vpn-server' },
      { label: 'VPN Client', href: '/admin/network/vpn-client' },
      { label: 'Router / NAS', href: '/admin/network/routers' },
    ],
  },
  {
    title: 'Pastikan FreeRADIUS menjawab',
    detail:
      'Status harus Berjalan. Setelah ada pelanggan, uji login satu username di RadTest. Bila router ditolak, lihat Log Langsung: pesan "unknown client" berarti IP router belum cocok dengan yang terdaftar.',
    links: [
      { label: 'Status FreeRADIUS', href: '/admin/freeradius/status' },
      { label: 'RadTest', href: '/admin/freeradius/radtest' },
    ],
  },
  {
    title: 'Buat area dan paket internet',
    detail:
      'Area mengelompokkan pelanggan (dipakai juga untuk kolektor). Paket PPPoE berisi harga, kecepatan, dan masa berlaku; setiap paket menjadi group di RADIUS.',
    links: [
      { label: 'Area', href: '/admin/pppoe/areas' },
      { label: 'Paket PPPoE', href: '/admin/pppoe/profiles' },
    ],
  },
  {
    title: 'Masukkan pelanggan',
    detail:
      'Tambah satu per satu atau import. Pilih Postpaid bila tagihan jatuh tempo pada tanggal tetap tiap bulan, Prepaid bila masa aktif mengikuti tanggal bayar.',
    links: [{ label: 'Pelanggan PPPoE', href: '/admin/pppoe/users' }],
  },
  {
    title: 'Atur isolir',
    detail:
      'Aktifkan auto isolir, tentukan masa tenggang, IP pool isolir, dan IP server. Lalu salin script di halaman Setup MikroTik ke router, agar pelanggan yang menunggak diarahkan ke halaman bayar.',
    links: [
      { label: 'Pengaturan Isolasi', href: '/admin/settings/isolation' },
      { label: 'Setup MikroTik', href: '/admin/settings/isolation/mikrotik' },
    ],
  },
  {
    title: 'Siapkan cara bayar',
    detail:
      'Aktifkan payment gateway (Midtrans, Xendit, Duitku, Tripay) atau QRIS Mandiri dari rekening sendiri, dan isi rekening bank untuk transfer manual.',
    links: [
      { label: 'Payment Gateway', href: '/admin/payment-gateway' },
      { label: 'Rekening Bank', href: '/admin/payment/bank-accounts' },
    ],
  },
  {
    title: 'Hubungkan WhatsApp dan jadwal pengingat',
    detail:
      'Tambah provider WhatsApp, periksa isi template, lalu atur hari dan jam pengingat tagihan. Email bisa diaktifkan sebagai saluran tambahan.',
    links: [
      { label: 'WhatsApp', href: '/admin/settings/whatsapp' },
      { label: 'Email', href: '/admin/settings/email' },
    ],
  },
  {
    title: 'Hotspot dan agen (bila dipakai)',
    detail: 'Buat profil hotspot dan template cetak, lalu generate voucher. Agen bisa menjual voucher dari saldonya sendiri.',
    links: [
      { label: 'Profil Hotspot', href: '/admin/hotspot/profile' },
      { label: 'Voucher', href: '/admin/hotspot/voucher' },
      { label: 'Agen', href: '/admin/hotspot/agent' },
    ],
  },
  {
    title: 'Tambahkan tim',
    detail:
      'Staf kantor di Admin & Role, teknisi di Kelola Teknisi, kolektor di Kelola Kolektor. Setiap halaman itu menampilkan alamat login portalnya untuk dibagikan.',
    links: [
      { label: 'Admin & Role', href: '/admin/management' },
      { label: 'Kelola Teknisi', href: '/admin/technicians' },
      { label: 'Kelola Kolektor', href: '/admin/collectors' },
    ],
  },
  {
    title: 'Amankan data',
    detail:
      'Aktifkan backup otomatis ke Telegram, buat satu backup database dan backup config FreeRADIUS, lalu aktifkan 2FA untuk akun admin.',
    links: [
      { label: 'Telegram Backup', href: '/admin/settings/telegram' },
      { label: 'Database', href: '/admin/settings/database' },
      { label: 'Backup FreeRADIUS', href: '/admin/freeradius/backup' },
      { label: 'Keamanan (2FA)', href: '/admin/settings/security' },
    ],
  },
  {
    title: 'Periksa jadwal otomatis',
    detail:
      'Tagihan bulanan, pengingat, isolir, dan backup berjalan dari Cron Jobs. Pastikan job yang dipakai dalam keadaan aktif dan riwayatnya tidak berisi error.',
    links: [{ label: 'Cron Jobs', href: '/admin/settings/cron' }],
  },
];

const S = {
  dashboard: 'Dashboard',
  customers: 'Pelanggan & Agen',
  billing: 'Tagihan & Transaksi',
  network: 'Jaringan',
  infra: 'Infrastruktur',
  management: 'Manajemen',
  notify: 'Notifikasi',
};

export const GUIDES: PageGuide[] = [
  // Dashboard
  {
    path: '/admin',
    title: 'Dashboard',
    section: S.dashboard,
    summary: 'Ringkasan bulan berjalan: jumlah pelanggan per status, sesi online, pendapatan invoice dan voucher, tagihan yang mendekati jatuh tempo, dan penjualan agen.',
    steps: [
      'Pakai tombol bulan di kanan atas untuk melihat angka bulan lain.',
      'Klik kartu angka untuk membuka daftar di baliknya, misalnya Pelanggan Diisolir atau Belum Bayar.',
      'Daftar Tagihan Jatuh Tempo adalah tagihan yang perlu ditagih minggu ini.',
    ],
    notes: ['Angka pendapatan hanya menghitung tagihan dan voucher yang sudah lunas pada bulan yang dipilih.'],
  },

  // Pelanggan & Agen
  {
    path: '/admin/pppoe/users',
    title: 'Pelanggan PPPoE',
    section: S.customers,
    summary: 'Daftar pelanggan internet rumah. Setiap pelanggan adalah akun PPPoE di RADIUS dengan paket, area, tanggal tagihan, dan status (aktif, isolir, stop).',
    steps: [
      'Klik Tambah Pengguna, isi username dan password PPPoE yang sama dengan yang dipasang di ONT/router pelanggan.',
      'Pilih paket dan area. Isi nomor WhatsApp agar tagihan dan pengingat terkirim.',
      'Pilih tipe langganan: Postpaid (jatuh tempo tanggal tetap tiap bulan) atau Prepaid (masa aktif bertambah sejak tanggal bayar).',
      'Isi lokasi GPS bila ingin pelanggan tampil di peta jaringan.',
      'Dari menu aksi di daftar: ubah data dan paket, atau perpanjang langganan secara manual.',
      'Klik nama pelanggan untuk membuka detailnya: tagihan, add-on, janji bayar, dan foto.',
    ],
    notes: [
      'Mengubah username atau password di sini langsung berlaku di RADIUS; pelanggan perlu reconnect.',
      'Tanggal Isolir boleh dikosongkan, sistem menghitungnya dari tanggal tagihan dan masa tenggang.',
    ],
    related: [
      { label: 'Paket PPPoE', href: '/admin/pppoe/profiles' },
      { label: 'Sesi PPPoE', href: '/admin/sessions/pppoe' },
      { label: 'Tagihan', href: '/admin/invoices' },
    ],
  },
  {
    path: '/admin/pppoe/profiles',
    title: 'Paket PPPoE',
    section: S.customers,
    summary: 'Paket internet yang dijual: harga, kecepatan, masa berlaku, dan group RADIUS yang memberi batas kecepatan ke router.',
    steps: [
      'Klik Tambah Paket PPPoE. Isi nama, harga jual, kecepatan upload/download, dan masa berlaku.',
      'Harga modal, fee, dan PPN bersifat opsional, dipakai untuk menghitung harga akhir dan laporan.',
      'Simpan. Kolom RADIUS harus Tersinkron; bila Tertunda, klik Sync.',
      'Klik Sync ke MikroTik bila router memakai profile PPP lokal juga.',
    ],
    notes: ['Paket yang masih dipakai pelanggan tidak bisa dihapus. Pindahkan pelanggannya dulu.'],
    related: [{ label: 'Pelanggan PPPoE', href: '/admin/pppoe/users' }, { label: 'IP Pool', href: '/admin/ippool' }],
  },
  {
    path: '/admin/pppoe/areas',
    title: 'Area',
    section: S.customers,
    summary: 'Wilayah layanan (RT, perumahan, desa) untuk mengelompokkan pelanggan, menyaring laporan, dan membagi tugas kolektor.',
    steps: ['Klik Tambah Area dan beri nama yang dikenali tim lapangan.', 'Pilih area saat menambah pelanggan.', 'Tugaskan area ke kolektor di Kelola Kolektor.'],
    notes: ['Area hanya bisa dihapus bila tidak ada pelanggan di dalamnya.'],
    related: [{ label: 'Kelola Kolektor', href: '/admin/collectors' }],
  },
  {
    path: '/admin/pppoe/addons',
    title: 'Layanan Tambahan',
    section: S.customers,
    summary: 'Biaya di luar paket, misalnya sewa STB, IPTV, atau IP publik, yang ikut masuk ke tagihan pelanggan.',
    steps: [
      'Klik Tambah Addon, isi nama dan harga.',
      'Pilih Bulanan bila ditagih setiap bulan, Sekali bayar bila hanya sekali.',
      'Pasang addon ke pelanggan dari tab Add-ons di detail pelanggan.',
    ],
  },
  {
    path: '/admin/pppoe/approvals',
    title: 'Persetujuan Pendaftaran Teknisi',
    section: S.customers,
    summary: 'Pelanggan yang didaftarkan teknisi dari lapangan menunggu dicek di sini sebelum akunnya aktif.',
    steps: ['Periksa data, foto KTP, dan lokasi GPS.', 'Klik Setujui untuk mengaktifkan akun, atau Tolak dengan alasan yang jelas agar teknisi bisa memperbaiki.'],
    related: [{ label: 'Kelola Teknisi', href: '/admin/technicians' }],
  },
  {
    path: '/admin/pppoe/registrations',
    title: 'Pendaftaran Online',
    section: S.customers,
    summary: 'Calon pelanggan yang mendaftar sendiri dari halaman daftar. Alurnya: Tertunda, Disetujui, lalu Terinstal.',
    steps: [
      'Hubungi calon pelanggan dan cek lokasinya di peta.',
      'Klik Terima Pendaftaran: tentukan biaya instalasi, sistem membuat akun PPPoE.',
      'Setelah teknisi memasang, klik Tandai Sudah Terpasang. Invoice instalasi dibuat dan dikirim.',
    ],
  },
  {
    path: '/admin/suspend-requests',
    title: 'Permintaan Suspend',
    section: S.customers,
    summary: 'Pelanggan bisa minta cuti langganan sementara (misalnya mudik). Permintaan masuk ke sini untuk disetujui.',
    steps: [
      'Cek periode dan alasan yang diajukan.',
      'Setujui: status pelanggan menjadi stop pada tanggal mulai dan aktif kembali otomatis pada tanggal selesai.',
      'Tolak dengan catatan bila tidak bisa dipenuhi.',
    ],
  },
  {
    path: '/admin/hotspot/voucher',
    title: 'Voucher Hotspot',
    section: S.customers,
    summary: 'Membuat, mencetak, mengirim, dan memantau voucher hotspot per batch.',
    steps: [
      'Pilih profil hotspot dan jumlah voucher, atur format kode, lalu Generate.',
      'Saring per batch, lalu cetak dengan template (PDF atau kartu) atau export Excel.',
      'Kirim voucher ke pembeli lewat WhatsApp dari menu aksi.',
      'Voucher yang sudah dipakai dan kedaluwarsa terlihat dari statusnya.',
    ],
    notes: ['Generate massal sampai 25.000 voucher bisa memakan waktu; jangan tutup halaman sampai selesai.'],
    related: [
      { label: 'Profil Hotspot', href: '/admin/hotspot/profile' },
      { label: 'Template Voucher', href: '/admin/hotspot/template' },
    ],
  },
  {
    path: '/admin/hotspot/profile',
    title: 'Profil Hotspot',
    section: S.customers,
    summary: 'Jenis voucher yang dijual: kecepatan, masa berlaku atau durasi, kuota, harga modal, harga jual, dan fee agen.',
    steps: [
      'Klik Tambah Profil, beri nama yang mudah dibaca, misalnya 3Jam-5M.',
      'Isi kecepatan, masa berlaku, dan harga. Fee reseller adalah bagian agen dari setiap penjualan.',
      'Klik Sync ke Router bila router memakai user profile hotspot lokal.',
    ],
  },
  {
    path: '/admin/hotspot/template',
    title: 'Template Voucher',
    section: S.customers,
    summary: 'Desain cetak voucher. Ada model bawaan (termasuk 50 dan 60 voucher per A4) dan template HTML sendiri.',
    steps: [
      'Klik Tambah Template, pilih model bawaan atau tempel HTML sendiri.',
      'Atur warna bila model mendukungnya, lalu lihat Preview.',
      'Tandai satu template sebagai Default untuk cetak cepat.',
    ],
  },
  {
    path: '/admin/hotspot/evoucher',
    title: 'Pesanan E-Voucher',
    section: S.customers,
    summary: 'Pembelian voucher online oleh pelanggan umum. Voucher dikirim otomatis lewat WhatsApp atau email setelah lunas.',
    steps: [
      'Pantau pesanan yang Tertunda; link bayarnya berlaku 24 jam.',
      'Kirim Ulang Voucher bila pembeli belum menerima kodenya.',
      'Batalkan pesanan yang tidak akan dibayar.',
    ],
    related: [{ label: 'Payment Gateway', href: '/admin/payment-gateway' }],
  },
  {
    path: '/admin/hotspot/agent',
    title: 'Daftar Agen',
    section: S.customers,
    summary: 'Reseller voucher. Agen login di portal /agent, membeli voucher dari saldonya, dan menjualnya kembali.',
    steps: [
      'Klik Tambah Agen: isi nama, telepon, dan router tempat voucher agen dipakai.',
      'Isi saldo agen lewat Sesuaikan Saldo, atau setujui deposit yang diajukan agen.',
      'Lihat stok voucher dan riwayat penjualan tiap agen.',
    ],
    related: [
      { label: 'Deposit Agen', href: '/admin/hotspot/agent/deposits' },
      { label: 'Laporan Agen', href: '/admin/hotspot/agent-report' },
    ],
  },
  {
    path: '/admin/hotspot/agent-report',
    title: 'Laporan Agen',
    section: S.customers,
    summary: 'Penjualan voucher per agen, harian atau bulanan: stok, terjual, pendapatan, komisi agen, dan bagian admin.',
    steps: ['Pilih jenis laporan, periode, dan agen.', 'Klik Generate, lalu buka Detail untuk rincian per paket.'],
  },
  {
    path: '/admin/topup-requests',
    title: 'Permintaan Top-Up Agen',
    section: S.customers,
    summary: 'Permintaan isi saldo dari agen beserta bukti transfernya.',
    steps: ['Buka bukti transfer dan cocokkan dengan mutasi rekening.', 'Setujui untuk menambah saldo agen, atau Tolak bila tidak sesuai.'],
  },
  {
    path: '/admin/isolated-users',
    title: 'Pelanggan Terisolir',
    section: S.customers,
    summary: 'Pelanggan yang sedang diisolir karena menunggak, lengkap dengan tunggakan dan status koneksinya.',
    steps: [
      'Salin atau buka link bayar pelanggan, lalu kirim lewat WhatsApp dengan tombol Kirim WA.',
      'Lihat daftar invoice yang belum dibayar per pelanggan.',
      'Begitu tagihan lunas, isolir dibuka otomatis.',
    ],
    related: [{ label: 'Pengaturan Isolasi', href: '/admin/settings/isolation' }],
  },
  {
    path: '/admin/ont-removal-tasks',
    title: 'Tugas Cabut ONT',
    section: S.customers,
    summary: 'Tugas untuk teknisi mengambil perangkat dari pelanggan terisolir yang berhenti berlangganan.',
    steps: ['Klik Buat Tugas, pilih pelanggan terisolir dan teknisinya.', 'Teknisi melihat tugas di portal atau aplikasinya dan menandai Selesai setelah perangkat diambil.'],
  },
  {
    path: '/admin/settings/isolation',
    title: 'Pengaturan Isolasi',
    section: S.customers,
    summary: 'Aturan isolir otomatis: kapan pelanggan diisolir, dan apa yang masih bisa dibuka saat terisolir.',
    steps: [
      'Aktifkan Auto Isolasi. Pemeriksaan berjalan setiap jam.',
      'Isi masa tenggang dalam hari. Prepaid diisolir setelah masa aktif habis ditambah masa tenggang; Postpaid setelah tagihannya lewat jatuh tempo ditambah masa tenggang.',
      'Isi IP pool isolir (format CIDR) dan IP server billing (harus IP, bukan nama domain).',
      'Lanjutkan ke Setup MikroTik untuk memasang script di router.',
    ],
    notes: ['Izinkan DNS dan Akses Payment harus aktif agar pelanggan terisolir tetap bisa membuka halaman bayar.'],
    related: [
      { label: 'Setup MikroTik', href: '/admin/settings/isolation/mikrotik' },
      { label: 'Template Isolasi', href: '/admin/settings/isolation/templates' },
    ],
  },
  {
    path: '/admin/settings/isolation/mikrotik',
    title: 'Setup MikroTik Isolir',
    section: S.customers,
    summary: 'Script MikroTik yang dibuat dari pengaturan isolasi Anda: IP pool, PPP profile, firewall, dan NAT redirect ke halaman bayar.',
    steps: [
      'Pastikan IP Server di Pengaturan Isolasi sudah berupa alamat IP.',
      'Klik Download Complete Script atau Copy All Scripts.',
      'Tempel di terminal MikroTik setiap router NAS.',
    ],
    notes: ['Bila pengaturan isolasi diubah, pasang ulang script ini di router.'],
  },
  {
    path: '/admin/referrals',
    title: 'Daftar Referral',
    section: S.customers,
    summary: 'Pelanggan yang mengajak pelanggan baru dan reward saldo yang menjadi haknya.',
    steps: ['Reward Pending menunggu syaratnya terpenuhi (sesuai Pengaturan Referral).', 'Klik Kreditkan untuk memasukkan saldo secara manual, atau Kadaluarkan bila tidak berlaku.'],
    related: [{ label: 'Pengaturan Referral', href: '/admin/settings/referral' }],
  },
  {
    path: '/admin/settings/referral',
    title: 'Pengaturan Referral',
    section: S.customers,
    summary: 'Program Ajak Teman: besar bonus untuk pengajak dan kapan bonus diberikan.',
    steps: ['Aktifkan sistem referral.', 'Pilih kapan reward diberikan: setelah pembayaran pertama (disarankan) atau saat registrasi.', 'Isi nominal bonus, lalu simpan.'],
  },

  // Tagihan & Transaksi
  {
    path: '/admin/invoices',
    title: 'Tagihan',
    section: S.billing,
    summary: 'Semua invoice pelanggan. Tagihan bulanan dibuat otomatis setiap pagi untuk pelanggan yang jatuh temponya masuk rentang hari di Profil Perusahaan (bawaan 7 hari).',
    steps: [
      'Saring per status: Belum Bayar, Jatuh Tempo, Lunas.',
      'Kirim pengingat satu pelanggan lewat WhatsApp, atau pilih beberapa invoice lalu Broadcast Tagihan.',
      'Salin link bayar untuk dikirim manual.',
      'Klik Tandai Lunas untuk pembayaran tunai di kantor.',
      'Cetak invoice atau export ke Excel/PDF.',
    ],
    notes: [
      'Pembayaran lewat payment gateway dan QRIS Mandiri melunasi invoice otomatis; tidak perlu ditandai manual.',
      'Pengingat otomatis diatur di WhatsApp > Pengaturan Reminder.',
    ],
    related: [
      { label: 'Pengaturan Reminder', href: '/admin/settings/whatsapp?tab=notifications' },
      { label: 'Profil Perusahaan', href: '/admin/settings/company' },
    ],
  },
  {
    path: '/admin/payment-gateway',
    title: 'Payment Gateway',
    section: S.billing,
    summary: 'Cara bayar online untuk tagihan, perpanjangan, top-up, dan voucher: Midtrans, Xendit, Duitku, Tripay, dan QRIS Mandiri.',
    steps: [
      'Salin Webhook URL dan pasang di dashboard gateway, agar pembayaran tercatat otomatis.',
      'Buka tab gateway, isi key dari akun gateway, pilih Sandbox untuk uji atau Production untuk transaksi nyata, lalu aktifkan.',
      'QRIS Mandiri memakai QRIS rekening Anda sendiri tanpa biaya admin. Pembayaran dikonfirmasi oleh Kasir QRIS di aplikasi admin Android yang membaca notifikasi DANA atau bank.',
      'Pantau Webhook Logs untuk memastikan notifikasi dari gateway diterima.',
    ],
    notes: [
      'Bila pembayaran berhasil di gateway tetapi invoice belum lunas, cek Webhook Logs: biasanya Webhook URL belum terpasang atau key salah.',
      'Gunakan Simulasi Pembayaran QRIS untuk menguji alur tanpa HP Android.',
    ],
  },
  {
    path: '/admin/manual-payments',
    title: 'Pembayaran Manual',
    section: S.billing,
    summary: 'Konfirmasi transfer bank dari pelanggan beserta bukti transfernya.',
    steps: [
      'Buka Lihat Detail, cocokkan nominal dan nama pengirim dengan mutasi rekening.',
      'Setujui: invoice menjadi lunas dan pelanggan menerima pemberitahuan.',
      'Tolak dengan alasan bila bukti tidak sesuai.',
    ],
    related: [{ label: 'Rekening Bank', href: '/admin/payment/bank-accounts' }],
  },
  {
    path: '/admin/payment/bank-accounts',
    title: 'Rekening Bank',
    section: S.billing,
    summary: 'Rekening tujuan transfer yang ditampilkan di halaman pembayaran manual pelanggan.',
    steps: ['Klik Tambah Rekening, isi bank, nomor, dan nama pemilik persis seperti di buku tabungan.', 'Simpan Pengaturan.'],
  },
  {
    path: '/admin/keuangan',
    title: 'Transaksi',
    section: S.billing,
    summary: 'Buku kas: pemasukan otomatis dari tagihan dan voucher, ditambah pemasukan dan pengeluaran yang dicatat manual.',
    steps: [
      'Pilih periode (bulan ini, bulan lalu, tahun ini) untuk melihat pendapatan, pengeluaran, dan saldo.',
      'Klik Tambah Transaksi untuk mencatat pemasukan lain atau pengeluaran.',
      'Atur kategori di tab Kategori, lalu export ke Excel atau PDF.',
    ],
    related: [{ label: 'Biaya Operasional', href: '/admin/keuangan/pengeluaran' }],
  },
  {
    path: '/admin/keuangan/pengeluaran',
    title: 'Biaya Operasional',
    section: S.billing,
    summary: 'Pengeluaran rutin yang dibayar dari pendapatan: bandwidth, gaji, alat, sewa, dan lainnya, dibandingkan dengan pendapatan bulan itu.',
    steps: [
      'Bila belum ada kategori, klik Pasang kategori bawaan.',
      'Klik Catat biaya untuk setiap pembayaran, isi kategori, jumlah, tanggal, dan keterangan.',
      'Lihat sisa pendapatan setelah biaya dan perbandingannya dengan bulan lalu.',
    ],
  },
  {
    path: '/admin/hotspot/agent/deposits',
    title: 'Deposit Agen',
    section: S.billing,
    summary: 'Transfer deposit saldo dari agen yang perlu diverifikasi.',
    steps: ['Lihat bukti transfer dan rekening tujuannya.', 'Setujui untuk menambah saldo agen, atau Tolak.'],
  },
  {
    path: '/admin/hotspot/rekap-voucher',
    title: 'Rekap Voucher',
    section: S.billing,
    summary: 'Rekap per batch voucher: jumlah, stok, terjual, kedaluwarsa, pendapatan, bagian admin, dan profit agen.',
    steps: ['Saring per agen atau profil.', 'Lihat rincian per hari dan pendapatan per agen, lalu Export bila perlu.'],
  },
  {
    path: '/admin/collector-settlements',
    title: 'Setoran Kolektor',
    section: S.billing,
    summary: 'Uang yang ditagih kolektor di lapangan per hari, untuk dicocokkan dengan setoran yang diterima.',
    steps: ['Pilih tanggal dan kolektor.', 'Cocokkan total tunai dan transfer dengan uang yang disetor.', 'Konfirmasi setoran; Batal Konfirmasi bila ternyata keliru.'],
    related: [{ label: 'Bukti Transfer Kolektor', href: '/admin/payment-proofs' }],
  },
  {
    path: '/admin/payment-proofs',
    title: 'Verifikasi Bukti Transfer',
    section: S.billing,
    summary: 'Bukti transfer yang diunggah kolektor saat pelanggan membayar lewat transfer.',
    steps: ['Buka bukti, cocokkan nominal dan invoicenya.', 'Setujui, atau Tolak dengan alasan (misalnya bukti tidak jelas atau nominal tidak sesuai).'],
  },
  {
    path: '/admin/laporan',
    title: 'Laporan & Export',
    section: S.billing,
    summary: 'Laporan invoice, pembayaran, pelanggan, dan pendapatan per paket, siap diekspor ke Excel atau PDF.',
    steps: ['Pilih jenis laporan, rentang tanggal, dan status.', 'Klik Tampilkan Data untuk melihat ringkasan.', 'Klik Export Excel atau Export PDF.'],
  },

  // Jaringan
  {
    path: '/admin/sessions/pppoe',
    title: 'Sesi PPPoE',
    section: S.network,
    summary: 'Pelanggan PPPoE yang sedang online: IP, MAC, router, waktu mulai, dan uptime.',
    steps: [
      'Klik Sinkron Ulang bila daftar terasa tidak cocok dengan router.',
      'Pilih sesi lalu Kick User untuk memutus koneksi; pelanggan akan login ulang dengan pengaturan terbaru.',
    ],
    notes: ['Pelanggan yang tidak muncul di sini berarti belum login. Cek kabel/ONT, lalu uji username-nya di RadTest.'],
    related: [{ label: 'RadTest', href: '/admin/freeradius/radtest' }],
  },
  {
    path: '/admin/sessions/hotspot',
    title: 'Sesi Hotspot',
    section: S.network,
    summary: 'Voucher hotspot yang sedang terhubung, per router dan agen.',
    steps: ['Saring per router.', 'Pilih sesi lalu Putuskan untuk memaksa keluar.'],
  },
  {
    path: '/admin/network/routers',
    title: 'Router / NAS',
    section: S.network,
    summary: 'Router MikroTik yang melayani login PPPoE dan hotspot. Setiap router harus terdaftar di sini agar FreeRADIUS mau menjawabnya.',
    steps: [
      'Bila router tidak punya IP publik, sambungkan VPN dulu (VPN Server atau VPN Client).',
      'Klik Tambah Router: isi IP (IP VPN bila lewat VPN), username dan password API MikroTik, dan secret RADIUS.',
      'Klik Test & Simpan; router harus bisa dihubungi.',
      'Klik RADIUS Script, pilih versi RouterOS, salin, dan tempel di terminal MikroTik.',
    ],
    notes: [
      'Error "unknown client" di log FreeRADIUS berarti IP yang dikirim router tidak sama dengan IP yang terdaftar di sini.',
      'Router yang ditambah langsung ke database tidak dikenali; hapus lalu tambah ulang dari halaman ini.',
    ],
    related: [
      { label: 'VPN Client', href: '/admin/network/vpn-client' },
      { label: 'Log FreeRADIUS', href: '/admin/freeradius/logs' },
    ],
  },
  {
    path: '/admin/network/vpn-server',
    title: 'VPN Server',
    section: S.network,
    summary: 'Server VPN (MikroTik CHR atau VPS) tempat router pelanggan tersambung bila tidak punya IP publik. Mendukung L2TP, SSTP, PPTP, dan WireGuard.',
    steps: [
      'Tambahkan server: host, username, dan password API atau SSH, lalu uji koneksi.',
      'Jalankan setup otomatis untuk mengaktifkan protokol VPN di server.',
      'Untuk WireGuard di VPS ini, tambah peer per router NAS.',
    ],
    notes: ['RouterOS 6 tidak mendukung WireGuard; pakai L2TP atau SSTP.'],
    related: [{ label: 'VPN Client', href: '/admin/network/vpn-client' }],
  },
  {
    path: '/admin/network/vpn-client',
    title: 'VPN Client',
    section: S.network,
    summary: 'Akun VPN untuk setiap router NAS, agar router di balik NAT bisa dijangkau billing dan FreeRADIUS.',
    steps: [
      'Pastikan VPN Server sudah siap.',
      'Klik Tambah VPN Client, pilih protokol. Simpan kredensial yang ditampilkan.',
      'Salin script dan tempel di router NAS.',
      'Pakai IP VPN client itu saat menambah router di Router / NAS.',
    ],
  },
  {
    path: '/admin/network/olts',
    title: 'Data OLT',
    section: S.network,
    summary: 'Daftar OLT (ZTE, Huawei, FiberHome, Hioso, BDCOM, Raisecom, dan generik) beserta akses SNMP/Telnet untuk pemantauan ONU.',
    steps: [
      'Klik Tambah OLT, pilih model yang sesuai, isi IP, community SNMP, dan akses Telnet bila diminta.',
      'Isi koordinat agar OLT tampil di peta.',
      'Hubungkan OLT ke router uplink-nya bila dipakai untuk ping dan peta jalur.',
    ],
    related: [{ label: 'Monitoring OLT', href: '/admin/olt/monitoring' }],
  },
  {
    path: '/admin/olt/monitoring',
    title: 'Monitoring OLT',
    section: S.network,
    summary: 'Kondisi setiap OLT: ONU online dan offline, suhu, CPU, memori, uptime, dan alert aktif.',
    steps: ['Klik Poll Semua untuk mengambil data terbaru, atau Poll Manual per OLT.', 'Buka Detail untuk daftar ONU dan sinyalnya.'],
    notes: ['Data diperbarui otomatis oleh job OLT Poll setiap 5 menit.'],
  },
  {
    path: '/admin/olt/alerts',
    title: 'Alert OLT',
    section: S.network,
    summary: 'Kejadian di jaringan optik: OLT offline, suhu tinggi, ONU offline, sinyal lemah, dying gasp (listrik pelanggan padam), dan ONU tidak sah.',
    steps: ['Saring per tingkat (critical, warning, info) dan jenis.', 'Tandai Selesai setelah masalah ditangani.'],
  },
  {
    path: '/admin/genieacs/devices',
    title: 'Perangkat GenieACS',
    section: S.network,
    summary: 'ONT/router pelanggan yang terhubung ke GenieACS (TR-069): status, sinyal, WiFi, dan WAN.',
    steps: [
      'Cari perangkat dengan nomor seri atau username PPPoE.',
      'Buka detail untuk ganti SSID dan password WiFi, reboot, atau refresh parameter.',
    ],
    notes: ['Perintah dikirim saat perangkat berkomunikasi dengan GenieACS; perangkat offline baru menjalankannya saat online.'],
    related: [
      { label: 'Pengaturan GenieACS', href: '/admin/genieacs/settings' },
      { label: 'Panduan GenieACS lengkap', href: '/admin/genieacs/guide' },
    ],
  },
  {
    path: '/admin/genieacs/tasks',
    title: 'Task GenieACS',
    section: S.network,
    summary: 'Antrian perintah TR-069 ke perangkat: menunggu, selesai, atau gagal.',
    steps: ['Task gagal bisa di-retry atau dihapus.', 'Aktifkan auto-refresh untuk memantau task yang sedang berjalan.'],
    related: [{ label: 'Panduan GenieACS', href: '/admin/genieacs/guide' }],
  },
  {
    path: '/admin/genieacs/virtual-parameters',
    title: 'Virtual Parameters',
    section: S.network,
    summary: 'Parameter buatan sendiri yang dihitung dari data perangkat, misalnya redaman (RX power) atau username PPPoE, agar seragam di semua merek ONT.',
    steps: ['Tambah parameter dengan nama, path, dan ekspresi.', 'Pakai di Parameter Config untuk ditampilkan di daftar perangkat.'],
    notes: ['Nama virtual parameter peka huruf besar-kecil.'],
    related: [{ label: 'Panduan GenieACS', href: '/admin/genieacs/guide' }],
  },
  {
    path: '/admin/genieacs/parameter-config',
    title: 'Konfigurasi Tampilan Parameter',
    section: S.network,
    summary: 'Memilih parameter yang tampil di daftar dan detail perangkat, beserta urutannya.',
    steps: ['Atur label dan path parameter.', 'Seret untuk mengubah urutan, lalu Simpan Urutan.'],
    related: [{ label: 'Panduan GenieACS', href: '/admin/genieacs/guide' }],
  },
  {
    path: '/admin/genieacs/presets',
    title: 'Presets GenieACS',
    section: S.network,
    summary: 'Aturan kapan provision dijalankan ke perangkat (channel, bobot, dan prasyarat).',
    steps: ['Buat preset dalam format JSON. Field _id wajib.', 'Backup sebelum mengubah preset yang sudah dipakai.'],
    related: [{ label: 'Panduan GenieACS', href: '/admin/genieacs/guide' }],
  },
  {
    path: '/admin/genieacs/vp-scripts',
    title: 'VP Scripts',
    section: S.network,
    summary: 'Script virtual parameter yang disimpan di database lalu disinkron ke GenieACS.',
    steps: ['Cara tercepat: buka detail perangkat, pilih parameter, klik Generate VP.', 'Klik Sync All ke GenieACS setelah mengubah script.'],
    related: [{ label: 'Panduan GenieACS', href: '/admin/genieacs/guide' }],
  },
  {
    path: '/admin/genieacs/provisions',
    title: 'Provisions GenieACS',
    section: S.network,
    summary: 'Script yang dijalankan GenieACS ke perangkat saat preset terpenuhi.',
    steps: ['Buat provision dengan ID dan script JavaScript.', 'Hubungkan ke preset agar dijalankan.'],
    related: [{ label: 'Panduan GenieACS', href: '/admin/genieacs/guide' }],
  },
  {
    path: '/admin/genieacs/faults',
    title: 'Faults GenieACS',
    section: S.network,
    summary: 'Kegagalan provisioning per perangkat, untuk mencari perangkat yang tidak menerima perintah.',
    steps: ['Saring per device ID.', 'Hapus fault setelah penyebabnya diperbaiki agar perangkat dicoba lagi.'],
    related: [{ label: 'Panduan GenieACS', href: '/admin/genieacs/guide' }],
  },
  {
    path: '/admin/genieacs/config',
    title: 'Config GenieACS',
    section: S.network,
    summary: 'Pengaturan runtime server GenieACS (key dan value), misalnya cwmp.realm.',
    steps: ['Ubah hanya bila tahu efeknya; kesalahan di sini memengaruhi semua perangkat.'],
    related: [{ label: 'Panduan GenieACS', href: '/admin/genieacs/guide' }],
  },
  {
    path: '/admin/genieacs/auto-provision',
    title: 'Auto-Provision',
    section: S.network,
    summary: 'Parameter yang diatur otomatis ke setiap perangkat saat melapor ke GenieACS, misalnya interval inform.',
    steps: ['Tambah parameter dan nilainya.', 'Script tambahan bersifat opsional dan ditambahkan di akhir provision.'],
    related: [{ label: 'Panduan GenieACS', href: '/admin/genieacs/guide' }],
  },
  {
    path: '/admin/genieacs/settings',
    title: 'Pengaturan GenieACS',
    section: S.network,
    summary: 'Koneksi panel ke server GenieACS lewat NBI API (port bawaan 7557).',
    steps: ['Isi URL server lengkap dengan port NBI, username, dan password.', 'Klik uji koneksi; bila berhasil, jumlah device terdaftar tampil.', 'Aktifkan lalu simpan.'],
    notes: ['Jangan buka port NBI ke internet tanpa pembatasan; lihat panduan keamanan NBI di halaman ini.'],
    related: [{ label: 'Panduan GenieACS', href: '/admin/genieacs/guide' }],
  },
  {
    path: '/admin/genieacs/guide',
    title: 'Panduan GenieACS',
    section: S.network,
    summary: 'Panduan lengkap GenieACS: setup server, konfigurasi ONT, WiFi, task, virtual parameter, dan troubleshooting.',
    steps: ['Mulai dari Overview dan Setup GenieACS, lalu baca bagian yang dibutuhkan.'],
  },
  {
    path: '/admin/freeradius/status',
    title: 'Status FreeRADIUS',
    section: S.network,
    summary: 'Kondisi layanan FreeRADIUS yang memeriksa login PPPoE dan hotspot: berjalan atau berhenti, uptime, dan jumlah permintaan.',
    steps: ['Pastikan status Berjalan.', 'Restart hanya bila diperlukan, misalnya setelah mengubah konfigurasi.'],
    notes: ['Menghentikan layanan membuat login baru gagal; sesi yang sudah online tetap jalan.'],
  },
  {
    path: '/admin/freeradius/config',
    title: 'Editor Konfigurasi FreeRADIUS',
    section: S.network,
    summary: 'Mengedit file konfigurasi FreeRADIUS langsung dari panel.',
    steps: ['Buat backup config dulu di menu Backup FreeRADIUS.', 'Pilih file, ubah, Simpan Perubahan (sintaks diperiksa), lalu restart layanan.'],
    notes: ['Kesalahan di sini bisa membuat semua pelanggan gagal login. Ubah hanya bila paham FreeRADIUS.'],
    related: [{ label: 'Backup FreeRADIUS', href: '/admin/freeradius/backup' }],
  },
  {
    path: '/admin/freeradius/radtest',
    title: 'RadTest',
    section: S.network,
    summary: 'Menguji login satu username ke RADIUS tanpa router, untuk memastikan masalah ada di akun atau di jaringan.',
    steps: ['Isi username dan password pelanggan, IP NAS, dan shared secret.', 'Jalankan. Access-Accept berarti akun benar; Access-Reject berarti username, password, atau status akun bermasalah.'],
  },
  {
    path: '/admin/freeradius/radcheck',
    title: 'RadCheck',
    section: S.network,
    summary: 'Atribut autentikasi mentah per username di tabel RADIUS.',
    steps: ['Cari username untuk melihat atributnya.', 'Ubah lewat halaman pelanggan bila bisa; edit di sini hanya untuk kasus khusus.'],
  },
  {
    path: '/admin/freeradius/logs',
    title: 'Log FreeRADIUS',
    section: S.network,
    summary: 'Log FreeRADIUS secara langsung, untuk melihat penyebab login ditolak.',
    steps: ['Cari username atau IP router.', '"unknown client" berarti router belum terdaftar atau IP-nya tidak cocok.'],
    related: [{ label: 'Router / NAS', href: '/admin/network/routers' }],
  },
  {
    path: '/admin/freeradius/auth-log',
    title: 'Log Autentikasi',
    section: S.network,
    summary: 'Riwayat login diterima (Access-Accept) dan ditolak (Access-Reject) per username, untuk login yang diperiksa FreeRADIUS.',
    steps: [
      'Cari username pelanggan yang mengeluh tidak bisa konek.',
      'Banyak Reject biasanya berarti password di ONT berbeda dengan di billing, atau username belum ada di billing.',
    ],
    notes: [
      'Voucher hotspot dan PPPoE yang diautentikasi langsung oleh MikroTik (user hotspot atau secret PPP lokal di router) tidak tercatat di sini. Sesinya tetap terlihat di menu Sesi.',
      'Log lebih tua dari 30 hari dihapus otomatis oleh job RADIUS Auth Log Cleanup.',
    ],
  },
  {
    path: '/admin/freeradius/backup',
    title: 'Backup FreeRADIUS',
    section: S.network,
    summary: 'Arsip config FreeRADIUS untuk dipulihkan atau dipindah ke VPS lain. Hanya Super Admin.',
    steps: [
      'Klik Buat Backup sebelum mengubah konfigurasi.',
      'Restore memulihkan file konfigurasi Salfanet. Config saat ini disimpan dulu, hasilnya diperiksa, dan config lama dikembalikan bila ditolak FreeRADIUS.',
      'Untuk pindah server: unduh arsip dari VPS lama, lalu Upload & Restore di VPS baru.',
    ],
    notes: ['Saat restore, login database dan alamat API server ini tetap dipakai, bukan milik VPS asal.'],
  },
  {
    path: '/admin/ippool',
    title: 'IP Pool',
    section: S.network,
    summary: 'Pool alamat IP yang dibagikan RADIUS, dan pemetaannya ke group (paket) agar tiap paket mendapat rentang IP sendiri.',
    steps: ['Klik Create Pool dan isi rentang IP.', 'Klik Map Group untuk menghubungkan pool ke group paket.'],
    notes: ['Tidak wajib bila IP pelanggan sudah diatur oleh pool di MikroTik.'],
  },

  // Infrastruktur
  {
    path: '/admin/network/unified-map',
    title: 'Peta Terpadu',
    section: S.infra,
    summary: 'Semua perangkat jaringan dan pelanggan berkoordinat dalam satu peta, dengan garis sambungan antar perangkat.',
    steps: [
      'Pakai Filter untuk memilih jenis perangkat dan status.',
      'Mode tambah: klik lokasi di peta untuk menaruh perangkat baru.',
      'Mode hubungkan: klik perangkat sumber lalu tujuan untuk membuat garis sambungan.',
    ],
  },
  {
    path: '/admin/network/infrastruktur',
    title: 'Infrastruktur Jaringan',
    section: S.infra,
    summary: 'Tabel OTB, Joint Closure, ODC, dan ODP beserta port dan sambungannya.',
    steps: ['Pilih tab jenis perangkat.', 'Lihat di peta, ubah, atau hapus dari tabel. Perangkat baru ditambahkan lewat peta.'],
  },
  {
    path: '/admin/network/diagrams',
    title: 'Diagram Splitter',
    section: S.infra,
    summary: 'Diagram splitter per OTB, Joint Closure, ODC, dan ODP, termasuk penugasan tabung kabel ke JC.',
    steps: ['Pilih OTB atau JC untuk melihat diagramnya.', 'Tugaskan tabung ke JC beserta panjang kabelnya.'],
  },
  {
    path: '/admin/network/trace',
    title: 'Network Trace',
    section: S.infra,
    summary: 'Melacak jalur dari satu perangkat ke perangkat lain, secara logis atau per core fiber.',
    steps: ['Pilih node awal dan tujuan, lalu Lacak Jalur.', 'Untuk jalur fisik, isi ID core atau perangkat.'],
  },
  {
    path: '/admin/network/map',
    title: 'Peta Jaringan',
    section: S.infra,
    summary: 'Peta OLT, ODC, ODP, dan pelanggan dengan status online, isolir, atau menunggak.',
    steps: ['Ganti latar peta (jalan, satelit, topografi) dari pilihan layer.', 'Klik pelanggan untuk melihat atau mengubah datanya.', 'Pakai Lokasi Saya saat di lapangan.'],
  },
  {
    path: '/admin/network/odcs',
    title: 'ODC',
    section: S.infra,
    summary: 'Optical Distribution Cabinet: titik bagi dari OLT ke beberapa ODP.',
    steps: ['Klik Add ODC, pilih OLT dan PON port, jumlah port, dan lokasinya.', 'ODP dihubungkan ke ODC dari halaman ODP.'],
  },
  {
    path: '/admin/network/odps',
    title: 'ODP',
    section: S.infra,
    summary: 'Optical Distribution Point: kotak tempat kabel drop pelanggan terpasang.',
    steps: [
      'Klik Tambah ODP, pilih induknya (ODC atau ODP lain), port, dan lokasi.',
      'Tempatkan pelanggan ke port ODP di halaman Penempatan Pelanggan ODP, agar jalur dan peta lengkap.',
    ],
    related: [{ label: 'Penempatan Pelanggan ODP', href: '/admin/network/customers' }],
  },
  {
    path: '/admin/network/customers',
    title: 'Penempatan Pelanggan ODP',
    section: S.infra,
    summary: 'Mencatat pelanggan terpasang di port ODP mana, beserta jarak kabel drop.',
    steps: ['Klik Penugasan Baru, pilih pelanggan, ODP, dan nomor port.', 'Isi jarak dan catatan bila ada, lalu simpan.'],
  },
  {
    path: '/admin/network/fiber-cables',
    title: 'Kabel Fiber',
    section: S.infra,
    summary: 'Kabel fiber optik dengan susunan tube dan core (12 sampai 144 core).',
    steps: ['Klik Tambah Kabel, pilih jenis dan jumlah core. Tube dan core dibuat otomatis.', 'Menghapus kabel ikut menghapus tube dan core-nya.'],
  },
  {
    path: '/admin/network/fiber-cores',
    title: 'Core Fiber',
    section: S.infra,
    summary: 'Status setiap core: tersedia, terpakai, dipesan, atau rusak.',
    steps: ['Saring per kabel dan status.', 'Pilih core lalu Assign, Release, Reserve, atau Tandai Rusak.'],
  },
  {
    path: '/admin/network/splice-points',
    title: 'Titik Splice',
    section: S.infra,
    summary: 'Sambungan antar core (fusion, mekanik, pigtail) beserta redamannya.',
    steps: ['Klik Buat Splice, pilih dua core yang disambung dan isi redaman hasil ukur.', 'Menghapus splice mengembalikan core ke status tersedia.'],
  },
  {
    path: '/admin/network/fiber-joint-closures',
    title: 'Joint Closure',
    section: S.infra,
    summary: 'Joint Closure (JC) tempat kabel disambung atau dicabangkan: feeder, distribusi, atau sambungan core.',
    steps: ['Klik Tambah Joint Closure, isi kode, tipe, jumlah fiber, dan lokasi.'],
  },

  // Manajemen
  {
    path: '/admin/tickets',
    title: 'Tiket',
    section: S.management,
    summary: 'Keluhan dan gangguan dari pelanggan, beserta prioritas, status, dan teknisi yang menangani.',
    steps: [
      'Buka tiket baru, tentukan prioritas.',
      'Klik Kirim ke Teknisi untuk menugaskan.',
      'Balas pelanggan dari detail tiket dan tutup tiket setelah selesai.',
    ],
    related: [{ label: 'Kategori Tiket', href: '/admin/tickets/categories' }],
  },
  {
    path: '/admin/tickets/categories',
    title: 'Kategori Tiket',
    section: S.management,
    summary: 'Jenis keluhan yang dipilih pelanggan saat membuat tiket, misalnya Jaringan, Instalasi, atau Billing.',
    steps: ['Tambah kategori dengan nama, deskripsi, dan warna.', 'Kategori yang masih punya tiket tidak bisa dihapus.'],
  },
  {
    path: '/admin/logs/activity',
    title: 'Log Aktivitas',
    section: S.management,
    summary: 'Catatan siapa melakukan apa di panel: login, perubahan pelanggan, tagihan, pembayaran, dan pengaturan.',
    steps: ['Saring per modul atau cari username, aksi, atau IP.'],
  },
  {
    path: '/admin/management',
    title: 'Admin & Role',
    section: S.management,
    summary: 'Akun staf kantor dan hak aksesnya: Super Admin, Keuangan, Customer Service, Marketing, dan Viewer.',
    steps: [
      'Klik Tambah User, isi username, password, dan pilih role.',
      'Atur izin per user bila role bawaan kurang pas.',
      'Bagikan alamat login portal yang tampil di halaman ini.',
    ],
    notes: ['Teknisi dibuat di Kelola Teknisi dan kolektor di Kelola Kolektor, bukan di sini.'],
    related: [
      { label: 'Kelola Teknisi', href: '/admin/technicians' },
      { label: 'Kelola Kolektor', href: '/admin/collectors' },
    ],
  },
  {
    path: '/admin/technicians',
    title: 'Kelola Teknisi',
    section: S.management,
    summary: 'Akun teknisi lapangan. Teknisi login di portal /technician dengan nomor WhatsApp dan kode OTP.',
    steps: [
      'Klik Tambah Teknisi, isi nama dan nomor WhatsApp aktif.',
      'Biarkan Wajib OTP aktif agar login aman.',
      'Bagikan alamat login teknisi yang tampil di atas daftar.',
    ],
    notes: ['Nomor telepon tidak bisa diubah setelah dibuat.', 'OTP dikirim lewat provider WhatsApp; pastikan provider aktif.'],
  },
  {
    path: '/admin/collectors',
    title: 'Kelola Kolektor',
    section: S.management,
    summary: 'Akun penagih lapangan. Kolektor hanya melihat pelanggan di area yang ditugaskan.',
    steps: ['Klik Tambah Kolektor, isi username, password, dan area.', 'Bagikan alamat login kolektor.', 'Pantau hasil tagihan di Setoran Kolektor.'],
    related: [{ label: 'Setoran Kolektor', href: '/admin/collector-settlements' }],
  },
  {
    path: '/admin/settings/company',
    title: 'Profil Perusahaan',
    section: S.management,
    summary: 'Identitas dan pengaturan dasar: nama, logo, kontak, Base URL, zona waktu, dan kapan tagihan bulanan dibuat.',
    steps: [
      'Unggah logo (maks 2 MB) dan isi nama, email, telepon, alamat.',
      'Base URL adalah alamat panel yang dipakai pelanggan, misalnya https://billing.domainanda.id. Dipakai di link bayar.',
      'Pilih zona waktu. Layanan direstart otomatis agar berlaku.',
      'Atur berapa hari sebelum jatuh tempo tagihan dibuat.',
    ],
  },
  {
    path: '/admin/settings/footer',
    title: 'Footer Login',
    section: S.management,
    summary: 'Teks di bawah halaman login tiap portal: admin, pelanggan, teknisi, dan agen.',
    steps: ['Isi teks per portal, lalu simpan.'],
  },
  {
    path: '/admin/settings/promo-banner',
    title: 'Promo Banner',
    section: S.management,
    summary: 'Banner gambar yang bergantian tampil di dashboard pelanggan (web dan aplikasi).',
    steps: ['Klik Tambah Banner, unggah gambar, isi judul dan link tujuan bila ada.', 'Atur urutan dan matikan banner yang sudah lewat.'],
  },
  {
    path: '/admin/settings/database',
    title: 'Database',
    section: S.management,
    summary: 'Kesehatan database, backup, dan restore.',
    steps: [
      'Klik buat backup untuk menyimpan salinan database saat ini.',
      'Unduh backup ke komputer atau aktifkan Telegram Backup agar tersimpan di luar server.',
      'Restore menimpa seluruh data dengan isi backup.',
    ],
    notes: ['Restore tidak bisa dibatalkan. Buat backup terbaru sebelum restore.'],
    related: [{ label: 'Telegram Backup', href: '/admin/settings/telegram' }],
  },
  {
    path: '/admin/settings/security',
    title: 'Keamanan (2FA)',
    section: S.management,
    summary: 'Verifikasi dua langkah untuk akun Anda dengan aplikasi authenticator.',
    steps: ['Pindai QR code dengan Google Authenticator atau aplikasi sejenis.', 'Masukkan kode 6 digit untuk mengaktifkan.', 'Login berikutnya meminta kode dari aplikasi itu.'],
  },
  {
    path: '/admin/settings/cron',
    title: 'Cron Jobs',
    section: S.management,
    summary: 'Jadwal otomatis: buat tagihan, pengingat, isolir, sinkron sesi, polling OLT, backup Telegram, dan pembersihan log.',
    steps: [
      'Pastikan job yang dipakai dalam keadaan aktif.',
      'Edit Schedule untuk mengubah jam; pakai preset atau ekspresi cron.',
      'Jalankan job secara manual untuk menguji, lalu cek riwayatnya.',
    ],
    notes: ['Bila semua job berhenti, cek proses salfanet-cron di server.'],
  },
  {
    path: '/admin/system',
    title: 'Sistem & Pembaruan',
    section: S.management,
    summary: 'Versi aplikasi, commit, dan pembaruan dari GitHub.',
    steps: [
      'Bila ada pembaruan, buka Lihat Changelog lalu Update Sekarang.',
      'Tunggu sampai PM2 restart selesai. Bila gagal, log terakhir tampil di halaman ini.',
      'Pembaruan juga bisa dijalankan lewat SSH dengan perintah yang tertera.',
    ],
    notes: ['Update butuh sisa disk minimal 3 GB.'],
  },
  {
    path: '/admin/settings/cloudflare-tunnel',
    title: 'Cloudflare Tunnel',
    section: S.management,
    summary: 'Membuka panel ke internet lewat Cloudflare tanpa IP publik dan tanpa membuka port di router.',
    steps: ['Install cloudflared dari halaman ini.', 'Isi domain dan token tunnel dari dashboard Cloudflare.', 'Simpan; Base URL ikut diperbarui.'],
  },
  {
    path: '/admin/download-apk',
    title: 'Aplikasi Android',
    section: S.management,
    summary: 'Rilis APK aplikasi native (admin dan pelanggan) di halaman login, dan build APK WebView per portal.',
    steps: [
      'Rilis APK: unggah APK release aplikasi pelanggan atau admin. Nomor build harus lebih tinggi dan kunci tanda tangannya sama.',
      'Isi catatan rilis, centang Wajib update bila versi lama tidak boleh dipakai lagi.',
      'Aplikasi yang sudah terpasang menawarkan update ini sendiri.',
    ],
  },

  // Notifikasi
  {
    path: '/admin/notifications/push',
    title: 'Push Notifikasi',
    section: S.notify,
    summary: 'Mengirim pemberitahuan ke aplikasi pelanggan, teknisi, atau agen: pengumuman, gangguan, promo, dan lainnya.',
    steps: ['Pilih target dan jenis pesan atau template.', 'Tulis judul dan isi, lalu kirim.'],
  },
  {
    path: '/admin/notifications',
    title: 'Notifikasi',
    section: S.notify,
    summary: 'Pemberitahuan sistem untuk admin: pembayaran masuk, pendaftaran baru, alert jaringan.',
    steps: ['Klik notifikasi untuk membuka halamannya.', 'Tandai dibaca atau hapus yang sudah tidak perlu.'],
  },
  {
    path: '/admin/settings/whatsapp',
    title: 'WhatsApp',
    section: S.notify,
    summary: 'Provider pengirim WhatsApp, isi template pesan otomatis, jadwal pengingat tagihan, kirim pesan, dan riwayat.',
    steps: [
      'Penyedia: tambah provider (Baileys, WAHA, GOWA, MPWA, Fonnte, Wablas, atau Kirimi.id). Untuk Baileys, pindai QR dari WhatsApp > Perangkat tertaut.',
      'Template: periksa isi pesan; variabel seperti nama dan nominal terisi otomatis.',
      'Pengaturan Reminder: aktifkan, pilih jam kirim dan hari (H-7, H-3, H, H+1, dan seterusnya dari jatuh tempo).',
      'Kirim Pesan untuk uji kirim atau broadcast, lalu cek Riwayat.',
    ],
    notes: ['Jadwal reminder yang sama dipakai untuk email dan notifikasi aplikasi pelanggan.'],
  },
  {
    path: '/admin/settings/email',
    title: 'Email',
    section: S.notify,
    summary: 'Server SMTP untuk email ke pelanggan, dan isi template email (pendaftaran, invoice, pembayaran, voucher, gangguan).',
    steps: ['Isi host, port, user, dan password SMTP, lalu kirim email uji.', 'Aktifkan jenis email yang ingin dikirim dan periksa template-nya.'],
  },
  {
    path: '/admin/settings/telegram',
    title: 'Telegram Backup',
    section: S.notify,
    summary: 'Backup database otomatis ke grup Telegram sesuai jadwal, ditambah laporan kesehatan database.',
    steps: [
      'Buat bot di @BotFather, buat grup dengan Topics, dan jadikan bot admin grup.',
      'Isi Bot Token, Chat ID grup, dan Topic ID untuk Backup (dan Health bila ingin laporan kesehatan).',
      'Pilih jadwal dan jam, lalu jumlah backup yang disimpan.',
      'Klik Test Connection, lalu Test Auto Backup untuk mengirim satu backup nyata. Aktifkan dan simpan.',
    ],
    notes: ['Backup pertama dikirim pada jadwal berikutnya setelah pengaturan disimpan. Telegram membatasi file 50 MB; backup yang lebih besar dikompres otomatis.'],
  },
  {
    path: '/admin/settings/telegram-bot',
    title: 'Bot Telegram',
    section: S.notify,
    summary: 'Bot dua arah untuk tim: cek redaman ONU (/redaman) dan detail pelanggan (/cekpelanggan) langsung dari Telegram.',
    steps: ['Isi Bot Token dan aktifkan bot.', 'Isi chat ID yang diizinkan agar bot tidak bisa dipakai orang lain.', 'Set webhook, lalu kirim /start ke bot untuk menguji.'],
  },
  {
    path: '/admin/settings/isolation/templates',
    title: 'Template Isolasi',
    section: S.notify,
    summary: 'Isi pesan WhatsApp, email, dan halaman yang dilihat pelanggan saat diisolir.',
    steps: ['Pilih template, ubah di editor, dan sisipkan variabel (nama, tunggakan, link bayar).', 'Cek tampilan di desktop, tablet, dan mobile sebelum menyimpan.'],
  },
];

/** The guide for a path: exact match or the longest guide path it sits under. */
export function guideFor(pathname: string): PageGuide | undefined {
  const path = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  let best: PageGuide | undefined;
  for (const g of GUIDES) {
    const hit = path === g.path || (g.path !== '/admin' && path.startsWith(g.path + '/'));
    if (hit && (!best || g.path.length > best.path.length)) best = g;
  }
  return best;
}
