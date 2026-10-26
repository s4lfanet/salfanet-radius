# Build APK Native (admin_app / customer_app)

Kedua aplikasi native ada di `mobile/admin_app` dan `mobile/customer_app`
(Flutter). File `google-services.json`, `key.properties`, dan keystore
**tidak disertakan di repo** — setiap deployment membawa miliknya sendiri.

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
