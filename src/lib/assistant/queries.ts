import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Ctx } from "@/lib/current";
import type { WorkspaceView } from "@/lib/settings";
import { getToday } from "@/lib/today";
import { buildAgenda } from "@/lib/agenda";
import { addDaysISO, monthEnd, monthStart, monthKey } from "@/lib/dates";
import { receivablesSummary, listInvoices } from "@/lib/business/documents";
import { listProjects, projectFinance } from "@/lib/business/projects";
import { listClients } from "@/lib/business/clients";
import { spendingByCategory } from "@/lib/money/transactions";
import { getCategoryIndex } from "@/lib/money/categories";
import { listBills } from "@/lib/money/bills";
import { listTasks } from "@/lib/tasks";
import { listNotes } from "@/lib/notes";
import { fmtMoney } from "@/lib/money/format";
import { availableAfterCommitments } from "@/lib/money/measures";

/**
 * Read-only, owner-scoped structured queries. Every number here is computed by
 * the app; the assistant only phrases what these return.
 */

const money = (minor: number, currency: string) => fmtMoney(minor, currency);
const wsOf = (ctx: Ctx, ws?: string): WorkspaceView => (ws === "personal" || ws === "business" || ws === "combined" ? ws : ctx.view);

export async function qFocus(ctx: Ctx) {
  const t = await getToday(ctx);
  return {
    today: ctx.today,
    workspace: ctx.view,
    summary: t.summaryLine,
    priorities: t.priorities.map((p) => ({ title: p.title, reason: p.reason, workspace: p.workspace, link: p.href, amount: p.amountMinor != null && p.currency ? money(p.amountMinor, p.currency) : null })),
    nextSevenDays: t.agenda.slice(0, 15).map((a) => ({ date: a.date, kind: a.kind, workspace: a.workspace, title: a.title, detail: a.detail, nextAction: a.nextAction, status: a.status, amount: a.amountMinor != null && a.currency ? money(a.amountMinor, a.currency) : null, link: a.href })),
    setupStep: t.nextSetupStep?.text ?? null,
  };
}

export async function qReceivables(ctx: Ctx) {
  const r = await receivablesSummary(ctx.user.id, ctx.today);
  const fmtMap = (m: Record<string, number>) => Object.entries(m).filter(([, v]) => v).map(([c, v]) => money(v, c));
  const projects = await listProjects(ctx.user.id, { status: "open" });
  const scheduled: { project: string; client: string; scheduledToInvoice: string }[] = [];
  for (const p of projects) {
    const f = await projectFinance(ctx.user.id, p.id);
    if (f.scheduledToInvoiceMinor > 0) scheduled.push({ project: p.name, client: p.clientName, scheduledToInvoice: money(f.scheduledToInvoiceMinor, p.currency) });
  }
  return {
    outstandingTotal: fmtMap(r.outstandingByCurrency),
    overdueTotal: fmtMap(r.overdueByCurrency),
    overdueCount: r.overdueCount,
    openInvoices: r.open.map((i) => ({ number: i.number, client: i.clientName, title: i.title, dueDate: i.dueDate, balance: money(i.balanceMinor, i.currency), overdue: i.overdue, link: `/documents/invoices/${i.id}` })),
    notYetInvoiced: scheduled,
    note: "Estimates and planned installments are not receivables until invoiced.",
  };
}

export async function qProjects(ctx: Ctx, opts: { search?: string } = {}) {
  const db = await getDb();
  const projects = await listProjects(ctx.user.id, { status: "open", search: opts.search });
  const ids = projects.map((p) => p.id);
  const deps = ids.length ? await db.query.projectDependencies.findMany({ where: and(inArray(schema.projectDependencies.projectId, ids), eq(schema.projectDependencies.status, "pending")) }) : [];
  const openTasks = ids.length ? await listTasks(ctx.user.id, { workspace: "business", status: "open" }) : [];
  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    client: p.clientName,
    status: p.status,
    phase: p.currentPhase?.name ?? null,
    progressPct: p.progressPct,
    targetDate: p.targetDate,
    nextAction: p.nextAction,
    waitingOnClient: p.waitingOnClient,
    waitingSince: p.waitingSince,
    waitingNote: p.waitingNote,
    followUpDate: p.followUpDate,
    pendingFromClient: deps.filter((d) => d.projectId === p.id).map((d) => ({ item: d.title, requestedOn: d.requestedOn, dueDate: d.dueDate })),
    overdueTasks: openTasks.filter((t) => t.projectId === p.id && t.dueDate && t.dueDate < ctx.today).map((t) => ({ title: t.title, dueDate: t.dueDate })),
    link: `/projects/${p.id}`,
  }));
}

export async function qSpending(ctx: Ctx, input: { from?: string; to?: string; workspace?: string }) {
  const ws = wsOf(ctx, input.workspace);
  const from = input.from ?? monthStart(monthKey(ctx.today));
  const to = input.to ?? monthEnd(monthKey(ctx.today));
  const s = await spendingByCategory(ctx.user.id, ws, from, to);
  const cats = await getCategoryIndex(ctx.user.id);
  const lines = [...s.lines.values()]
    .sort((a, b) => b.dopMinor - a.dopMinor)
    .map((l) => ({ category: l.categoryId ? (cats.get(l.categoryId)?.name ?? "Unknown") : "Uncategorized", spent: money(l.dopMinor, "DOP"), missingDopEquivalents: l.missingCount || undefined }));
  return { workspace: ws, from, to, total: money(s.totalDop, "DOP"), incomplete: s.missingCount > 0 ? `${s.missingCount} foreign-currency item(s) have no DOP equivalent, so totals are incomplete.` : null, lines, note: "Internal transfers are excluded." };
}

const PER_MONTH: Record<string, number> = { weekly: 52 / 12, biweekly: 26 / 12, semimonthly: 2, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };

export async function qSubscriptions(ctx: Ctx, input: { workspace?: string }) {
  const ws = wsOf(ctx, input.workspace);
  const bills = (await listBills(ctx.user.id, ws)).filter((b) => b.active);
  const subs = bills.filter((b) => b.isSubscription);
  const monthly: Record<string, number> = {};
  const rows = subs.map((b) => {
    const perMonth = Math.round(b.amountMinor * ((PER_MONTH[b.frequency] ?? 1) / Math.max(1, b.interval ?? 1)));
    monthly[b.currency] = (monthly[b.currency] ?? 0) + perMonth;
    return { name: b.name, workspace: b.workspace, amount: money(b.amountMinor, b.currency), frequency: b.frequency, monthlyEquivalent: money(perMonth, b.currency) };
  });
  return {
    workspace: ws,
    subscriptions: rows,
    monthlyTotal: Object.entries(monthly).map(([c, v]) => money(v, c)),
    yearlyTotal: Object.entries(monthly).map(([c, v]) => money(v * 12, c)),
    otherRecurringBills: bills.filter((b) => !b.isSubscription).map((b) => ({ name: b.name, amount: money(b.amountMinor, b.currency), frequency: b.frequency })),
  };
}

export async function qTasks(ctx: Ctx, input: { workspace?: string; dueTo?: string; search?: string }) {
  const rows = await listTasks(ctx.user.id, { workspace: wsOf(ctx, input.workspace), status: "open", dueTo: input.dueTo, search: input.search, limit: 40 });
  return rows.map((t) => ({ id: t.id, title: t.title, workspace: t.workspace, dueDate: t.dueDate, priority: t.priority, overdue: !!t.dueDate && t.dueDate < ctx.today, project: t.projectName, client: t.clientName, link: `/tasks?task=${t.id}` }));
}

export async function qMoneyOverview(ctx: Ctx) {
  const out: Record<string, unknown> = {};
  for (const ws of ctx.view === "combined" ? (["personal", "business"] as const) : [ctx.view]) {
    const a = await availableAfterCommitments(ctx.user.id, ws, ctx.today);
    out[ws] = {
      recordedSpendingCash: money(a.cash.dopValuedMinor, "DOP"),
      unpaidCommitmentsUntil: a.horizonLabel,
      unpaidBills: money(a.unpaidBillsDopMinor, "DOP"),
      reservedForGoals: money(a.reservedMinor, "DOP"),
      availableAfterCommitments: money(a.availableMinor, "DOP"),
      forecastNotIncluded: { expectedIncome: money(a.forecast.expectedIncomeMinor, "DOP"), projected: money(a.forecast.projectedMinor, "DOP") },
      accountsWithoutDopValue: a.cash.unvaluedAccounts.map((x) => x.name),
    };
  }
  return out;
}

export async function qAgenda(ctx: Ctx, input: { from?: string; to?: string }) {
  const from = input.from ?? ctx.today;
  const to = input.to ?? addDaysISO(ctx.today, 14);
  const items = await buildAgenda(ctx, from, to);
  return items.slice(0, 40).map((a) => ({ date: a.date, time: a.time ?? null, kind: a.kind, workspace: a.workspace, title: a.title, detail: a.detail, status: a.status, amount: a.amountMinor != null && a.currency ? money(a.amountMinor, a.currency) : null }));
}

/** Search. Private notes are never returned here — only via explicit attachment. */
export async function qSearch(ctx: Ctx, input: { query: string }) {
  const q = input.query.trim();
  if (!q) return { clients: [], projects: [], tasks: [], notes: [] };
  const [clients, projects, tasks, notes] = await Promise.all([
    listClients(ctx.user.id, { search: q }),
    listProjects(ctx.user.id, { status: "all", search: q }),
    listTasks(ctx.user.id, { workspace: ctx.view, status: "all", search: q, limit: 10 }),
    listNotes(ctx.user.id, { workspace: ctx.view, search: q, limit: 10 }),
  ]);
  return {
    clients: clients.slice(0, 10).map((c) => ({ id: c.id, company: c.company, contact: c.contactName, status: c.status, stage: c.pipelineStage })),
    projects: projects.slice(0, 10).map((p) => ({ id: p.id, name: p.name, client: p.clientName, status: p.status })),
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, dueDate: t.dueDate })),
    notes: notes.filter((n) => !n.isPrivate).map((n) => ({ id: n.id, title: n.title, excerpt: n.body.slice(0, 160) })),
  };
}

export async function qInvoicesForClient(ctx: Ctx, clientId: string) {
  return (await listInvoices(ctx.user.id, { clientId, status: "all", today: ctx.today })).map((i) => ({ number: i.number, status: i.status, total: money(i.totalMinor, i.currency), balance: money(i.balanceMinor, i.currency), dueDate: i.dueDate }));
}

/** Only notes the owner attached to this conversation (private ones included, by choice). */
export async function qAttachedNotes(userId: string, noteIds: string[]) {
  if (!noteIds.length) return [];
  const db = await getDb();
  const rows = await db.query.notes.findMany({ where: and(eq(schema.notes.userId, userId), inArray(schema.notes.id, noteIds)) });
  return rows.map((n) => ({ id: n.id, title: n.title, body: n.body.slice(0, 4000), private: n.isPrivate }));
}
