import type { Metadata } from "next";
import Link from "next/link";
import { getCtx } from "@/lib/current";
import { PageHeader, Card, Money, Stat, SectionTitle, EmptyState, RowLink, Pill, Notice, WorkspaceBadge, ProgressBar } from "@/components/ui";
import { availableAfterCommitments, recordedSpendingCash } from "@/lib/money/measures";
import { listAccounts, ACCOUNT_TYPE_LABEL } from "@/lib/money/accounts";
import { getBudgetPlan, resolvePeriod } from "@/lib/money/budget";
import { listGoals } from "@/lib/money/goals";
import { listDebts } from "@/lib/money/debts";
import { listTransactions, TX_KIND_LABEL, incomeTotal, spendingByCategory } from "@/lib/money/transactions";
import { receivablesSummary } from "@/lib/business/documents";
import { fmtDate, monthEnd, monthKey, monthStart } from "@/lib/dates";
import { fmtMoney } from "@/lib/money/format";

export const metadata: Metadata = { title: "Money" };

export default async function MoneyPage() {
  const { user, view, today } = await getCtx();
  const month = monthKey(today);

  if (view === "combined") {
    const [p, b, pin, pout, bin, bout, accounts] = await Promise.all([
      recordedSpendingCash(user.id, "personal"),
      recordedSpendingCash(user.id, "business"),
      incomeTotal(user.id, "personal", monthStart(month), monthEnd(month)),
      spendingByCategory(user.id, "personal", monthStart(month), monthEnd(month)),
      incomeTotal(user.id, "business", monthStart(month), monthEnd(month)),
      spendingByCategory(user.id, "business", monthStart(month), monthEnd(month)),
      listAccounts(user.id, "combined"),
    ]);
    return (
      <div>
        <PageHeader title="Money · Combined" description="Separate summaries per workspace. Internal transfers between your own accounts are excluded from income and spending." actions={<Link href="/money/transactions" className="btn btn-secondary">All transactions</Link>} />
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { ws: "personal" as const, cash: p, inc: pin, out: pout },
            { ws: "business" as const, cash: b, inc: bin, out: bout },
          ].map(({ ws, cash, inc, out }) => (
            <Card key={ws} title={<span className="flex items-center gap-2">{ws === "personal" ? "Personal" : "Adsvio"} <WorkspaceBadge workspace={ws} /></span>}>
              <dl className="grid grid-cols-2 gap-3 text-[14px]">
                <div><dt className="muted text-[12px] uppercase tracking-wide">Spending cash (DOP-valued)</dt><dd className="font-display text-[20px] font-extrabold"><Money minor={cash.dopValuedMinor} /></dd></div>
                <div><dt className="muted text-[12px] uppercase tracking-wide">Income this month</dt><dd className="font-display text-[20px] font-extrabold"><Money minor={inc.dopMinor} /></dd></div>
                <div><dt className="muted text-[12px] uppercase tracking-wide">Spending this month</dt><dd className="font-display text-[20px] font-extrabold"><Money minor={out.totalDop} /></dd></div>
                <div><dt className="muted text-[12px] uppercase tracking-wide">Net</dt><dd className={`font-display text-[20px] font-extrabold ${inc.dopMinor - out.totalDop < 0 ? "text-danger" : "text-ok"}`}><Money minor={inc.dopMinor - out.totalDop} signed /></dd></div>
              </dl>
              {(inc.missingCount + out.missingCount > 0 || cash.unvaluedAccounts.length > 0) && <Notice tone="warn" className="mt-3">Incomplete in DOP: {inc.missingCount + out.missingCount} transaction(s) need a DOP equivalent{cash.unvaluedAccounts.length ? ` · ${cash.unvaluedAccounts.length} account(s) without a manual valuation` : ""}. <Link href="/money/transactions?needsDop=1" className="underline">Review</Link></Notice>}
            </Card>
          ))}
        </div>
        <SectionTitle>All accounts</SectionTitle>
        <Card className="p-0">
          <AccountRows accounts={accounts} showWs />
        </Card>
      </div>
    );
  }

  const ws = view;
  const [availability, accounts, goals, debts, recent] = await Promise.all([
    availableAfterCommitments(user.id, ws, today),
    listAccounts(user.id, ws),
    listGoals(user.id, ws),
    listDebts(user.id, ws),
    listTransactions(user.id, { workspace: ws, limit: 8 }),
  ]);
  const period = (await resolvePeriod(user.id, ws, { type: "paycheck", date: today })) ?? (await resolvePeriod(user.id, ws, { type: "month", month }));
  const budget = period ? await getBudgetPlan(user.id, ws, period) : null;
  const receivables = ws === "business" ? await receivablesSummary(user.id, today) : null;
  const income = await incomeTotal(user.id, ws, monthStart(month), monthEnd(month));
  const spend = await spendingByCategory(user.id, ws, monthStart(month), monthEnd(month));

  return (
    <div>
      <PageHeader
        title={ws === "business" ? "Business Money" : "Money"}
        description={ws === "business" ? "Operating cash, receivables, costs and owner movements, kept apart." : "One ledger. Three distinct measures: recorded cash, budget remaining, available after commitments."}
        actions={
          <>
            <Link href="/money/transactions" className="btn btn-secondary">Transactions</Link>
            <Link href={`/add/expense?ws=${ws}&back=/money`} className="btn btn-primary">Add expense</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Recorded spending cash" value={<Money minor={availability.cash.dopValuedMinor} />} hint={availability.cash.lastUpdated ? `Based on entries to ${fmtDate(availability.cash.lastUpdated)}` : "No entries yet"} href="/money/accounts" />
        <Stat label="Available after commitments" value={<Money minor={availability.availableMinor} />} tone={availability.availableMinor < 0 ? "danger" : undefined} hint={`Horizon: ${availability.horizonLabel}`} href="#available" />
        <Stat label="Budget remaining" value={budget && budget.totals.targetMinor ? <Money minor={budget.totals.remainingMinor} /> : "—"} tone={budget && budget.totals.remainingMinor < 0 ? "danger" : undefined} hint={budget && budget.totals.targetMinor ? `${budget.period.type === "paycheck" ? "This paycheck" : "This month"} · ${fmtMoney(budget.totals.actualMinor)} spent of ${fmtMoney(budget.totals.availableMinor)}` : "No plan yet"} href="/money/budget" />
        <Stat label={`Net ${fmtDate(monthStart(month), "short")}–${fmtDate(monthEnd(month), "short")}`} value={<Money minor={income.dopMinor - spend.totalDop} signed />} tone={income.dopMinor - spend.totalDop < 0 ? "danger" : "ok"} hint={`${fmtMoney(income.dopMinor)} in · ${fmtMoney(spend.totalDop)} out${income.missingCount + spend.missingCount ? ` · ${income.missingCount + spend.missingCount} need DOP values` : ""}`} href="/money/reports" />
      </div>

      <section id="available" className="mt-4">
        <Card title="Available after commitments · how it is built">
          <dl className="grid gap-2 text-[14px] md:grid-cols-2">
            <Row label="Recorded spending cash (DOP-valued)" value={availability.cash.dopValuedMinor} />
            <Row label={`− Unpaid bills ${availability.horizonLabel} (${availability.unpaidBills.length})`} value={-availability.unpaidBillsDopMinor} href="/money/bills" />
            <Row label={`− Reserved for goals in spending accounts (${availability.reservations.length})`} value={-availability.reservedMinor} href="/money/goals" />
            <Row label="= Available after commitments" value={availability.availableMinor} strong />
          </dl>
          <div className="mt-3 rounded-xl bg-surface-2/60 p-3 text-[13px]">
            <div className="font-semibold">Forecast (not counted above)</div>
            <div className="muted">Expected deposits {availability.horizonLabel}: {fmtMoney(availability.forecast.expectedIncomeMinor)} from {availability.forecast.paydays.length} payday(s). Projected after deposits: <span className="font-semibold text-ink">{fmtMoney(availability.forecast.projectedMinor)}</span>. Expected deposits and unpaid invoices stay in the forecast until money is recorded as received.</div>
          </div>
          {Object.keys(availability.unpaidBillsOtherCurrency).length > 0 && <Notice tone="warn" className="mt-3">Some unpaid bills are in {Object.keys(availability.unpaidBillsOtherCurrency).join(", ")} and are not included in the DOP figure: {Object.entries(availability.unpaidBillsOtherCurrency).map(([c, v]) => fmtMoney(v, c)).join(", ")}.</Notice>}
          {availability.cash.unvaluedAccounts.length > 0 && <Notice tone="warn" className="mt-3">{availability.cash.unvaluedAccounts.map((a) => a.name).join(", ")}: not valued in DOP. Add a manual valuation in Accounts to include it.</Notice>}
        </Card>
      </section>

      {receivables && (
        <>
          <SectionTitle action={<Link href="/documents?tab=invoices" className="text-[13px] font-semibold text-mango-deep hover:underline">Proposals &amp; Invoices</Link>}>Receivables</SectionTitle>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Outstanding" value={Object.entries(receivables.outstandingByCurrency).map(([c, v]) => <div key={c}><Money minor={v} currency={c} /></div>)} hint={`${receivables.open.length} open invoice(s)`} href="/documents?tab=invoices&status=issued" />
            <Stat label="Overdue" value={receivables.overdueCount ? Object.entries(receivables.overdueByCurrency).map(([c, v]) => <div key={c}><Money minor={v} currency={c} /></div>) : "None"} tone={receivables.overdueCount ? "danger" : "ok"} hint={`${receivables.overdueCount} invoice(s) past due`} href="/documents?tab=invoices&status=overdue" />
            <Stat label="Due in 14 days" value={receivables.dueSoon.length} hint="Issued invoices coming due" href="/documents?tab=invoices&status=issued" />
            <Stat label="Business cash" value={Object.entries(availability.cash.byCurrency).map(([c, v]) => <div key={c}><Money minor={v} currency={c} /></div>)} hint="Native balances" href="/money/accounts" />
          </div>
        </>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Accounts" action={<Link href="/money/accounts" className="btn btn-ghost btn-sm">Manage</Link>} className="p-0 md:p-0">
          <div className="px-4 pt-4 md:px-5 md:pt-5"><h2 className="sr-only">Accounts</h2></div>
          {accounts.length ? <AccountRows accounts={accounts} /> : <div className="p-4"><EmptyState title="No accounts yet" action={<Link href="/money/accounts" className="btn btn-primary btn-sm">Add account</Link>} /></div>}
        </Card>
        <div className="space-y-4">
          <Card title="Budget" action={<Link href="/money/budget" className="btn btn-ghost btn-sm">Open</Link>}>
            {budget && budget.totals.targetMinor ? (
              <div className="space-y-2">
                {budget.lines.filter((l) => l.targetMinor > 0).sort((a, b) => a.headroomPct! - b.headroomPct!).slice(0, 5).map((l) => (
                  <Link key={l.categoryId} href={`/money/transactions?category=${l.categoryId}&period=${budget.period.type}&month=${budget.period.month}`} className="block">
                    <div className="flex items-center justify-between text-[13px]"><span className="font-medium">{l.name}</span><span className="muted tnum">{fmtMoney(l.actualMinor)} / {fmtMoney(l.availableMinor)}</span></div>
                    <ProgressBar value={l.actualMinor} max={l.availableMinor} label={`${l.name} spent`} />
                  </Link>
                ))}
                <p className="muted text-[12px]">{budget.period.type === "paycheck" ? "Current paycheck" : "This month"} · {fmtMoney(budget.totals.remainingMinor)} remaining overall.</p>
              </div>
            ) : (
              <EmptyState title="No budget yet" body="Set monthly or paycheck targets to see headroom here." action={<Link href="/money/budget" className="btn btn-primary btn-sm">Set budget</Link>} />
            )}
          </Card>
          <Card title="Savings & debts" action={<Link href="/money/goals" className="btn btn-ghost btn-sm">Open</Link>}>
            {goals.length + debts.length === 0 ? (
              <EmptyState title="Nothing tracked yet" />
            ) : (
              <ul className="space-y-2 text-[13px]">
                {goals.slice(0, 3).map((g) => (
                  <li key={g.id}><div className="flex justify-between"><span className="font-medium">{g.name}</span><span className="muted tnum">{fmtMoney(g.savedMinor, g.currency)} of {fmtMoney(g.targetMinor, g.currency)}</span></div><ProgressBar value={g.savedMinor} max={g.targetMinor} tone="ok" label={`${g.name} progress`} /></li>
                ))}
                {debts.slice(0, 3).map((d) => (
                  <li key={d.id} className="flex justify-between"><span className="font-medium">{d.name}</span><span className="tnum text-danger">{fmtMoney(d.owedMinor, d.currency)} owed</span></li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <SectionTitle action={<Link href="/money/transactions" className="text-[13px] font-semibold text-mango-deep hover:underline">All</Link>}>Recent transactions</SectionTitle>
      <Card className="p-0">
        {recent.length ? (
          <ul>
            {recent.map((t) => (
              <li key={t.id}>
                <RowLink href={`/money/transactions/${t.id}`} title={t.merchant ?? t.categoryName ?? TX_KIND_LABEL[t.kind]} subtitle={`${fmtDate(t.date)} · ${t.accountName}${t.categoryName && t.merchant ? ` · ${t.categoryName}` : ""}`} right={<Money minor={["income", "refund", "transfer_in", "owner_contribution"].includes(t.kind) ? t.amountMinor : -t.amountMinor} currency={t.currency} signed />} badge={t.kind.startsWith("transfer") ? <Pill>Transfer</Pill> : undefined} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-4"><EmptyState title="No transactions yet" action={<Link href={`/add/expense?ws=${ws}`} className="btn btn-primary btn-sm">Add expense</Link>} /></div>
        )}
      </Card>
    </div>
  );
}

function Row({ label, value, href, strong }: { label: string; value: number; href?: string; strong?: boolean }) {
  const inner = (
    <>
      <dt className={strong ? "font-semibold" : "muted"}>{label}</dt>
      <dd className={`tnum ${strong ? "font-display text-[18px] font-extrabold" : "font-medium"}`}>{fmtMoney(value, "DOP", { signed: !strong })}</dd>
    </>
  );
  return <div className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 ${strong ? "bg-surface-2/70" : ""}`}>{href ? <Link href={href} className="contents">{inner}</Link> : inner}</div>;
}

function AccountRows({ accounts, showWs }: { accounts: Awaited<ReturnType<typeof listAccounts>>; showWs?: boolean }) {
  return (
    <ul className="px-4 md:px-5">
      {accounts.map((a) => (
        <li key={a.id}>
          <RowLink href={`/money/transactions?account=${a.id}`} title={a.name} subtitle={`${ACCOUNT_TYPE_LABEL[a.type]}${a.isSpending ? " · spending" : ""}${a.lastActivity ? ` · updated ${fmtDate(a.lastActivity, "short")}` : ""}`} badge={showWs ? <WorkspaceBadge workspace={a.workspace} /> : undefined} right={<div><Money minor={a.balanceMinor} currency={a.currency} className="font-semibold" />{a.currency !== "DOP" && a.manualDopValuationMinor != null && <div className="muted text-[11px]">≈ {fmtMoney(a.manualDopValuationMinor)} (manual)</div>}</div>} />
        </li>
      ))}
    </ul>
  );
}
