import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getCtx } from "@/lib/current";
import { PageHeader, Card, Notice, Stat, Money, EmptyState, SectionTitle } from "@/components/ui";
import { resolvePeriodParams } from "@/lib/period";
import { PeriodPicker } from "@/components/period-picker";
import { listAccounts } from "@/lib/money/accounts";
import { getCategoryTree } from "@/lib/money/categories";
import { cashFlowTrend, spendingBreakdown } from "@/lib/money/reports";
import { incomeTotal, listTransactions } from "@/lib/money/transactions";
import { getBudgetPlan, resolvePeriod } from "@/lib/money/budget";
import { SpendingBars, BudgetVsActual, CashFlowChart } from "@/components/charts";
import { fmtMoney } from "@/lib/money/format";
import { addMonthsKey, monthEnd, monthKey, monthStart } from "@/lib/dates";
import { listPayments } from "@/lib/business/payments";
import { listGoals } from "@/lib/money/goals";
import { listDebts } from "@/lib/money/debts";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { user, view, today } = await getCtx();
  const ws = view;
  const period = await resolvePeriodParams(user.id, ws, sp, today);
  const [accounts, tree, breakdown, income, trend] = await Promise.all([
    listAccounts(user.id, ws),
    ws === "combined" ? Promise.resolve(undefined) : getCategoryTree(user.id, ws),
    spendingBreakdown(user.id, ws, period.from, period.to),
    incomeTotal(user.id, ws, period.from, period.to),
    cashFlowTrend(user.id, ws, monthKey(period.to), 6),
  ]);
  const filtered = sp.category ? breakdown.rows.filter((r) => r.categoryId === sp.category) : breakdown.rows;
  const budgetPeriod = ws !== "combined" ? await resolvePeriod(user.id, ws, { type: "month", month: period.month }) : null;
  const plan = budgetPeriod && ws !== "combined" ? await getBudgetPlan(user.id, ws, budgetPeriod) : null;
  const prevMonth = addMonthsKey(period.month, -1);
  const prev = await spendingBreakdown(user.id, ws, monthStart(prevMonth), monthEnd(prevMonth));
  const prevIncome = await incomeTotal(user.id, ws, monthStart(prevMonth), monthEnd(prevMonth));
  const needsDop = await listTransactions(user.id, { workspace: ws, from: period.from, to: period.to, needsDop: true, limit: 50 });
  const payments = ws === "business" ? await listPayments(user.id, { limit: 500 }) : [];
  const collected = payments.filter((p) => p.date >= period.from && p.date <= period.to);
  const [goals, debts] = await Promise.all([listGoals(user.id, ws), listDebts(user.id, ws)]);
  const incomplete = breakdown.missingCount + income.missingCount;
  const net = income.dopMinor - breakdown.totalDop;
  const diff = (a: number, b: number) => (b === 0 ? null : Math.round(((a - b) / b) * 100));

  return (
    <div>
      <PageHeader title="Reports" description="DOP is the reporting currency. Figures use recorded DOP equivalents; anything without one is flagged, never guessed." />
      <Suspense>
        <PeriodPicker period={period.kind} month={period.month} year={period.year} from={period.from} to={period.to} accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} tree={tree} showPaycheck={ws !== "combined"} />
      </Suspense>
      {incomplete > 0 && (
        <Notice tone="warn" className="mb-4">
          Report incomplete: {incomplete} transaction(s) in this period are in another currency without a DOP equivalent. <Link href={`/money/transactions?needsDop=1&period=custom&from=${period.from}&to=${period.to}`} className="underline">Add the values</Link>
        </Notice>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Income" value={<Money minor={income.dopMinor} />} hint={period.kind === "month" && diff(income.dopMinor, prevIncome.dopMinor) !== null ? `${diff(income.dopMinor, prevIncome.dopMinor)! >= 0 ? "+" : ""}${diff(income.dopMinor, prevIncome.dopMinor)}% vs last month` : "Recorded, DOP-valued"} />
        <Stat label="Spending" value={<Money minor={breakdown.totalDop} />} hint={period.kind === "month" && diff(breakdown.totalDop, prev.totalDop) !== null ? `${diff(breakdown.totalDop, prev.totalDop)! >= 0 ? "+" : ""}${diff(breakdown.totalDop, prev.totalDop)}% vs last month` : "Expenses, refunds netted, interest included"} />
        <Stat label="Net" value={<Money minor={net} signed />} tone={net < 0 ? "danger" : "ok"} hint="Transfers and owner movements excluded" />
        {ws === "business" ? (
          <Stat label="Collected from clients" value={<Money minor={collected.reduce((s, p) => s + (p.currency === "DOP" ? p.amountMinor : p.dopEquivalentMinor ?? 0), 0)} />} hint={`${collected.length} payment(s)${collected.filter((p) => p.currency !== "DOP" && p.dopEquivalentMinor == null).length ? " · some need DOP values" : ""}`} href="/documents?tab=invoices" />
        ) : (
          <Stat label="Savings progress" value={goals.length ? `${Math.round(goals.reduce((s, g) => s + g.pct, 0) / goals.length)}%` : "—"} hint={goals.length ? `${goals.length} goal(s) · ${fmtMoney(goals.reduce((s, g) => s + (g.currency === "DOP" ? g.savedMinor : 0), 0))} saved` : "No goals yet"} href="/money/goals" />
        )}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card title="Spending by category">
          <p className="muted mb-3 text-[13px]">{fmtMoney(breakdown.totalDop)} across {filtered.length} categor{filtered.length === 1 ? "y" : "ies"} · {period.label}. Tap a bar to see its transactions.</p>
          {filtered.length ? <SpendingBars rows={filtered.slice(0, 15).map((r) => ({ key: r.categoryId ?? "none", label: r.name, sub: r.groupName, value: r.dopMinor }))} total={breakdown.totalDop} hrefFor={(k) => `/money/transactions?period=custom&from=${period.from}&to=${period.to}${k === "none" ? "" : `&category=${k}`}`} /> : <EmptyState title="No spending in this period" />}
          {breakdown.byGroup.length > 1 && (
            <div className="mt-4">
              <div className="label">By group</div>
              <SpendingBars rows={breakdown.byGroup.map((g) => ({ key: g.groupName, label: g.groupName, value: g.dopMinor, tone: "ink" as const }))} total={breakdown.totalDop} />
            </div>
          )}
        </Card>
        <Card title="Budget vs actual">
          {plan && plan.lines.some((l) => l.targetMinor > 0) ? (
            <>
              <p className="muted mb-3 text-[13px]">Month plan for {period.month}: {fmtMoney(plan.totals.actualMinor)} spent of {fmtMoney(plan.totals.availableMinor)} available.</p>
              <BudgetVsActual rows={plan.lines.filter((l) => l.targetMinor > 0 || l.actualMinor > 0).sort((a, b) => b.actualMinor - a.actualMinor).slice(0, 12).map((l) => ({ key: l.categoryId, label: l.name, planned: l.availableMinor, actual: l.actualMinor }))} hrefFor={(k) => `/money/budget?month=${period.month}#cat-${k}`} />
            </>
          ) : (
            <EmptyState title="No budget for this month" action={<Link href={`/money/budget?month=${period.month}`} className="btn btn-primary btn-sm">Set budget</Link>} />
          )}
        </Card>
      </div>

      <SectionTitle>Cash flow trend</SectionTitle>
      <Card>
        <CashFlowChart points={trend} hrefFor={(m) => `/money/reports?period=month&month=${m}`} />
        {trend.some((t) => t.missing) && <p className="muted mt-2 text-[12px]">Months marked with missing DOP values are understated: {trend.filter((t) => t.missing).map((t) => t.month).join(", ")}.</p>}
      </Card>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card title="Compared with last month">
          <table className="table">
            <thead><tr><th>Category</th><th className="num">{prevMonth}</th><th className="num">{period.month}</th><th className="num">Change</th></tr></thead>
            <tbody>
              {breakdown.rows.slice(0, 10).map((r) => {
                const before = prev.rows.find((x) => x.categoryId === r.categoryId)?.dopMinor ?? 0;
                const d = diff(r.dopMinor, before);
                return (
                  <tr key={r.categoryId ?? "none"}><td>{r.name}</td><td className="num">{fmtMoney(before)}</td><td className="num">{fmtMoney(r.dopMinor)}</td><td className={`num ${d !== null && d > 0 ? "text-danger" : "text-ok"}`}>{d === null ? "new" : `${d > 0 ? "+" : ""}${d}%`}</td></tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        <Card title={ws === "business" ? "Debt" : "Savings and debt progress"}>
          {goals.length + debts.length === 0 ? <EmptyState title="Nothing tracked yet" /> : (
            <ul className="space-y-2 text-[14px]">
              {goals.map((g) => <li key={g.id} className="flex justify-between"><span>{g.name}</span><span className="tnum">{fmtMoney(g.savedMinor, g.currency)} / {fmtMoney(g.targetMinor, g.currency)} · {g.pct}%</span></li>)}
              {debts.map((d) => <li key={d.id} className="flex justify-between"><span>{d.name}</span><span className="tnum text-danger">{fmtMoney(d.owedMinor, d.currency)} owed · {fmtMoney(d.principalPaidMinor, d.currency)} principal paid</span></li>)}
            </ul>
          )}
        </Card>
      </div>
      {needsDop.length > 0 && (
        <Card title="Needs a DOP equivalent" className="mt-5">
          <ul className="space-y-1 text-[14px]">
            {needsDop.map((t) => <li key={t.id}><Link href={`/money/transactions/${t.id}`} className="hover:underline">{t.date} · {t.merchant ?? t.kind} · {fmtMoney(t.amountMinor, t.currency)}</Link></li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}
