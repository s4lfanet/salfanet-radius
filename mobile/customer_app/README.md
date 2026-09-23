# Salfanet Customer App

Native Flutter (Android) app for Salfanet customers — a native counterpart to the
`frontend/src/app/customer/*` web portal, using the same `backend/src/app/api/customer/*` API.

## Scope

Login (phone/customer ID + WhatsApp OTP), Dashboard, Tagihan (invoices + pay), WiFi
(view/edit SSID & password), Tiket (list/thread/create), plus the rest of the
customer web portal: renewal, upgrade/change package, top-up (gateway + manual
transfer), referral, suspend requests, speed test, and profile.

## Server URL — this is NOT a single-tenant app

Every Salfanet Radius installation runs on its own operator-chosen domain, so
the app does **not** hard-code one production host. On first launch it defaults
to `https://radius.salfa.my.id` (overridable at build time, see below), but the
Login screen has a "Pengaturan Server" (gear icon / host caption) that opens
`lib/features/auth/server_settings_screen.dart` — enter any other install's
domain there, it's tested against `/api/public/company` and persisted via
`flutter_secure_storage`. This is how the same APK gets pointed at a different
ISP's backend without a rebuild.

## Running

```
flutter pub get
flutter run
```

To point the default at a local backend instead of `radius.salfa.my.id`:

```
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3001
```

(`10.0.2.2` is the Android emulator's alias for the host machine's `localhost`.)

## Push notifications (FCM)

Push is wired up in code (`lib/core/push/push_service.dart`) but stays a no-op until a
real Firebase project exists:

1. Create a Firebase project, add an Android app with package name
   `id.my.salfa.customer_app`.
2. Download `google-services.json` into `android/app/`.
3. Generate a service account key and set `FIREBASE_SERVICE_ACCOUNT_JSON` on the
   backend (see `backend/src/server/services/fcm-push.service.ts`).

Until both sides are configured, the app builds and runs normally with push simply
disabled — same fail-soft behavior as the backend's Web Push service.
