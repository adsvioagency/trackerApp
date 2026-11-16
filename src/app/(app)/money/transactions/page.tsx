import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getCtx } from "@/lib/current";
import { PageHeader, Card, Money, Pill, EmptyState, WorkspaceBadge, Notice } from "@/components/ui";
import { listTransactions, TX_KIND_LABEL, INFLOW_KINDS } from "@/lib/money/transactions";
import { listAccounts } from "@/lib/money/accounts";
import { getCategoryTree } from "@/lib/money/categories";
import { resolvePeriodParams } from "@/lib/period";
import { PeriodPicker } from "@/components/period-picker";
import { fmtDate } from "@/lib/dates";
import { fmtMoney } from "@/lib/money/format";
import { TxSearch } from "./filters";
import { listPaydays } from "@/lib/money/paydays";
import { addMonthsISO } from "@/lib/dates";

export const metadata: Metadata = { title: "Transactions" };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { user, view, today } = await getCtx();
  const ws = view;
  const period = await resolvePeriodParams(user.id, ws, sp, today);
  const [accounts, tree, rows] = await Promise.all([
    listAccounts(user.id, ws, { includeArchived: true }),
    ws === "combined" ? Promise.all([getCategoryTree(user.id, "personal"), getCategoryTree(user.id, "business")]).then(([a, b]) => [...a, ...b]) : getCategoryTree(user.id, ws),
    listTransactions(user.id, { workspace: ws, from: sp.all ? undefined : period.from, to: sp.all ? undefined : period.to, accountId: sp.account, categoryId: sp.category, kind: (sp.kind as "spending") || undefined, search: sp.q, needsDop: sp.needsDop === "1", limit: 500 }),
  ]);
  const paydays = ws === "combined" ? [] : await listPaydays(user.id, ws, addMonthsISO(today, -6), addMonthsISO(today, 1));
  const totals = rows.reduce(
    (acc, t) => {
      if (t.kind === "expense" || t.kind === "debt_payment") acc.out[t.currency] = (acc.out[t.currency] ?? 0) + (t.kind === "debt_payment" ? (t.interestMinor ?? 0) + (t.feesMinor ?? 0) : t.amountMinor);
      if (t.kind === "refund") acc.out[t.currency] = (acc.out[t.currency] ?? 0) - t.amountMinor;
      if (t.kind === "income") acc.in[t.currency] = (acc.in[t.currency] ?? 0) + t.amountMinor;
      return acc;
    },
    { in: {} as Record<string, number>, out: {} as Record<string, number> },
  );
  const byDate = new Map<string, typeof rows>();
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);

  return (
    <div>
      <PageHeader
        title="Transactions"
        description="One ledger for everything. Transfers appear here but never count as income or spending."
        actions={
          <>
            <Link href={`/add/expense?ws=${ws === "combined" ? "personal" : ws}&back=/money/transactions`} className="btn btn-primary">Add expense</Link>
            <Link href={`/add/income?ws=${ws === "combined" ? "personal" : ws}&back=/money/transactions`} className="btn btn-secondary">Add income</Link>
            <Link href={`/add/transfer?ws=${ws === "combined" ? "personal" : ws}&back=/money/transactions`} className="btn btn-secondary">Transfer</Link>
          </>
        }
      />
      <Suspense>
        <PeriodPicker period={period.kind} month={period.month} year={period.year} from={period.from} to={period.to} accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} tree={tree} showPaycheck={ws !== "combined"} paydays={paydays.map((p) => ({ id: p.date, label: `${p.schedule.name} · ${fmtDate(p.date)}` }))} />
        <TxSearch />
      </Suspense>
      {sp.needsDop === "1" && <Notice tone="warn" className="mb-3">Showing transactions in a non-DOP currency without a DOP equivalent. Open each one to add the value you calculated.</Notice>}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        <span className="muted">{rows.length} transaction(s) · {period.label}</span>
        {Object.entries(totals.in).map(([c, v]) => <span key={"in" + c} className="font-semibold text-ok">In {fmtMoney(v, c)}</span>)}
        {Object.entries(totals.out).map(([c, v]) => <span key={"out" + c} className="font-semibold">Out {fmtMoney(v, c)}</span>)}
      </div>
      <Card className="p-0">
        {rows.length === 0 ? (
          <div className="p-4"><EmptyState title="No transactions match" body="Change the period or filters, or add your first entry." /></div>
        ) : (
          [...byDate.entries()].map(([date, list]) => (
            <section key={date}>
              <header className="sticky top-[52px] z-10 border-b border-rule bg-surface px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-ink-soft md:top-0">{date === today ? "Today" : fmtDate(date, "weekday")}</header>
              <ul>
                {list.map((t) => {
                  const inflow = INFLOW_KINDS.includes(t.kind);
                  const isTransfer = t.kind === "transfer_in" || t.kind === "transfer_out";
                  return (
                    <li key={t.id} className="border-b border-rule last:border-b-0">
                      <Link href={`/money/transactions/${t.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/70">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="truncate font-medium">{t.merchant ?? t.categoryName ?? TX_KIND_LABEL[t.kind]}</span>
                            {ws === "combined" && <WorkspaceBadge workspace={t.workspace} />}
                            {isTransfer && <Pill>{t.kind === "transfer_in" ? "Transfer in" : "Transfer out"}</Pill>}
                            {t.kind === "debt_payment" && <Pill tone="teal">Debt payment</Pill>}
                            {t.kind === "refund" && <Pill tone="ok">Refund</Pill>}
                            {(t.kind === "owner_draw" || t.kind === "owner_contribution") && <Pill tone="mango">Owner</Pill>}
                            {t.splits.length > 0 && <Pill>Split · {t.splits.length}</Pill>}
                            {t.currency !== "DOP" && t.dopEquivalentMinor == null && <Pill tone="warn">Needs RD$ value</Pill>}
                          </div>
                          <div className="muted truncate text-[12px]">
                            {t.accountName}
                            {t.categoryName && t.merchant ? ` · ${t.categoryName}` : ""}
                            {t.note ? ` · ${t.note}` : ""}
                          </div>
                        </div>
                        <div className="text-right">
                          <Money minor={inflow ? t.amountMinor : -t.amountMinor} currency={t.currency} signed className={`font-semibold ${isTransfer ? "text-ink-soft" : inflow ? "text-ok" : ""}`} />
                          {t.currency !== "DOP" && t.dopEquivalentMinor != null && <div className="muted text-[11px]">≈ {fmtMoney(t.dopEquivalentMinor)}</div>}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </Card>
    </div>
  );
}
