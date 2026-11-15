import "server-only";
import type { Ctx } from "@/lib/current";
import type { WorkspaceView } from "@/lib/settings";
import { listBillOccurrences } from "@/lib/money/bills";
import { listPaydays } from "@/lib/money/paydays";
import { tasksInRange } from "@/lib/tasks";
import { eventsBetween } from "@/lib/events";
import { listInvoices } from "@/lib/business/documents";
import { listProjects } from "@/lib/business/projects";
import { listClients } from "@/lib/business/clients";
import { dateInTz, zonedDateTimeToUtc } from "@/lib/dates";
import { getDb, schema } from "@/db";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";

export type AgendaKind = "bill" | "payday" | "task" | "event" | "invoice" | "milestone" | "followup" | "installment";

export type AgendaItem = {
  id: string;
  kind: AgendaKind;
  workspace: "personal" | "business";
  date: string; // YYYY-MM-DD in owner tz
  time?: string | null; // HH:MM
  sortKey: string;
  title: string;
  detail: string; // what/when context
  nextAction: string;
  href: string;
  amountMinor?: number | null;
  currency?: string | null;
  status: "open" | "done" | "overdue" | "info";
  /** source record for inline actions */
  ref: { type: string; id: string };
};

/**
 * Unified agenda from existing records. Dates are edited at the source; the
 * agenda is always derived, so every view stays in sync.
 */
export async function buildAgenda(ctx: Ctx, from: string, to: string, view: WorkspaceView = ctx.view): Promise<AgendaItem[]> {
  const { user, today, tz } = ctx;
  const items: AgendaItem[] = [];
  const wsFilter = (ws: "personal" | "business") => view === "combined" || view === ws;

  // Bills
  const occ = await listBillOccurrences(user.id, view, from, to);
  for (const o of occ) {
    if (o.status === "skipped") continue;
    items.push({
      id: `bill:${o.id}`,
      kind: "bill",
      workspace: o.bill.workspace,
      date: o.dueDate,
      sortKey: `${o.dueDate}T06`,
      title: o.bill.name,
      detail: `${o.bill.isSubscription ? "Subscription" : "Bill"} due${o.clamped ? " (moved to the month's last day)" : ""}`,
      nextAction: o.status === "paid" ? "Paid" : "Mark paid",
      href: `/money/bills?occ=${o.id}`,
      amountMinor: o.amountMinor,
      currency: o.bill.currency,
      status: o.status === "paid" ? "done" : o.dueDate < today ? "overdue" : "open",
      ref: { type: "bill_occurrence", id: o.id },
    });
  }
  // Paydays
  const pays = await listPaydays(user.id, view, from, to);
  for (const p of pays) {
    if (p.status === "skipped") continue;
    items.push({
      id: `payday:${p.id}`,
      kind: "payday",
      workspace: p.schedule.workspace,
      date: p.date,
      sortKey: `${p.date}T05`,
      title: p.schedule.name,
      detail: `Payday${p.clamped ? " (moved to the month's last day)" : ""}`,
      nextAction: p.status === "received" ? "Received" : "Mark received",
      href: `/money/bills?payday=${p.id}`,
      amountMinor: p.amountMinor,
      currency: p.schedule.currency,
      status: p.status === "received" ? "done" : "info",
      ref: { type: "payday", id: p.id },
    });
  }
  // Tasks
  const tasks = await tasksInRange(user.id, view, from, to);
  for (const t of tasks) {
    if (t.status === "cancelled") continue;
    items.push({
      id: `task:${t.id}`,
      kind: "task",
      workspace: t.workspace,
      date: t.dueDate!,
      time: t.dueTime,
      sortKey: `${t.dueDate}T${t.dueTime ?? "09:00"}`,
      title: t.title,
      detail: [t.projectName, t.clientName, t.priority === "high" ? "High priority" : null].filter(Boolean).join(" · ") || "Task",
      nextAction: t.status === "done" ? "Done" : "Mark done",
      href: `/tasks?task=${t.id}`,
      status: t.status === "done" ? "done" : t.dueDate! < today ? "overdue" : "open",
      ref: { type: "task", id: t.id },
    });
  }
  // Events
  const evs = await eventsBetween(user.id, view, zonedDateTimeToUtc(from, "00:00", tz), zonedDateTimeToUtc(to, "23:59", tz));
  for (const e of evs) {
    const d = dateInTz(e.startAt, tz);
    const time = e.allDay ? null : new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(e.startAt);
    items.push({
      id: `event:${e.id}`,
      kind: "event",
      workspace: e.workspace,
      date: d,
      time,
      sortKey: `${d}T${time ?? "08:00"}`,
      title: e.title,
      detail: [e.workspace === "business" ? "Meeting" : "Appointment", e.location].filter(Boolean).join(" · "),
      nextAction: "Open",
      href: `/calendar?event=${e.id}`,
      status: "info",
      ref: { type: "event", id: e.id },
    });
  }
  if (wsFilter("business")) {
    // Invoice due dates
    const invoices = await listInvoices(user.id, { status: "all", today });
    for (const i of invoices) {
      if (!i.dueDate || i.dueDate < from || i.dueDate > to || i.status === "void" || i.status === "draft") continue;
      items.push({
        id: `invoice:${i.id}`,
        kind: "invoice",
        workspace: "business",
        date: i.dueDate,
        sortKey: `${i.dueDate}T07`,
        title: `${i.clientName} · ${i.number}`,
        detail: i.status === "paid" ? "Invoice paid" : `Client payment due`,
        nextAction: i.status === "paid" ? "Paid" : "Record payment",
        href: `/documents/invoices/${i.id}`,
        amountMinor: i.status === "paid" ? i.totalMinor : i.balanceMinor,
        currency: i.currency,
        status: i.status === "paid" ? "done" : i.overdue ? "overdue" : "open",
        ref: { type: "invoice", id: i.id },
      });
    }
    // Planned installments without an invoice (expected, not receivable yet)
    const db = await getDb();
    const inst = await db
      .select({ i: schema.projectInstallments, projectName: schema.projects.name })
      .from(schema.projectInstallments)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.projectInstallments.projectId))
      .where(and(eq(schema.projectInstallments.userId, user.id), eq(schema.projectInstallments.status, "planned"), gte(schema.projectInstallments.dueDate, from), lte(schema.projectInstallments.dueDate, to)));
    for (const r of inst) {
      items.push({
        id: `installment:${r.i.id}`,
        kind: "installment",
        workspace: "business",
        date: r.i.dueDate!,
        sortKey: `${r.i.dueDate}T07:30`,
        title: `${r.projectName} · ${r.i.label}`,
        detail: "Scheduled, still to invoice",
        nextAction: "Create invoice",
        href: `/projects/${r.i.projectId}#payments`,
        amountMinor: r.i.amountMinor,
        currency: r.i.currency,
        status: "info",
        ref: { type: "installment", id: r.i.id },
      });
    }
    // Project target dates, phase targets and follow-ups
    const projects = await listProjects(user.id, { status: "open" });
    for (const p of projects) {
      if (p.targetDate && p.targetDate >= from && p.targetDate <= to) {
        items.push({ id: `milestone:${p.id}`, kind: "milestone", workspace: "business", date: p.targetDate, sortKey: `${p.targetDate}T10`, title: `${p.name} target`, detail: `${p.clientName} · ${p.currentPhase?.name ?? "In progress"}`, nextAction: "Open project", href: `/projects/${p.id}`, status: p.targetDate < today ? "overdue" : "open", ref: { type: "project", id: p.id } });
      }
      for (const ph of p.phases) {
        if (ph.targetDate && !ph.completedAt && ph.targetDate >= from && ph.targetDate <= to) {
          items.push({ id: `phase:${ph.id}`, kind: "milestone", workspace: "business", date: ph.targetDate, sortKey: `${ph.targetDate}T10:30`, title: `${p.name} · ${ph.name}`, detail: "Phase target", nextAction: "Open project", href: `/projects/${p.id}`, status: ph.targetDate < today ? "overdue" : "open", ref: { type: "project", id: p.id } });
        }
      }
      if (p.followUpDate && p.followUpDate >= from && p.followUpDate <= to) {
        items.push({ id: `pfollow:${p.id}`, kind: "followup", workspace: "business", date: p.followUpDate, sortKey: `${p.followUpDate}T09:30`, title: `Follow up: ${p.clientName}`, detail: p.waitingNote ? `Waiting on client · ${p.waitingNote}` : `About ${p.name}`, nextAction: "Follow up", href: `/projects/${p.id}`, status: p.followUpDate < today ? "overdue" : "open", ref: { type: "project_followup", id: p.id } });
      }
    }
    const clients = await listClients(user.id);
    for (const c of clients) {
      if (c.followUpDate && c.followUpDate >= from && c.followUpDate <= to) {
        items.push({ id: `cfollow:${c.id}`, kind: "followup", workspace: "business", date: c.followUpDate, sortKey: `${c.followUpDate}T09:45`, title: `Follow up: ${c.company}`, detail: c.status === "prospect" ? `Prospect · ${c.pipelineStage.replace("_", " ")}` : "Client follow-up", nextAction: "Follow up", href: `/clients/${c.id}`, status: c.followUpDate < today ? "overdue" : "open", ref: { type: "client_followup", id: c.id } });
      }
    }
  }
  return items.filter((i) => wsFilter(i.workspace)).sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
}

export { inArray, asc };
