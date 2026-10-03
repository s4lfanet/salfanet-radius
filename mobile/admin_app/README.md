# Salfanet Admin App

Native Flutter (Android) app for Salfanet staff: a mobile counterpart to the
`frontend/src/app/admin/*` web panel, using the same admin API
(`backend/src/app/api/*`, gated by `requirePermission()`).

## Scope

Daily operational work, not the whole web panel:

- **Tabs:** Dashboard (what needs attention today), Pelanggan (PPPoE list + full
  detail with invoice/session history and isolir/aktifkan/stop/tandai lunas),
  Tagihan (invoices, mark paid, reminders, share payment link), Lainnya.
- **Lainnya:** Registrasi, Persetujuan, Permintaan Suspend, Tiket Bantuan,
  Pembayaran Manual, Bukti Pembayaran Kolektor, Setoran Kolektor, Top Up Saldo,
  Keuangan, Referral, Voucher Hotspot, Agent, Deposit Agent, Sesi Online,
  Router/NAS, Status OLT, Alert OLT, Penarikan ONT, Broadcast Notifikasi,
  Notifikasi, Staf & Tim, Teknisi Lapangan, Log Aktivitas, Profil & Pengaturan.

Left on the web on purpose (desktop/NOC tooling): GenieACS/TR-069, raw
FreeRADIUS config/radtest/backup, fiber GIS maps, database admin, cron editor,
VPN config, system update, Cloudflare tunnel, and account/permission editing.

## Authentication — same session as the web panel

The admin API authenticates through NextAuth v4 (JWT in an httpOnly cookie);
there is no Bearer-token path into `requirePermission()`. Instead of changing
that shared middleware, `lib/core/api/api_client.dart` replays the browser
flow `signIn('credentials')` performs (`/api/admin/auth/pre-login` → CSRF →
`/api/auth/callback/credentials` → `/api/auth/session`) and keeps the session
cookie in a persisted cookie jar. TOTP 2FA is supported. Each staff member's
existing web permissions apply unchanged; a screen they can't access shows
"Akses ditolak".

## Server URL — not a single-tenant app

Every Salfanet Radius install runs on its own domain. The app defaults to
`https://radius.salfa.my.id`; the login screen's server link opens
`lib/features/auth/server_settings_screen.dart` to point it at any other
install (checked against `/api/public/company`, persisted in
`flutter_secure_storage`).

## Running

```
flutter pub get
flutter run
```

Point the default at a local backend:

```
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3001
```

## Design

Direction and rules are in [DESIGN.md](DESIGN.md). All screens are built from the shared
widgets in `lib/core/widgets/` and the tokens in `lib/core/theme/app_theme.dart`;
light and dark themes share one builder, and staff can pick Terang / Gelap /
Ikuti HP under Profil & Pengaturan.

## Tests

```
flutter test
```

`test/layout_test.dart` renders the shared widgets with worst-case content at
320dp and 360dp in both themes (with the real bundled font) and fails on any
overflow; it also guards the filter-chip contrast regression.

## Add / edit / delete (CRUD)

Every web admin mutation has an app counterpart. Most modules are declared,
not hand-built:

- `lib/core/forms/` — `FieldSpec` + `FormScreen` / `SettingsFormScreen`.
  Blank text/select fields are sent as `""` (what the web sends, and what the
  backend's zod `.optional()` schemas accept), blank numbers as `null`, blank
  dates are omitted. `omitWhenEmpty` for "leave unchanged" passwords.
- `lib/core/crud/` — `CrudConfig` + `CrudListScreen` (search, filters, FAB
  add, detail sheet with Edit/Hapus, row actions, long-press bulk actions)
  and `Lookups` for dropdown data (routers, areas, packages, …).
- `lib/features/resources/*_resources.dart` — one config per web page,
  grouped by domain (pppoe, hotspot, team, messaging, settings, network, olt,
  radius, genieacs).

To add a module: write a `CrudConfig` (or `SettingsFormScreen`) against the
route's real contract, then add an `_Entry` in `more_menu_screen.dart`.
