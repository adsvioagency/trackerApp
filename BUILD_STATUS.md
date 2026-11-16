# Build status

Last updated: 2026-11-16 · All five stages complete · `npm test`: 23/23 passing · `npm run lint`, `npm run typecheck` and `npm run build` are clean.

## Stage 1: Foundation ✅
- Email-code sign-in with an owner allowlist, sign-out, 30-day httpOnly sessions, and a branded sign-in page with the wordmark.
- Personal / Business / Combined switcher that remembers your last choice. Mobile tabs per workspace, desktop sidebar, and a thumb-reachable **+ Add** button.
- Light/Dark/System theme that persists across reloads, Mango & Ink tokens, visible keyboard focus, reduced motion, and no sideways scroll at 375–390 px (all main pages checked).
- Onboarding (timezone, first account, payday/bill, client/project) that you can skip; Today shows the next setup step.
- Embedded Postgres (PGlite) with auto-migration; Postgres/Supabase through `DATABASE_URL`.
- **Verified in browser:** sign-in through a console code, onboarding, and Today on phone and desktop in light and dark. Signed-out requests to pages redirect to sign-in, and `/api/pdf`, `/api/files`, `/api/export` and `/api/cron` return 401 (checked on the production build).

## Stage 2: Money ✅
- One ledger with workspace filters; accounts with opening balances. Income, expenses, linked transfer legs, refunds, splits, debt payments (principal vs interest/fees), and owner contributions/draws.
- Bills and subscriptions with an entry per occurrence and a status; missing days are clamped to the month's last valid day and marked. Paydays, savings goals, debts, and editable category groups.
- Monthly and paycheck budgets (paycheck allocations sit inside the month and are counted once), explicit rollover, planned vs actual, headroom, left to assign, and comparisons.
- Recorded spending cash, budget remaining, and available after commitments are separate figures; the forecast is shown apart.
- DOP reporting with stored original currencies and DOP equivalents you enter; reports are flagged when an equivalent is missing.
- CSV import with column mapping, preview, duplicate detection and a result summary (Google Sheets export guidance included). Export and backup are in Settings.
- **Tests:** Groceries RD$1,200 against RD$5,000 leaves RD$3,800, counted once in the month and paycheck views. Also covered: transfers, credit-card payments, splits and month-end clamping.

## Stage 3: Business ✅
- Searchable CRM with contacts, tap-to-call/email, pipeline stages, estimates kept outside receivables, and archiving.
- Projects with brief, scope, deliverables, editable phases, next action, dependencies, a waiting-on-client flag with a dated follow-up, board and list views, and delivery tracked separately from payment.
- Project finance: agreed, invoiced, outstanding, overdue, scheduled to invoice, received, and left to collect.
- Proposals and invoices: templates, line items, discounts, exclusions, optional maintenance, third-party costs (labeled and excluded), optional taxes, revisions, terms, and numbering. Approval syncs the project. Deposit, milestone, final and full invoices. Values are frozen in a snapshot at issue.
- Branded PDFs (preview, download, print) built from the snapshot; long scopes paginate.
- Payments are idempotent and post one ledger income entry. A USD payment into a DOP account posts the DOP equivalent once.
- **Tests:** a US$1,000 project with a US$500 deposit invoice, paid US$400 (RD$24,000), leaves US$100 on the invoice and US$600 on the project. RD$24,000 is counted once, retrying is a no-op, and the installment appears once. Snapshot values stay unchanged after edits; the multi-page PDF is valid.

## Stage 4: Work & reminders ✅
- Tasks (checklists, recurrence, links), notes (pin, tags, search, private, note → task), calendar (Today/Week/Month/Agenda, with Agenda the default on phones), Activity log, and global search.
- Reminders: a daily email digest to the owner, an in-app history, snooze and mute, ~24 h repeat until resolved, deduplication on retries, and labeled test sends. Real delivery stays off until configured. Cron route plus a `vercel.json` schedule.
- **Tests (controlled clock):** nothing before the send hour; one digest; no duplicate on retry; a repeat after 24 h; reminders stop after completion. Also tested: test sends leave state unchanged, delivery-off runs are recorded in-app only, and editing a due date at its source moves the agenda entry.

## Stage 5: Assistant ✅
- `/assistant` shows a rule-based Today briefing (no AI) and keeps conversations.
- Without an API key, built-in rules answer the example questions: focus, who owes money, blocked projects, subscription costs, spending by category, availability, and tasks.
- With `ANTHROPIC_API_KEY`, Claude (`claude-opus-5-5`) answers. It reads data through owner-scoped tools and quotes the app's computed numbers. Refusals are handled, and the app falls back to rules if the API fails. The key stays on the server.
- The assistant can propose task create/update, project follow-up/next action and note changes. Each comes with a before/after preview and is applied only when you press **Apply** (idempotent, logged in Activity as "assistant"). It cannot move money, record payments or contact clients.
- Private notes are excluded from search and context unless you attach them. You can attach notes to a conversation and save any reply as a note.
- **Tests:** a proposal changes nothing until applied; applying twice applies once; rejected proposals never apply; other owners' records and unsupported actions are refused; private notes are excluded; rule answers match the records.
- **Verified in browser (demo data):** the subscription answer "US$26.99 + RD$450.00 a month" matches the seeded bills, and the phone layout has no sideways scroll.

## Demo environment ✅
`npm run demo` (port 3001, `./data/demo`). The first demo sign-in seeds fictional data; `npm run demo:seed -- --reset` starts it over. Demo mode never sends email.

## Needs your credentials or a deployment (not done for you)
- **Shared phone + desktop data:** a Supabase/Postgres `DATABASE_URL`, then `npm run db:migrate`.
- **Real email** (sign-in codes on your phone, reminders): a Resend account, a verified domain, and `RESEND_API_KEY`. Then set `REMINDERS_DELIVERY=on` and enable reminders in Settings.
- **Hosting and the reminder schedule:** a Vercel project with the environment variables. The cron in `vercel.json` runs once deployed.
- **AI answers:** `ANTHROPIC_API_KEY`. The Claude path has not been exercised against the live API in this environment (no key here); the rule-based path and the approve-to-apply flow are tested.
- **Cloud file storage:** a private Supabase bucket and `STORAGE_DRIVER=supabase`. Not exercised without credentials.

## Known gaps and notes
- In development, the browser console shows a "script tag" notice from the no-flash theme script. It is harmless: the script runs on first load as intended.
- Next.js allows one dev server per folder, so `npm run dev` and `npm run demo` can't run at the same time.
- With the embedded database, stop the server before running CLI scripts (`db:migrate`, `cron:tick`, `demo:seed`).
- Google Sheets is supported through CSV export and import; there is no live Sheets connection.
