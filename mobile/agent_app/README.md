# Salfanet Agen

Aplikasi Android untuk agen voucher hotspot — pendamping portal web `/agent`.

- Masuk dengan nomor HP agen + kode OTP WhatsApp (jika OTP aktif di server)
- Ringkasan saldo, penjualan, dan komisi
- Daftar voucher (status Menunggu / Aktif / Kedaluwarsa), buat voucher, salin/bagikan kode
- Sesi aktif, tiket bantuan, notifikasi
- Update APK dalam aplikasi lewat `/api/public/apk-releases` (target `agent`)

Server diatur di dalam aplikasi (Menu → Server). Build: workflow **Build Native APKs**
(`.github/workflows/build-apk.yml`, artifact `salfanet-agent`).

Belum ada: cetak termal Bluetooth (portal web memakai jendela cetak browser), push notification,
dan isi saldo (deposit) — keduanya masih lewat portal web.
