import type { Metadata } from "next";
import { getCtx } from "@/lib/current";
import { PageHeader } from "@/components/ui";
import { listAccounts } from "@/lib/money/accounts";
import { AccountsClient } from "./accounts-client";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage() {
  const { user, view, today } = await getCtx();
  const accounts = await listAccounts(user.id, view === "combined" ? "combined" : view, { includeArchived: true });
  return (
    <div>
      <PageHeader title="Accounts" description="Manual accounts with opening balances. Choose which ones count as spending cash. Native balances stay in their own currency; add a manual DOP valuation when you want a non-DOP account included in DOP totals." />
      <AccountsClient today={today} workspace={view === "business" ? "business" : "personal"} showWs={view === "combined"} accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, currency: a.currency, workspace: a.workspace, balanceMinor: a.balanceMinor, owedMinor: a.owedMinor, isSpending: a.isSpending, archived: !!a.archivedAt, openingBalanceMinor: a.openingBalanceMinor, openingDate: a.openingDate, manualDopValuationMinor: a.manualDopValuationMinor, manualDopValuationDate: a.manualDopValuationDate, creditLimitMinor: a.creditLimitMinor, lastActivity: a.lastActivity, txCount: a.txCount }))} />
    </div>
  );
}
