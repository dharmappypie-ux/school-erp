# Vidyalaya — mobile app (Flutter)

An **offline-first** parent/student companion for the Vidyalaya school ERP, for
**iOS and Android** from one Flutter codebase. The UI follows the reference
video: a calm, minimal account app — warm off-white ground, deep-slate hero
cards, white rounded cards, toggles and list rows, a single indigo accent.

## Offline-first + sync

The on-device **SQLite database is the source of truth**. Every screen reads
from it, so the app is fully usable with no network — it even seeds demo data on
first launch. Writes (toggling a notification, marking a notice read) persist
locally *immediately* and are appended to an **outbox** queue.

A **SyncService** reconciles the local store with the backend:

| Mode | Trigger | What it does |
|------|---------|--------------|
| **Auto** | connectivity regained · every 15 min · app resumed · launch | Quietly pushes the outbox, then pulls a fresh snapshot. Never blocks the UI; leaves local data intact when offline. |
| **Manual** | pull-to-refresh · the **sync pill** (every screen header) · **Sync now** in Settings | Same round trip, but reports the outcome. |

The **sync pill** shows live status — `Syncing…`, `Synced 2m ago`, `Offline ·
saved here`, or `3 to sync` when local edits are queued. Until the backend's
`/api/mobile/v1` endpoints ship (see `../DEPLOY.md` and the mobile plan), the app
runs entirely on local data and reports itself "offline" honestly; the same code
path starts syncing for real once those endpoints exist.

## Architecture

```
lib/
  main.dart                 open DB + auth, inject via ProviderScope
  app.dart                  MaterialApp; login vs. shell by auth state
  theme/app_theme.dart      design tokens (colours, radii, type, shadows)
  data/
    models/models.dart      plain models + sqflite (de)serialisation
    local/app_database.dart  SQLite store, schema, seed, DAOs, outbox  (web + mobile)
    remote/api_client.dart   dio REST client for /api/mobile/v1 (graceful offline)
    sync/sync_service.dart   push(outbox) → pull(snapshot); auto + manual; status
    auth/auth_controller.dart token in the OS keychain; offline fallback session
  state/providers.dart      Riverpod wiring
  ui/
    shell/home_shell.dart    bottom nav + app-resume sync
    screens/                 login, home, fees, notifications, settings
    widgets/                 dark card, soft card, toggles, sparkline, sync pill
```

**Stack:** Flutter · Riverpod (state) · sqflite / sqflite_common_ffi_web (local
DB) · dio (HTTP) · connectivity_plus (auto-sync) · flutter_secure_storage
(tokens) · google_fonts.

## Screens (mapped from the reference → school)

- **Login** — email/password, works offline.
- **Home** — slate profile card with term-average sparkline, attendance and fees
  stats, quick access to Attendance / Results / Homework / Courses, latest notices.
- **Fees** — total-due hero, invoice cards with paid/overdue states, payment methods.
- **Notifications** — "N of M enabled" hero + grouped toggles (offline-first writes).
- **Settings** — account, **sync controls** (status, Sync now, auto-sync), privacy
  toggles, sign out.

## Run it

```bash
cd mobile
flutter pub get

# iOS / Android (needs the respective toolchain)
flutter run                 # pick a booted simulator/emulator or device

# Quick preview with no emulator (web):
dart run sqflite_common_ffi_web:setup   # one-time, copies the sqlite wasm
flutter run -d chrome
```

Point `ApiClient.baseUrl` (in `lib/data/remote/api_client.dart`) at your
deployment to enable real sync; it defaults to the live Workers URL.
