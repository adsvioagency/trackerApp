# Personal Assistant System

A private web app for running personal finances and Adsvio Agency in one place:
Today briefing, money (ledger, budgets, bills, paydays, goals, debt, reports,
CSV import), clients, projects, proposals and invoices with PDFs, tasks, notes,
calendar, email reminders, and an assistant that can suggest changes but only
applies them when you approve.

One owner account. Everything works the same on phone and desktop.

---

## 1. Run it on your computer

Requirements: **Node.js 20+** (tested on Node 24) and **Git for Windows** (the
npm scripts run through Git Bash because the folder path contains `&`).

```bash
npm install
cp .env.example .env.local      # then edit .env.local (see section 3)
npm run dev                     # http://localhost:3000
```

With `DATABASE_URL` empty, the app uses an **embedded Postgres (PGlite)** stored
in `./data/live/pglite`. It creates the tables on first start. No database
server needed.

**Signing in locally:** enter an email listed in `OWNER_EMAILS`. With
`EMAIL_TRANSPORT=console`, the 6-digit code is printed in the terminal running
`npm run dev` (and shown on screen when `AUTH_DEV_SHOW_CODE=true`). Copies of
every email go to `./data/live/outbox`; list them with `npm run outbox`.

### Demo environment (fictional data, no email)

```bash
npm run demo                    # http://localhost:3001
```

Click **Enter the demo**. The first demo sign-in fills `./data/demo` with
fictional clients, projects, invoices, bills and budgets. It is completely
separate from your real data, and demo mode never sends email.

- Start over: stop the demo server, then `npm run demo:seed -- --reset`.
- Next.js allows only one dev server per folder, so stop `npm run dev` before
  `npm run demo` (and the other way round).

### Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Live app in development mode (port 3000) |
| `npm run demo` | Demo app (port 3001, `./data/demo`) |
| `npm run build` then `npm start` | Production build and server |
| `npm test` | Automated acceptance tests (in-memory database, fictional data) |
| `npm run lint` / `npm run typecheck` | Code checks |
| `npm run db:migrate` | Apply database migrations (needed for an external Postgres) |
| `npm run cron:tick` | Run the reminder schedule once (`-- --dry` previews only) |
| `npm run outbox` | Show emails written by the console transport (`-- --demo` for demo) |

When using the embedded database, stop the running server before running
`db:migrate`, `cron:tick` or `demo:seed` from another terminal, so two
processes don't open the same database files.

---

## 2. Stack and why

| Piece | Choice | Why |
|---|---|---|
| App | Next.js 16 (App Router, server actions), React 19, TypeScript | One codebase for phone and desktop; all data access stays on the server |
| Styling | Tailwind CSS 4 with Adsvio tokens, Bricolage Grotesque + Inter | Mango & Ink identity, light/dark/system themes |
| Database | Postgres via Drizzle ORM; embedded PGlite when no URL is set | Real SQL and migrations; zero setup locally; Supabase or any Postgres in production |
| PDFs | `@react-pdf/renderer` (server-side, fonts embedded) | Branded proposals and invoices with clean page breaks |
| Email | Console transport (local) or Resend | Sign-in codes and reminders; nothing is sent until you configure it |
| AI (optional) | Official Anthropic SDK, model `claude-opus-5-5` | Answers questions using structured, owner-scoped queries |
| Tests | Vitest with an in-memory database | Acceptance checks run without touching your data |

Money is stored as integer minor units (cents/centavos). Each transaction keeps
its original currency; DOP is the reporting currency, and foreign-currency
items use the DOP equivalent you enter. Reports say when an equivalent is missing.

---

## 3. Configuration (`.env.local` locally, or your hosting provider's settings)

Never commit real values. `.env*` files are git-ignored (except `.env.example`).

| Variable | Needed for | Notes |
|---|---|---|
| `APP_URL` | Links in emails/PDFs | e.g. `https://your-app.vercel.app` |
| `APP_MODE` | — | `live` (default) or `demo` |
| `APP_TIMEZONE` | Dates, paydays, reminders | Default `America/Santo_Domingo` |
| `OWNER_EMAILS` | Sign-in | Comma-separated allowlist. Anyone else is refused. |
| `APP_SECRET` | Sessions and sign-in codes | 32+ random characters. Generate a new one for production. |
| `DATABASE_URL` | Shared data across devices | Empty = embedded PGlite. See section 4. |
| `EMAIL_TRANSPORT` | Sign-in and reminder email | `console` or `resend` |
| `EMAIL_FROM`, `RESEND_API_KEY` | Real email | Sender must be on a domain verified in Resend |
| `AUTH_DEV_SHOW_CODE` | Local convenience | Ignored in production |
| `REMINDERS_DELIVERY` | Real reminder email | Stays `off` until you set `on` **and** enable reminders in Settings |
| `CRON_SECRET` | Reminder schedule | The cron route requires `Authorization: Bearer <CRON_SECRET>` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | AI answers (optional) | Without a key the assistant uses built-in rules |
| `STORAGE_DRIVER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | Private file storage in the cloud | `local` keeps files in `./data/<mode>/files` |

---

## 4. Use the same data on phone and desktop (deployment)

Nothing below has been done for you: no accounts were created, nothing was
published, and no paid service was enabled. These are the steps when you are ready.

### 4.1 Database: Supabase (or any Postgres)

1. Create a Supabase project. In **Project Settings → Database → Connection
   string**, copy the **Transaction pooler** URI (port 6543) and add
   `?sslmode=require`.
2. Put it in `DATABASE_URL` (locally in `.env.local` to test, and in your host's settings).
3. Create the tables: `npm run db:migrate`.

### 4.2 Private file storage (optional)

In Supabase **Storage**, create a **private** bucket named `private-files`.
Set `STORAGE_DRIVER=supabase`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
(server only, never expose it in the browser). Files are always served through
`/api/files/<id>`, which checks that you own them.

### 4.3 Email: Resend

Verify your sending domain in Resend, create an API key, then set
`EMAIL_TRANSPORT=resend`, `RESEND_API_KEY`, and `EMAIL_FROM` (an address on
that domain). Sign-in codes go only to emails in `OWNER_EMAILS`.

### 4.4 Hosting: Vercel

1. Push this folder to a private Git repository and import it in Vercel
   (framework preset: Next.js).
2. Add every variable from section 3 in **Project → Settings → Environment
   Variables**. Use a new `APP_SECRET` and `CRON_SECRET`, and set `APP_URL` to the
   deployed URL.
3. Deploy. `vercel.json` schedules `/api/cron/reminders` once a day
   (`0 12 * * *` UTC = 08:00 in Santo Domingo). Vercel sends the `CRON_SECRET`
   automatically. The route is safe to call more often: it only sends at your
   chosen hour, once per day, and retries never send duplicates.
4. On your phone, open the URL, sign in with your email code, and use
   **Share → Add to Home Screen** for an app icon.

Any host that runs Node.js works. Without Vercel Cron, call the cron URL hourly
from any scheduler with the bearer header, or run `npm run cron:tick`.

### 4.5 AI assistant (optional)

Create an API key in the Anthropic Console and set `ANTHROPIC_API_KEY` on the
server. The key never reaches the browser. The assistant reads your records only
through scoped queries (focus, receivables, projects, spending, subscriptions,
tasks, agenda, search). Private notes are excluded unless you attach them to a
conversation. It can propose task, project follow-up and note changes; each
appears with a before/after preview and is applied only when you press
**Apply**, then recorded in Activity. It cannot move money, record payments,
or contact clients.

---

## 5. Your data: export, backup, import

- **Export / backup:** Settings → *Export* downloads a CSV bundle or a full JSON
  backup (owner-only route `/api/export`).
- **Embedded database backup:** stop the app and copy the `./data/live` folder.
- **Import:** Money → *Import* takes a CSV (for example, exported from your
  Google Sheets tracker). Map the columns, review the preview with duplicates
  flagged, and confirm. Nothing is imported until you confirm in the app.

## 6. Privacy notes

- Client reference PDFs and brand source files stay out of this repository and
  out of public assets (`*.pdf` and `Adsvio Brand info/` are git-ignored).
- Tests and the demo use fictional data only.
- Every page, file, PDF and action checks on the server that the signed-in
  owner owns the record.
