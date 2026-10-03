# Deploying to Cloudflare Workers

The Vidyalaya marketing site + management ERP is one Next.js app, deployed to
**Cloudflare Workers** via the [OpenNext](https://opennext.js.org/cloudflare)
adapter. This document is the runbook.

> Status: the build is wired and verified (`opennextjs-cloudflare build` and
> `wrangler deploy --dry-run` both pass). Two things are intentionally left for
> you to decide: the **database binding** and the **email transport** (see below).

---

## What was set up

| File | Purpose |
|------|---------|
| `wrangler.jsonc` | Worker name, `nodejs_compat`, assets binding, and a **commented Hyperdrive block** to fill in. |
| `open-next.config.ts` | OpenNext adapter config (default cache; R2 optional). |
| `next.config.ts` | `initOpenNextCloudflareForDev()` for local bindings + `serverExternalPackages` for `pg`/Prisma. |
| `package.json` | `next` bumped to `16.3.5` (OpenNext needs `>=16.3.3`); added `@opennextjs/cloudflare`, `wrangler`, `pg-cloudflare`; removed `nodemailer`; scripts `preview`, `deploy`, `cf-typegen`. |
| `src/lib/storage.ts` + `src/app/uploads/[...path]/route.ts` | Database-backed upload storage (the `uploads` table) and the route that serves it. |
| `src/lib/notifications.ts` | Email sends via Resend HTTP API (was SMTP/nodemailer). |
| `src/lib/db.ts` | Lazy Prisma client that prefers the Hyperdrive binding, else `DATABASE_URL`. |

Build artifacts (`.open-next/`, `.wrangler/`, `worker-configuration.d.ts`) are git-ignored.

---

## Prerequisites

1. A Cloudflare account on a **paid Workers plan** (the bundle gzips to ~4.6 MB; the free tier's compressed-size limit is lower).
2. `npx wrangler login` (one-time, interactive — opens a browser).
3. A Postgres database reachable from Cloudflare (your existing one via Hyperdrive, or a serverless Postgres).

---

## 1. Database

You need an **internet-reachable Postgres** (Neon, Supabase, RDS, …) — a `localhost`
database is not reachable from Cloudflare's edge.

**Required:** set `DATABASE_URL` (see Secrets) to that connection string. `pg` +
`@prisma/adapter-pg` + `pg-cloudflare` connect from the Worker. `src/lib/db.ts`
resolves the connection lazily per request, so nothing else is needed for a
working connection.

**Recommended for serverless Postgres — Hyperdrive pooling:** serverless databases
throttle raw connections, so pool them at the edge with Hyperdrive. `db.ts` already
prefers the `HYPERDRIVE` binding automatically when it is present — no code change.

```bash
npx wrangler hyperdrive create vidyalaya-db \
  --connection-string "postgres://USER:PASSWORD@HOST:5432/DBNAME"
# then uncomment the `hyperdrive` block in wrangler.jsonc and paste the returned id
```

Keep `DATABASE_URL` set even when using Hyperdrive — it satisfies the production
boot check and is the fallback if the binding is ever absent.

**Migrations** are run from your machine against the database directly (not from the
Worker): `DATABASE_URL="postgres://…" npm run db:deploy`.

---

## 2. Secrets

Never put secrets in `wrangler.jsonc`. Set them once per environment:

```bash
npx wrangler secret put DATABASE_URL        # Hyperdrive or Postgres connection string
npx wrangler secret put AUTH_SECRET         # 32+ char random string
npx wrangler secret put ANTHROPIC_API_KEY   # for AI features (optional)
# SMTP_* / mail secrets — see Email below
```

Non-secret config (like `APP_URL`) lives in `wrangler.jsonc` under `vars` — update
it to your real URL/custom domain before deploying.

---

## 3. Email (HTTP — Resend)

Email now sends over HTTPS via **Resend** (`src/lib/notifications.ts`), so it runs
on Workers — no SMTP sockets. Configure:

```bash
npx wrangler secret put RESEND_API_KEY
# EMAIL_FROM is a var (must be a verified Resend sender); set it in wrangler.jsonc
# or as a secret, e.g. "Your School <no-reply@yourschool.com>"
```

With no key set, email falls back to console logging (same as dev) and the other
channels (SMS/WhatsApp/push) are unaffected. To use a different provider
(MailChannels, Postmark, SES v2), swap the single `fetch` in `sendEmail`.

---

## 4. File uploads (in the database)

Uploads (student/staff photos, homework attachments) are stored in the **database**
via `src/lib/storage.ts` (the `uploads` table) and served by the
`/uploads/[...path]` route — **no object store to provision, no extra cost**. The
same `npm run db:deploy` that creates the schema creates this table.

Suited to a school's photos and attachments (a few MB each). If uploads ever grow
into the many-GB range, switch `storage.ts` to R2/S3 — nothing else changes.

---

## 5. Build, preview, deploy

```bash
npm run preview   # build + run the Worker locally in workerd (real runtime)
npm run deploy    # build + upload to Cloudflare  → https://vidyalaya-erp.workers.dev
```

`npm run dev` still runs the normal Next dev server, now with Cloudflare bindings
wired in via `initOpenNextCloudflareForDev()`.

Regenerate binding types after changing `wrangler.jsonc`: `npm run cf-typegen`.

---

## 6. Custom domain

Add a route in `wrangler.jsonc` (or the dashboard) and update `APP_URL`:

```jsonc
"routes": [{ "pattern": "app.yourschool.com", "custom_domain": true }]
```

---

## Deploy checklist

- [ ] `wrangler login`
- [ ] Hyperdrive created; `DATABASE_URL` secret set
- [ ] `AUTH_SECRET` (and `ANTHROPIC_API_KEY` if used) set
- [ ] `npm run db:deploy` run against the production database
- [ ] `RESEND_API_KEY` + `EMAIL_FROM` set (if email is needed)
- [ ] `APP_URL` updated to the real URL
- [ ] `npm run deploy`
