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
real Firebase project exists. Step-by-step setup (creating the project,
`google-services.json`, the backend's service account key, and how to verify each
side actually works) is in **[FIREBASE_SETUP.md](FIREBASE_SETUP.md)**.

Until both sides are configured, the app builds and runs normally with push simply
disabled — same fail-soft behavior as the backend's Web Push service (see
[Web Push vs FCM](#web-push-vs-fcm-these-are-two-separate-systems) below).

Neither credential is ever committed: `android/app/google-services.json` is blocked by
`.gitignore` (matched by the bare `google-services.json` pattern), and the backend's
service account key only ever lives in the server's `.env`, which is also ignored. If
you `git status` after adding either file and it shows up as untracked-but-ignored (or
doesn't show at all), that's correct — it means git isn't planning to pick it up.

## Web Push vs FCM — these are two separate systems

The web portal (`frontend/src/app/customer/*`) and this app do **not** share a push
mechanism, and a customer using both will get every notification twice — once per
channel, which is expected, not a bug:

| | Web portal | This app |
|---|---|---|
| Mechanism | Web Push (VAPID) | Firebase Cloud Messaging |
| Subscription stored in | `push_subscriptions` table | `customer_push_tokens` table |
| Server credential | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `FIREBASE_SERVICE_ACCOUNT_JSON` |

Every notification-triggering event (payment success, ticket reply, invoice reminder,
etc.) calls one function on the backend that fans out to both channels in parallel —
see `sendWebPushToUser`/`sendWebPushToUsers` in
`backend/src/server/services/push-notification.service.ts`. Callers never need to know
which channels a given customer has.
