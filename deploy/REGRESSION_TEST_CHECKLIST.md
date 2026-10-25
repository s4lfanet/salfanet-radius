# Regression Test Checklist — Salfanet Radius

Daftar uji untuk server percobaan sebelum sebuah rilis dipakai di produksi. Centang tiap butir setelah dijalankan; catat butir yang gagal beserta pesannya. Gunakan data uji, bukan pelanggan sungguhan.

## 0. Persiapan

- [ ] `pm2 status`: `salfanet-frontend`, `salfanet-backend`, `salfanet-cron`, dan `salfanet-wa` semuanya `online`
- [ ] `pm2 logs salfanet-backend --lines 50` tanpa error berulang
- [ ] Halaman login admin terbuka, dan kolom versi di sidebar sesuai rilis (`vX.Y.Z+jumlah commit`)
- [ ] `systemctl is-active freeradius` aktif, dan tidak ada `rest: ERROR` berulang di log FreeRADIUS
- [ ] Nginx: `/api/auth/*` ke frontend, `/api/*` ke backend, `/uploads/` menyajikan gambar
- [ ] Update Sekarang selesai tanpa error, dan halaman Sistem menampilkan versi baru

## 1. Login dan akses

- [ ] Admin masuk, dan sesi habis setelah idle
- [ ] Kata sandi salah ditolak, dan halaman admin tanpa sesi diarahkan ke login
- [ ] Setiap peran (Keuangan, Customer Service, Marketing, Teknisi, Viewer) hanya melihat menu yang bisa dibuka, tanpa panggilan API yang ditolak (403) di konsol
- [ ] Pelanggan masuk ke portal pelanggan
- [ ] Agen masuk ke portal agen
- [ ] Teknisi masuk dengan **username dan password** (Kelola Teknisi), dan teknisi tanpa password belum bisa masuk
- [ ] Kolektor masuk dengan username dan password, dan melihat hanya data wilayah tugasnya

## 2. PPPoE dan Hotspot

- [ ] Buat, ubah, dan hapus pelanggan PPPoE; baris `radcheck` dan `radusergroup` ikut berubah
- [ ] Pelanggan baru bisa terhubung (PAP/CHAP), dan tampil online di daftar
- [ ] Profil dan sinkron ke MikroTik
- [ ] Buat batch voucher hotspot; login pertama memulai masa berlaku
- [ ] Pelanggan atau voucher yang diblokir atau kedaluwarsa ditolak (hook REST FreeRADIUS `/authorize`)
- [ ] Log Autentikasi menampilkan waktu yang benar dan hitungan hari ini

## 3. Isolir dan perpanjangan

- [ ] Pelanggan prabayar yang kedaluwarsa terisolir oleh `pppoe_auto_isolir`, dan sesinya diputus
- [ ] Pelanggan terisolir mendapat halaman pembayaran
- [ ] Setelah bayar (gateway, manual, atau kolektor), pelanggan aktif lagi dan masa aktif bertambah
- [ ] Auto Renewal memotong saldo dan memperpanjang
- [ ] `auto_stop` nonaktif secara bawaan di halaman Cron (jangan dinyalakan di server percobaan yang berisi data asli)

## 4. Invoice dan pembayaran

- [ ] Invoice bulanan dibuat oleh `invoice_generate` untuk pascabayar
- [ ] Tandai Lunas di Tagihan; dengan memilih kolektor, pembayaran masuk Setoran Kolektor, tanpa memilih kolektor pembayaran muncul di panel "tidak masuk setoran kolektor manapun"
- [ ] Pembayaran gateway (Midtrans, Xendit, Duitku, Tripay) dan webhook-nya melunasi invoice; tanda tangan webhook diperiksa
- [ ] QRIS Mandiri: nominal dengan kode unik terdeteksi dan melunasi
- [ ] Pembayaran manual: pelanggan mengunggah bukti, admin menyetujui atau menolak (alasan wajib), pelanggan menerima notifikasi
- [ ] PDF invoice dan ekspor Excel terunduh

## 5. Pengingat dan notifikasi

- [ ] Pengaturan WhatsApp, Notifikasi: hari pengingat, jam kirim, dan batch tersimpan
- [ ] Test manual **Pengingat Invoice** di Settings, Cron menampilkan ringkasan alasan (terkirim, atau mengapa tidak)
- [ ] Dengan provider WhatsApp yang sengaja dimatikan, pengingat gagal dilaporkan (bukan dianggap terkirim) dan dicoba lagi di putaran berikutnya
- [ ] Pesan WhatsApp, email, dan push pengingat sampai ke pelanggan uji
- [ ] Push ke aplikasi pelanggan (FCM) sampai, termasuk untuk pelanggan yang hanya memakai aplikasi
- [ ] Siaran notifikasi (broadcast) sampai ke target yang dipilih

## 6. Portal kolektor dan setoran

- [ ] Kelola Kolektor: area, beberapa router/NAS, Edit, dan Hapus (kolektor yang pernah menagih tidak bisa dihapus)
- [ ] Kolektor tanpa area dan NAS tidak melihat data; kolektor lain tidak melihat pelanggan di luar wilayahnya
- [ ] Filter area dan router/NAS tampil, dan mengubah daftar Pelanggan, Tagihan, dan Isolir
- [ ] Tandai lunas tunai, dan transfer dengan foto bukti; tandai lunas dua kali bersamaan tidak memperpanjang dua kali
- [ ] Pelanggan: status pembayaran, peta, detail GPS, tombol Telepon dan WhatsApp (pesan terisi)
- [ ] Setoran Saya (harian dan rentang) sama dengan yang terlihat admin untuk hari yang sama
- [ ] Setoran Kolektor di admin: daftar pembayaran, konfirmasi per baris, centang beberapa lalu konfirmasi, batalkan, rentang tanggal
- [ ] Lonceng kolektor: notifikasi muncul, klik membuka halamannya dan menandai dibaca, Tandai semua dibaca
- [ ] Web push kolektor (lewat HTTPS dengan kunci VAPID): tombol Aktifkan, notifikasi sistem muncul walau portal tertutup

## 7. Portal teknisi

- [ ] Daftar tiket dan pesan, ubah status
- [ ] Data Pelanggan: peta, detail, dan ubah lokasi (Pilih di Peta atau GPS Otomatis)
- [ ] Unggah foto (instalasi, KTP, tiket) tampil kembali lewat `/uploads/`
- [ ] Pendaftaran pelanggan dan work order

## 8. Jaringan, GenieACS, VPN

- [ ] Router: tambah, uji koneksi, dan status
- [ ] OLT: daftar, polling (`olt_poll`), ONU
- [ ] Peta Jaringan: OLT, ODC, ODP, jalur kabel
- [ ] GenieACS: daftar perangkat, ubah SSID dan kata sandi WiFi, reboot
- [ ] VPN: server dan klien (L2TP, WireGuard), skrip RouterOS

## 9. Cron (27 job)

- [ ] Halaman Settings, Cron menampilkan semua job dengan status dan jadwal berikutnya
- [ ] Tidak ada baris riwayat ganda untuk satu run, dan tidak ada error deadlock di riwayat
- [ ] Job per menit (`hotspot_sync`, `external_task_processor`) dan per 5 menit berjalan tanpa `HTTP request failed`
- [ ] Jalankan Sekarang berhasil untuk satu job; tombol restart cron menerapkan jadwal baru
- [ ] Setelah restart `salfanet-cron`, baris yang tertinggal `running` ditandai `Interrupted` dan tidak menumpuk
- [ ] Job harian yang terlewat dikejar saat runner start (`invoice_generate`, `auto_renewal`, dan lainnya)
- [ ] Pembersihan (`activity_log_cleanup`, `webhook_log_cleanup`, `radpostauth_cleanup`, `cron_history_cleanup`) berjalan

## 10. Backup dan sistem

- [ ] Backup database ke Telegram sesuai jadwal; laporan kesehatan masuk topic Health
- [ ] Backup, unduh, dan restore FreeRADIUS (khusus Super Admin); config lama kembali bila restore ditolak
- [ ] Rilis APK admin dan pelanggan: unggah, versi terbaca, aplikasi menawarkan pembaruan
- [ ] Panduan: tombol Panduan membuka panduan halaman yang sedang dibuka

## 11. Aplikasi Android

- [ ] Admin: login, menu sesuai peran, Aksi Cepat, Kasir QRIS, Peta Jaringan, Panduan
- [ ] Pelanggan: login, tagihan, bayar di dalam aplikasi, push FCM
- [ ] Pembaruan dari dalam aplikasi: unduh, pasang, data dan login tetap

## Setelah semua lulus

- [ ] Catat versi, tanggal, dan penguji; simpan butir yang gagal di CHANGELOG atau tiket
- [ ] Jalankan Update Sekarang di produksi pada jam sepi, lalu ulangi bagian 0
