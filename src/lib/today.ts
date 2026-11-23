import "server-only";
import type { Ctx } from "@/lib/current";
import { addDaysISO, daysBetween, hourInTz, monthKey, monthEnd, monthStart } from "@/lib/dates";
import { availableAfterCommitments, recordedSpendingCash, type Availability, type SpendingCash } from "@/lib/money/measures";
import { getBudgetPlan, resolvePeriod, type BudgetPlan } from "@/lib/money/budget";
import { listAccounts } from "@/lib/money/accounts";
import { receivablesSummary, type Receivables } from "@/lib/business/documents";
import { listProjects } from "@/lib/business/projects";
import { listClients } from "@/lib/business/clients";
import { incomeTotal } from "@/lib/money/transactions";
import { buildAgenda, type AgendaItem } from "@/lib/agenda";
import { fmtMoney } from "@/lib/money/format";
import { listSchedules } from "@/lib/money/paydays";
import { listBills } from "@/lib/money/bills";

export type Priority = {
  id: string;
  workspace: "personal" | "business";
  title: string;
  reason: string;
  href: string;
  action: { label: string; kind: "link" | "complete_task" | "open_pay_bill" | "open_payment" | "snooze_followup"; id?: string };
  severity: 1 | 2 | 3; // 1 = most urgent
  amountMinor?: number | null;
  currency?: string | null;
};

export type TodayData = {
  dayPart: string;
  summaryLine: string;
  priorities: Priority[];
  agenda: AgendaItem[];
  nextSetupStep: { text: string; href: string; cta: string } | null;
  personal: null | { cash: SpendingCash; availability: Availability; budget: BudgetPlan | null; nearLimit: { categoryId: string; name: string; remainingMinor: number }[] };
  business: null | { cash: SpendingCash; receivables: Receivables; waiting: { id: string; name: string; waitingSince: string | null }[]; collectedMonthDop: number; collectedMissing: number };
};

/** Rule-based ranking: overdue money first, then overdue tasks/follow-ups, then due-soon items. */
export function rankPriorities(agenda: AgendaItem[], today: string): Priority[] {
  const out: Priority[] = [];
  for (const a of agenda) {
    if (a.status === "done") continue;
    const days = daysBetween(today, a.date);
    const overdue = days < 0;
    const soon = days >= 0 && days <= 2;
    if (!overdue && !soon) continue;
    const when = overdue ? `${-days} day${days === -1 ? "" : "s"} overdue` : days === 0 ? "due today" : days === 1 ? "due tomorrow" : `due in ${days} days`;
    const money = a.amountMinor != null && a.currency ? fmtMoney(a.amountMinor, a.currency) : null;
    let sev: 1 | 2 | 3 = 3;
    let reason = when;
    let action: Priority["action"] = { label: a.nextAction, kind: "link" };
    switch (a.kind) {
      case "invoice":
        sev = overdue ? 1 : 2;
        reason = `${money} ${when}. Unpaid client invoices slow your cash.`;
        action = { label: "Record payment", kind: "open_payment", id: a.ref.id };
        break;
      case "bill":
        sev = overdue ? 1 : 2;
        reason = `${money} ${when}. Paying on time protects your available cash figure.`;
        action = { label: "Mark paid", kind: "open_pay_bill", id: a.ref.id };
        break;
      case "task":
        sev = overdue ? 2 : 3;
        reason = `Task ${when}${a.detail && a.detail !== "Task" ? ` · ${a.detail}` : ""}.`;
        action = { label: "Mark done", kind: "complete_task", id: a.ref.id };
        break;
      case "followup":
        sev = overdue ? 2 : 3;
        reason = `${a.detail}. Follow-up ${when}.`;
        action = { label: "Open", kind: "link" };
        break;
      case "milestone":
        sev = overdue ? 2 : 3;
        reason = `Target ${when}. ${a.detail}.`;
        break;
      case "installment":
        sev = 3;
        reason = `${money} scheduled ${when} and still to invoice.`;
        break;
      case "payday":
        continue; // informational
      case "event":
        if (days !== 0) continue;
        sev = 3;
        reason = `${a.time ? `At ${a.time}` : "Today"}${a.detail ? ` · ${a.detail}` : ""}.`;
        break;
    }
    out.push({ id: a.id, workspace: a.workspace, title: a.title, reason, href: a.href, action, severity: sev, amountMinor: a.amountMinor, currency: a.currency });
  }
  return out.sort((x, y) => x.severity - y.severity).slice(0, 3);
}

export async function getToday(ctx: Ctx): Promise<TodayData> {
  const { user, view, today } = ctx;
  const hour = hourInTz(user.timezone);
  const dayPart = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const agendaAll = await buildAgenda(ctx, addDaysISO(today, -45), addDaysISO(today, 7));
  const agenda = agendaAll.filter((a) => a.date >= today || a.status === "overdue");
  const priorities = rankPriorities(agendaAll, today);

  let personal: TodayData["personal"] = null;
  let business: TodayData["business"] = null;
  const summaryParts: string[] = [];

  if (view === "personal" || view === "combined") {
    const availability = await availableAfterCommitments(user.id, "personal", today);
    // Prefer the current paycheck plan; fall back to the month plan when no paycheck allocations exist.
    const paycheck = await resolvePeriod(user.id, "personal", { type: "paycheck", date: today });
    let budget = paycheck ? await getBudgetPlan(user.id, "personal", paycheck) : null;
    if (!budget || budget.totals.targetMinor === 0) {
      const month = await resolvePeriod(user.id, "personal", { type: "month", month: monthKey(today) });
      budget = month ? await getBudgetPlan(user.id, "personal", month) : budget;
    }
    const nearLimit = (budget?.lines ?? [])
      .filter((l) => l.availableMinor > 0 && (l.remainingMinor < 0 || l.remainingMinor / l.availableMinor <= 0.15))
      .sort((a, b) => a.remainingMinor - b.remainingMinor)
      .slice(0, 4)
      .map((l) => ({ categoryId: l.categoryId, name: l.name, remainingMinor: l.remainingMinor }));
    personal = { cash: availability.cash, availability, budget: budget && budget.totals.targetMinor > 0 ? budget : null, nearLimit };
    summaryParts.push(`${fmtMoney(availability.availableMinor)} available after commitments`);
  }
  if (view === "business" || view === "combined") {
    const [cash, receivables, projects, income] = await Promise.all([
      recordedSpendingCash(user.id, "business"),
      receivablesSummary(user.id, today),
      listProjects(user.id, { status: "open" }),
      incomeTotal(user.id, "business", monthStart(monthKey(today)), monthEnd(monthKey(today))),
    ]);
    const waiting = projects
      .filter((p) => p.waitingOnClient || p.status === "waiting_client")
      .map((p) => ({ id: p.id, name: p.name, waitingSince: p.waitingSince }));
    business = { cash, receivables, waiting, collectedMonthDop: income.dopMinor, collectedMissing: income.missingCount };
    const outstanding = Object.entries(receivables.outstandingByCurrency).map(([c, v]) => fmtMoney(v, c)).join(" + ");
    summaryParts.push(outstanding ? `${outstanding} outstanding from clients${receivables.overdueCount ? ` (${receivables.overdueCount} overdue)` : ""}` : "no open client invoices");
  }

  // Next useful setup step
  let nextSetupStep: TodayData["nextSetupStep"] = null;
  const accounts = await listAccounts(user.id);
  if (!accounts.length) nextSetupStep = { text: "Add your first account to start tracking cash.", href: "/money/accounts", cta: "Add account" };
  else if ((view === "personal" || view === "combined") && !(await listSchedules(user.id, "personal")).length && !(await listBills(user.id, "personal")).length) nextSetupStep = { text: "Add a payday or a recurring bill so Today can show what is due before payday.", href: "/money/bills", cta: "Add payday or bill" };
  else if ((view === "personal" || view === "combined") && personal && !personal.budget) nextSetupStep = { text: "Set a budget for this month to see category headroom here.", href: "/money/budget", cta: "Set budget" };
  else if ((view === "business" || view === "combined") && !(await listClients(user.id)).length) nextSetupStep = { text: "Add your first client or prospect to start the Adsvio workspace.", href: "/add/client", cta: "Add client" };

  return { dayPart, summaryLine: summaryParts.join(" · ") || "Here is what needs your attention.", priorities, agenda, nextSetupStep, personal, business };
}
