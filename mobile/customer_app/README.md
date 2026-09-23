# Salfanet Customer App

Native Flutter (Android) app for Salfanet customers — a native counterpart to the
`frontend/src/app/customer/*` web portal, using the same `backend/src/app/api/customer/*` API.

## Scope (phase 1)

Login (phone/customer ID + WhatsApp OTP), Dashboard, Tagihan (invoices + pay), WiFi
(view/edit SSID & password), Tiket (list/thread/create). Referral, speedtest, upgrade,
and top-up are not yet ported from the web app.

## Running

```
flutter pub get
flutter run
```

Points at `https://customer.salfa.my.id` by default. To hit a local backend instead:

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
