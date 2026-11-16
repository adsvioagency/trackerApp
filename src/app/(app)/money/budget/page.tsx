import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getCtx } from "@/lib/current";
import { PageHeader, Card, Money, Notice, EmptyState, Stat } from "@/components/ui";
import { getBudgetPlan, resolvePeriod } from "@/lib/money/budget";
import { listPaydays } from "@/lib/money/paydays";
import { addMonthsISO, fmtDate, fmtMonth, monthKey } from "@/lib/dates";
import { fmtMoney } from "@/lib/money/format";
import { BudgetEditor } from "./budget-editor";
import { PeriodPicker } from "@/components/period-picker";

export const metadata: Metadata = { title: "Budget" };

export default async function BudgetPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { user, view, today } = await getCtx();
  const ws = view === "business" ? "business" : "personal";
  const wantPaycheck = sp.period === "paycheck";
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : monthKey(today);
  const period = wantPaycheck ? ((await resolvePeriod(user.id, ws, { type: "paycheck", date: sp.payday && sp.payday.length === 10 ? sp.payday : today })) ?? (await resolvePeriod(user.id, ws, { type: "month", month }))) : await resolvePeriod(user.id, ws, { type: "month", month });
  const plan = await getBudgetPlan(user.id, ws, period!);
  const paydays = await listPaydays(user.id, ws, addMonthsISO(today, -6), addMonthsISO(today, 1));
  const t = plan.totals;
  const pct = t.availableMinor > 0 ? Math.min(100, Math.round((t.actualMinor / t.availableMinor) * 100)) : 0;
  return (
    <div>
      <PageHeader
        title="Budget"
        description="Monthly plan with paycheck allocations inside it. Each transaction counts once, in the period that contains its date."
        actions={view === "combined" ? <Notice tone="neutral">Budgets are per workspace. Showing Personal.</Notice> : undefined}
      />
      <Suspense>
        <PeriodPicker period={period!.type === "paycheck" ? "paycheck" : "month"} month={plan.period.month} year={today.slice(0, 4)} from={plan.period.from} to={plan.period.to} accounts={[]} showPaycheck paydays={paydays.map((p) => ({ id: p.date, label: `${p.schedule.name} · ${fmtDate(p.date)}` }))} />
      </Suspense>
      {period!.type === "paycheck" && (
        <Notice tone="neutral" className="mb-3">
          Paycheck window {fmtDate(plan.period.from)} to {fmtDate(plan.period.to)} · allocations below are part of {fmtMonth(plan.period.month)}&apos;s plan.
        </Notice>
      )}
      {wantPaycheck && period!.type !== "paycheck" && <Notice tone="warn" className="mb-3">No payday schedule yet, so the month view is shown. <Link href="/money/bills" className="underline">Add a payday</Link> to budget per paycheck.</Notice>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Planned" value={<Money minor={t.targetMinor} />} hint={t.availableMinor !== t.targetMinor ? `${fmtMoney(t.availableMinor)} with rollover` : "Targets for this period"} />
        <Stat label="Spent" value={<Money minor={t.actualMinor} />} hint={`${pct}% of available${t.missingCount ? ` · ${t.missingCount} need DOP values` : ""}`} />
        <Stat label="Remaining" value={<Money minor={t.remainingMinor} />} tone={t.remainingMinor < 0 ? "danger" : t.remainingMinor / Math.max(1, t.availableMinor) < 0.15 ? "warn" : "ok"} hint="Available − spent" />
        <Stat label="Left to assign" value={<Money minor={t.leftToAssignMinor} />} tone={t.leftToAssignMinor < 0 ? "danger" : undefined} hint={`Expected income ${fmtMoney(t.expectedIncomeMinor)} − planned`} />
      </div>
      {t.uncategorizedMinor > 0 && <Notice tone="warn" className="mt-3">{fmtMoney(t.uncategorizedMinor)} of spending in this period has no category. <Link href={`/money/transactions?period=custom&from=${plan.period.from}&to=${plan.period.to}`} className="underline">Review transactions</Link></Notice>}

      <div className="mt-5">
        {plan.lines.length === 0 ? (
          <Card><EmptyState title="No categories" body="Add categories first, then set targets." action={<Link href="/money/categories" className="btn btn-primary btn-sm">Categories</Link>} /></Card>
        ) : (
          <BudgetEditor plan={plan} workspace={ws} />
        )}
      </div>
    </div>
  );
}
