# Salfanet Agen

Aplikasi Android untuk agen voucher hotspot, pendamping portal web `/agent`.
Paket `id.my.salfa.agent_app`. Memakai API `backend/src/app/api/agent/*`.

## Fitur
- Masuk dengan nomor HP agen dan kode OTP WhatsApp (bila OTP aktif di server)
- Ringkasan: saldo, penjualan, komisi per periode, stok voucher, deposit terakhir, banner promo
- Voucher: tab status, pencarian, saring paket, detail, salin, bagikan, kirim ke WhatsApp pembeli
- Buat voucher setara form admin: tipe voucher, 7 jenis kode, awalan, panjang kode, total biaya
- Cetak voucher mengikuti desain voucher admin: A4 (printer biasa atau PDF), thermal Bluetooth
  58/80 mm (gambar bertema atau teks polos)
- Isi saldo lewat payment gateway atau transfer manual
- Tiket bantuan dengan foto, sesi aktif, notifikasi, dan push Firebase
- Update APK dalam aplikasi lewat `/api/public/apk-releases` (target `agent`)

## Cetak thermal
Pasangkan printer di pengaturan Bluetooth HP lebih dulu, lalu pilih printer di sheet Cetak.
Aplikasi meminta izin "Perangkat di sekitar". Mode Thermal mencetak desain admin sebagai gambar
(belum diuji di semua merek printer); mode Teks paling kompatibel.

## Push notifikasi
Daftarkan `id.my.salfa.agent_app` di project Firebase yang sama dengan aplikasi lain, unduh ulang
`google-services.json`, dan unggah di Admin → Download APK → Notifikasi Push. Lihat
[`../customer_app/FIREBASE_SETUP.md`](../customer_app/FIREBASE_SETUP.md). Server diatur di dalam
aplikasi (Menu → Server).

## Build
Workflow **Build Native APKs** (`.github/workflows/build-apk.yml`, artifact `salfanet-agent`).
Panduan lengkap: [`docs/BUILD-APK.md`](../../docs/BUILD-APK.md).
