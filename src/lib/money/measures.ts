import "server-only";
import type { Workspace, WorkspaceView } from "@/lib/settings";
import { addDaysISO } from "@/lib/dates";
import { listAccounts, type AccountWithBalance } from "./accounts";
import { unpaidBillsThrough, type OccurrenceRow } from "./bills";
import { listPaydays, nextPayday, type PaydayRow } from "./paydays";
import { listGoals, type GoalWithProgress } from "./goals";

/**
 * Recorded spending cash: balances of the selected spending accounts based on
 * entries to date. Native per currency; DOP-valued only where a DOP account or an
 * explicit manual valuation exists.
 */
export type SpendingCash = {
  accounts: AccountWithBalance[];
  byCurrency: Record<string, number>;
  dopValuedMinor: number;
  unvaluedAccounts: AccountWithBalance[];
  lastUpdated: string | null;
};

export async function recordedSpendingCash(userId: string, workspace: WorkspaceView): Promise<SpendingCash> {
  const all = await listAccounts(userId, workspace);
  const accounts = all.filter((a) => a.isSpending && !a.archivedAt);
  const byCurrency: Record<string, number> = {};
  let dopValuedMinor = 0;
  const unvaluedAccounts: AccountWithBalance[] = [];
  let lastUpdated: string | null = null;
  for (const a of accounts) {
    byCurrency[a.currency] = (byCurrency[a.currency] ?? 0) + a.balanceMinor;
    if (a.currency === "DOP") dopValuedMinor += a.balanceMinor;
    else if (a.manualDopValuationMinor != null) dopValuedMinor += a.manualDopValuationMinor;
    else unvaluedAccounts.push(a);
    if (a.lastActivity && (!lastUpdated || a.lastActivity > lastUpdated)) lastUpdated = a.lastActivity;
  }
  return { accounts, byCurrency, dopValuedMinor, unvaluedAccounts, lastUpdated };
}

export type Availability = {
  horizonEnd: string;
  horizonLabel: string;
  cash: SpendingCash;
  unpaidBills: OccurrenceRow[];
  unpaidBillsDopMinor: number;
  unpaidBillsOtherCurrency: Record<string, number>;
  reservations: { goal: GoalWithProgress; amountMinor: number }[];
  reservedMinor: number;
  availableMinor: number;
  forecast: { paydays: PaydayRow[]; expectedIncomeMinor: number; projectedMinor: number };
};

/**
 * Available after commitments = recorded spending cash − unpaid commitments in
 * the horizon − funds reserved from those same accounts. Each reservation is
 * counted once. Expected deposits live in the forecast only.
 */
export async function availableAfterCommitments(userId: string, workspace: Workspace, today: string): Promise<Availability> {
  const cash = await recordedSpendingCash(userId, workspace);
  const next = await nextPayday(userId, workspace, today);
  const horizonEnd = next ? next.date : addDaysISO(today, 30);
  const horizonLabel = next ? `until your next payday (${next.date})` : "next 30 days";
  const unpaidBills = await unpaidBillsThrough(userId, workspace, horizonEnd);
  let unpaidBillsDopMinor = 0;
  const unpaidBillsOtherCurrency: Record<string, number> = {};
  for (const o of unpaidBills) {
    if (o.bill.currency === "DOP") unpaidBillsDopMinor += o.amountMinor;
    else unpaidBillsOtherCurrency[o.bill.currency] = (unpaidBillsOtherCurrency[o.bill.currency] ?? 0) + o.amountMinor;
  }
  const spendingIds = new Set(cash.accounts.map((a) => a.id));
  const goals = await listGoals(userId, workspace);
  const reservations = goals
    .filter((g) => g.accountId && spendingIds.has(g.accountId) && g.currency === "DOP" && g.savedMinor > 0)
    .map((goal) => ({ goal, amountMinor: goal.savedMinor }));
  const reservedMinor = reservations.reduce((s, r) => s + r.amountMinor, 0);
  const availableMinor = cash.dopValuedMinor - unpaidBillsDopMinor - reservedMinor;
  const paydays = (await listPaydays(userId, workspace, addDaysISO(today, 1), horizonEnd)).filter((p) => p.status === "expected");
  const expectedIncomeMinor = paydays.filter((p) => p.schedule.currency === "DOP").reduce((s, p) => s + p.amountMinor, 0);
  return {
    horizonEnd,
    horizonLabel,
    cash,
    unpaidBills,
    unpaidBillsDopMinor,
    unpaidBillsOtherCurrency,
    reservations,
    reservedMinor,
    availableMinor,
    forecast: { paydays, expectedIncomeMinor, projectedMinor: availableMinor + expectedIncomeMinor },
  };
}
