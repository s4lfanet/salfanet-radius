# Build APK

Instalasi baru Salfanet RADIUS belum bisa membuat APK apa pun: server belum
punya Java dan Android SDK, dan aplikasi native butuh Firebase dan keystore
milik Anda sendiri. Ada dua jenis APK dengan cara build yang berbeda:

| APK | Di-build di | Yang perlu disiapkan |
|---|---|---|
| WebView portal (admin, customer, technician, agent) | Server VPS, dari **Admin → Download APK** | Java 17 + Android SDK di VPS (bagian A) |
| QRIS Listener (HP kasir) | Server VPS, dari **Admin → Payment Gateway → tab QRIS Mandiri** | Sama dengan di atas (bagian A) |
| Native Flutter (`mobile/admin_app`, `mobile/customer_app`) | PC/laptop atau GitHub Actions, **bukan VPS** | Flutter, Firebase, keystore (bagian B) |

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
(Flutter). File `google-services.json`, `key.properties`, dan keystore
**tidak disertakan di repo** — setiap deployment membawa miliknya sendiri.

Jangan build di VPS produksi: Gradle dan Flutter memakai beberapa GB RAM dan
disk, cukup untuk mengganggu layanan yang berjalan. Pakai PC/laptop atau
GitHub Actions (langkah 4).

## 1. Firebase / FCM (untuk push notifikasi)

1. Buat project di <https://console.firebase.google.com>
2. Tambahkan 2 aplikasi Android dengan package name:
   - `id.my.salfa.admin_app`
   - `id.my.salfa.customer_app`
3. Unduh `google-services.json` masing-masing, letakkan di:
   - `mobile/admin_app/android/app/google-services.json`
   - `mobile/customer_app/android/app/google-services.json`
4. Di backend `.env` set `FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'`
   (Project Settings → Service Accounts → Generate new private key).

Tanpa file ini build tetap jalan tapi FCM tidak aktif (web push via VAPID
di portal tetap bekerja).

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
| `GOOGLE_SERVICES_JSON_ADMIN` | `base64 -w0 google-services.json` admin |
| `GOOGLE_SERVICES_JSON_CUSTOMER` | `base64 -w0 google-services.json` customer |

## 5. Update in-app

App mengecek `/api/public/apk-releases` saat start. Publish APK hasil build
lewat `/admin/download-apk` (Super Admin) — pengguna akan ditawari update
otomatis saat membuka app.
