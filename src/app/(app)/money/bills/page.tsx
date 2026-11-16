import type { Metadata } from "next";
import { getCtx } from "@/lib/current";
import { PageHeader, Card, SectionTitle } from "@/components/ui";
import { listBills, listBillOccurrences, getBillOccurrence } from "@/lib/money/bills";
import { listSchedules, listPaydays } from "@/lib/money/paydays";
import { listAccounts } from "@/lib/money/accounts";
import { getCategoryTree } from "@/lib/money/categories";
import { addDaysISO, addMonthsISO } from "@/lib/dates";
import { BillsClient } from "./bills-client";
import { getDb, schema } from "@/db";
import { and, eq } from "drizzle-orm";

export const metadata: Metadata = { title: "Bills & paydays" };

export default async function BillsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { user, view, today } = await getCtx();
  const ws = view;
  const writeWs = ws === "business" ? "business" : "personal";
  const [bills, schedules, occurrences, paydays, accounts, tree] = await Promise.all([
    listBills(user.id, ws, { includeInactive: true }),
    listSchedules(user.id, ws),
    listBillOccurrences(user.id, ws, addDaysISO(today, -60), addMonthsISO(today, 2)),
    listPaydays(user.id, ws, addDaysISO(today, -45), addMonthsISO(today, 2)),
    listAccounts(user.id, ws === "combined" ? "combined" : ws),
    getCategoryTree(user.id, writeWs),
  ]);
  const focusOcc = sp.occ ? await getBillOccurrence(user.id, sp.occ) : null;
  const db = await getDb();
  const focusPayday = sp.payday ? await db.query.paydayOccurrences.findFirst({ where: and(eq(schema.paydayOccurrences.id, sp.payday), eq(schema.paydayOccurrences.userId, user.id)) }) : null;
  return (
    <div>
      <PageHeader title="Bills & paydays" description="Recurring bills keep every occurrence and its payment status. Paydays define paycheck windows. Days missing in short months move to the month's last valid day." />
      <BillsClient
        today={today}
        workspace={writeWs}
        showWs={ws === "combined"}
        bills={bills}
        schedules={schedules}
        occurrences={occurrences.map((o) => ({ id: o.id, billId: o.billId, name: o.bill.name, workspace: o.bill.workspace, dueDate: o.dueDate, clamped: o.clamped, amountMinor: o.amountMinor, currency: o.bill.currency, status: o.status, accountId: o.bill.accountId, isSubscription: o.bill.isSubscription, paidTransactionId: o.paidTransactionId }))}
        paydays={paydays.map((p) => ({ id: p.id, name: p.schedule.name, workspace: p.schedule.workspace, date: p.date, clamped: p.clamped, amountMinor: p.amountMinor, currency: p.schedule.currency, status: p.status, accountId: p.schedule.accountId }))}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency, type: a.type, workspace: a.workspace, balanceMinor: a.balanceMinor }))}
        tree={tree}
        focusOccurrenceId={focusOcc?.id ?? null}
        focusPaydayId={focusPayday?.id ?? null}
      />
      <SectionTitle>How this works</SectionTitle>
      <Card className="text-[13px] muted">
        Marking a bill paid creates one expense linked to that occurrence. Deleting that expense makes the occurrence unpaid again. Editing a bill&apos;s schedule regenerates future unpaid occurrences and keeps paid history. Each occurrence can also be moved on its own without changing the series.
      </Card>
    </div>
  );
}
