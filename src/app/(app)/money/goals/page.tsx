import type { Metadata } from "next";
import { getCtx } from "@/lib/current";
import { PageHeader } from "@/components/ui";
import { listGoals } from "@/lib/money/goals";
import { listDebts } from "@/lib/money/debts";
import { listAccounts } from "@/lib/money/accounts";
import { GoalsClient } from "./goals-client";

export const metadata: Metadata = { title: "Goals & debts" };

export default async function GoalsPage() {
  const { user, view, today } = await getCtx();
  const ws = view;
  const writeWs = ws === "business" ? "business" : "personal";
  const [goals, debts, accounts] = await Promise.all([listGoals(user.id, ws, { includeArchived: true }), listDebts(user.id, ws, { includeArchived: true }), listAccounts(user.id, ws === "combined" ? "combined" : ws)]);
  return (
    <div>
      <PageHeader title="Goals & debts" description="Savings transfers count toward goals and move cash between accounts. Loan payments track principal apart from interest and fees." />
      <GoalsClient
        today={today}
        workspace={writeWs}
        showWs={ws === "combined"}
        goals={goals.map((g) => ({ id: g.id, name: g.name, workspace: g.workspace, targetMinor: g.targetMinor, currency: g.currency, accountId: g.accountId, accountName: g.accountName, startingMinor: g.startingMinor, targetDate: g.targetDate, notes: g.notes, archived: !!g.archivedAt, savedMinor: g.savedMinor, pct: g.pct, contributions: g.contributions }))}
        debts={debts.map((d) => ({ id: d.id, name: d.name, workspace: d.workspace, kind: d.kind, accountId: d.accountId, accountName: d.accountName, currency: d.currency, owedMinor: d.owedMinor, aprBasisPoints: d.aprBasisPoints, minimumPaymentMinor: d.minimumPaymentMinor, dueDay: d.dueDay, notes: d.notes, archived: !!d.archivedAt, principalPaidMinor: d.principalPaidMinor, interestPaidMinor: d.interestPaidMinor, paymentsCount: d.paymentsCount }))}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency, type: a.type, workspace: a.workspace, balanceMinor: a.balanceMinor }))}
      />
    </div>
  );
}
