# Mengaktifkan Push Notification (Firebase Cloud Messaging)

Kode di kedua sisi sudah siap dan sengaja dibuat **diam kalau belum dikonfigurasi**:
aplikasi tetap jalan, backend tetap mengirim Web Push ke portal web seperti biasa,
hanya push ke aplikasi Android yang belum aktif. Tidak ada kode yang perlu diubah —
yang kurang hanya dua berkas kredensial.

Butuh akun Google Anda sendiri, jadi langkah ini tidak bisa saya kerjakan.

---

## Ringkas

| Yang dibutuhkan | Ditaruh di mana | Untuk apa |
|---|---|---|
| `google-services.json` | `mobile/customer_app/android/app/` | Aplikasi bisa menerima pesan |
| Service account JSON | `.env` server, sebagai `FIREBASE_SERVICE_ACCOUNT_JSON` | Server bisa mengirim pesan |

Keduanya harus dari **project Firebase yang sama**.

---

## Bagian 1 — Buat project dan ambil `google-services.json`

1. Buka <https://console.firebase.google.com> lalu **Add project**.
   Nama bebas, misalnya `salfanet-customer`. Google Analytics boleh dimatikan.

2. Di halaman project, klik ikon **Android** untuk menambahkan aplikasi Android.

3. Isi **Android package name** dengan persis:

   ```
   id.my.salfa.customer_app
   ```

   Ini harus sama huruf per huruf. Nilainya ada di
   `android/app/build.gradle.kts` pada baris `applicationId`. Kalau beda, Firebase
   akan menolak pesan yang dikirim ke aplikasi. *Nama aplikasi* ("Salfanet Customer")
   tidak ada hubungannya dengan ini dan boleh berbeda.

   Nickname dan SHA-1 boleh dikosongkan (SHA-1 hanya perlu untuk login Google,
   bukan untuk notifikasi).

4. Unduh **`google-services.json`** yang muncul, lalu taruh di:

   ```
   mobile/customer_app/android/app/google-services.json
   ```

5. Lewati sisa wizard-nya ("Add Firebase SDK" dan seterusnya) — bagian itu sudah
   terpasang di proyek ini.

6. Build ulang APK:

   ```bash
   cd mobile/customer_app
   flutter build apk --release --target-platform android-arm64
   ```

   Gradle mendeteksi sendiri berkasnya (`android/app/build.gradle.kts` hanya
   menyalakan plugin Google Services bila `google-services.json` ada), jadi tidak
   ada yang perlu diedit.

---

## Bagian 2 — Kunci server

1. Di Firebase Console: **ikon gerigi → Project settings → Service accounts**.

2. Klik **Generate new private key**, lalu **Generate key**. Sebuah berkas `.json`
   terunduh. Berkas ini setara kunci induk — jangan pernah masuk ke git.

3. Salin ke server dan pasang sebagai satu baris di `.env`:

   ```bash
   # dari komputer Anda
   scp kunci-yang-terunduh.json root@192.168.54.129:/root/firebase-key.json

   # di server
   cd /var/www/salfanet-radius
   printf "FIREBASE_SERVICE_ACCOUNT_JSON='%s'\n" "$(tr -d '\n' < /root/firebase-key.json)" >> .env
   rm /root/firebase-key.json
   ```

   Harus satu baris utuh dan dikutip, karena isinya JSON yang mengandung spasi.

4. Muat ulang backend supaya variabel barunya terbaca:

   ```bash
   pm2 reload salfanet-backend --update-env
   ```

---

## Memastikan berhasil

**Server sudah membaca kuncinya?** Kalau belum, baris peringatan ini akan muncul
di log setiap kali ada notifikasi yang mencoba dikirim:

```bash
pm2 logs salfanet-backend --lines 50 | grep FCM
# "[FCM] FIREBASE_SERVICE_ACCOUNT_JSON not configured" = belum terbaca
# tidak ada baris itu sama sekali = sudah beres
```

**Aplikasi sudah terdaftar?** Buka aplikasi, login, lalu cek di database:

```sql
SELECT platform, LEFT(token, 18) AS token_awal, createdAt
FROM customer_push_tokens ORDER BY createdAt DESC LIMIT 5;
```

Ada baris baru berarti aplikasi berhasil mendaftarkan diri. Kalau kosong,
biasanya `google-services.json` belum ikut ter-build, atau izin notifikasi
ditolak saat login.

**Uji kirim sungguhan:** tandai satu tagihan sebagai lunas dari panel admin.
Notifikasi "Pembayaran Berhasil" akan terkirim lewat jalur yang sama seperti
Web Push, karena `sendWebPushToUser` memang sudah bercabang ke FCM.

---

## Hal yang perlu diketahui

**Satu project Firebase per pemasangan.** Setiap ISP yang memasang Salfanet
Radius perlu project Firebase-nya sendiri, karena kunci server dan
`google-services.json` harus sepasang. Ini satu-satunya bagian identitas yang
tidak bisa diambil otomatis dari API seperti logo dan warna.

**Kalau package name-nya diubah**, `google-services.json` harus dibuat ulang dan
setiap pelanggan wajib memasang ulang aplikasinya. Sebaiknya jangan diubah.

**Jangan commit kedua berkas itu.** `google-services.json` sudah diblokir
`.gitignore` baris 162, jadi aman. Service account JSON jangan pernah menyentuh
folder proyek sama sekali — cukup di `.env` server, dan `.env` juga sudah
di-ignore.
