# Build APK

Instalasi baru Salfanet RADIUS belum bisa membuat APK apa pun: server belum
punya Java dan Android SDK, dan aplikasi native butuh keystore milik Anda
sendiri. Ada dua jenis APK dengan cara build yang berbeda:

| APK | Di-build di | Yang perlu disiapkan |
|---|---|---|
| WebView portal (admin, customer, technician, agent) | Server VPS, dari **Admin → Download APK** | Java 17 + Android SDK di VPS (bagian A) |
| QRIS Listener (HP kasir) | Server VPS, dari **Admin → Payment Gateway → tab QRIS Mandiri** | Sama dengan di atas (bagian A) |
| Native Flutter (`mobile/admin_app`, `mobile/customer_app`) | PC/laptop atau GitHub Actions, **bukan VPS** | Flutter, keystore (bagian B). Firebase opsional — diatur di server, bukan di APK |

---

## A. APK yang di-build di server (WebView dan QRIS Listener)

Pasang sekali lewat SSH sebagai root. Butuh sekitar 2 GB disk dan 5–10 menit:

```bash
apt-get update && apt-get install -y openjdk-17-jdk wget unzip && \
mkdir -p /opt/android/cmdline-tools && \
wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O /tmp/cmdtools.zip && \
unzip -q /tmp/cmdtools.zip -d /opt/android/cmdline-tools && \
mv /opt/android/cmdline-tools/cmdline-tools /opt/android/cmdline-tools/latest && \
yes | /opt/android/cmdline-tools/latest/bin/sdkmanager --licenses && \
/opt/android/cmdline-tools/latest/bin/sdkmanager "platforms;android-34" "build-tools;34.0.0" && \
echo 'export ANDROID_HOME=/opt/android' >> /etc/environment
```

Lalu:

1. Buka **Admin → Download APK**. Bila Java dan Android SDK terbaca, status
   berubah hijau. Perintah di atas juga ditampilkan di halaman itu selama
   server belum siap.
2. **WebView portal:** klik **Build APK** pada role yang diinginkan.
3. **QRIS Listener:** isi dan simpan Device Key di **Payment Gateway → tab
   QRIS Mandiri**, lalu klik **Build APK QRIS Listener**. Device Key dan URL
   webhook server langsung tertanam di APK, jadi HP kasir cukup memasang APK
   dan memberi izin akses notifikasi.

Build berjalan 2–5 menit dan memakai RAM cukup besar. Di VPS dengan RAM kecil
(di bawah 4 GB), jalankan build di luar jam sibuk.

---

## B. APK native (admin_app / customer_app)

Kedua aplikasi native ada di `mobile/admin_app` dan `mobile/customer_app`
(Flutter). File `key.properties` dan keystore **tidak disertakan di repo** —
setiap deployment membawa miliknya sendiri. `google-services.json` juga tidak
perlu ada saat build: konfigurasi Firebase diambil aplikasi dari server saat
berjalan (langkah 1), jadi **satu APK bisa dipakai semua instalasi**.

Jangan build di VPS produksi: Gradle dan Flutter memakai beberapa GB RAM dan
disk, cukup untuk mengganggu layanan yang berjalan. Pakai PC/laptop atau
GitHub Actions (langkah 4).

## 1. Push notifikasi: Firebase opsional, polling cadangan

Aplikasi menanyakan ke server (`GET /api/public/push-config`) cara menerima
notifikasi, tepat setelah URL server diisi:

- **Server punya Firebase** → aplikasi menyalakan FCM dengan konfigurasi dari
  server. Real-time, andal saat aplikasi ditutup.
- **Server tanpa Firebase** → aplikasi mengecek notifikasi baru secara berkala
  (±15 menit, dijadwalkan Android) dan menampilkannya lewat notifikasi lokal.
  Tetap berfungsi, hanya tidak se-real-time FCM.

### Mengaktifkan FCM di satu instalasi

1. Buat project di <https://console.firebase.google.com>
2. Tambahkan 2 aplikasi Android dengan package name:
   - `id.my.salfa.admin_app`
   - `id.my.salfa.customer_app`
3. Unduh `google-services.json` **salah satu** aplikasi (satu file berisi
   kedua aplikasi bila keduanya ada di project yang sama).
4. Unduh service account: Project Settings → Service Accounts → Generate new
   private key.
5. Buka **Admin → Download APK → Notifikasi Push Aplikasi** (Super Admin),
   unggah kedua file itu di sana.

File disimpan di folder data server (bukan di repo maupun build), service
account tidak pernah keluar lewat API, dan aplikasi langsung memakai FCM
begitu konfigurasi tersedia — tanpa rebuild APK. Mengganti atau menghapus
konfigurasi cukup dari halaman yang sama.

Alternatif tanpa panel: set `FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'`
di `.env` backend. Cara lama ini tetap didukung dan **diutamakan** bila
keduanya ada — tapi tanpa `google-services.json` yang diunggah, aplikasi
tetap memakai polling karena tidak mendapat konfigurasi klien.

Tanpa konfigurasi apa pun, aplikasi tetap aman: notifikasi jalan lewat
polling dan web push via VAPID di portal tidak terpengaruh.

## 2. Signing key (wajib untuk release APK)

```bash
keytool -genkey -v -keystore salfanet-signing.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 -alias <alias>
```

Buat `mobile/<app>/android/key.properties`:

```properties
storeFile=<path-keystore>
storePassword=<password>
keyAlias=<alias>
keyPassword=<password>
```

> Simpan keystore di luar repo — tidak pernah di-commit (sudah di-gitignore).
> HP yang sudah install APK dengan signature lain tidak bisa update.

## 3. Build

```bash
cd mobile/admin_app
flutter pub get
flutter build apk --release --split-per-abi \
  --dart-define=API_BASE_URL=https://domain-anda.com
```

Output di `build/app/outputs/flutter-apk/app-<abi>-release.apk`.
`arm64-v8a` cocok untuk hampir semua HP modern; `armeabi-v7a` untuk HP lama.

## 4. Build via GitHub Actions (opsional)

Repo menyediakan workflow `Build Native APKs` (manual). Untuk release-signed
build, set repository secrets:

| Secret | Isi |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 keystore.jks` |
| `KEYSTORE_PASSWORD` | password keystore |
| `KEY_ALIAS` | alias key |
| `KEY_PASSWORD` | password key |

Secret `google-services.json` tidak dipakai lagi: Firebase diatur per
instalasi lewat server (langkah 1), bukan dibakar ke APK saat build.

## 5. Update in-app

App mengecek `/api/public/apk-releases` saat start. Publish APK hasil build
lewat `/admin/download-apk` (Super Admin) — pengguna akan ditawari update
otomatis saat membuka app.
