import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Workspace, WorkspaceView } from "@/lib/settings";
import { createAccount, listAccounts } from "./accounts";
import { findCategoryByName } from "./categories";
import { logActivity } from "@/lib/activity";
import { fmtMoney } from "./format";

export type Debt = typeof schema.debts.$inferSelect;
export type DebtWithBalance = Debt & { owedMinor: number; currency: string; accountName: string; principalPaidMinor: number; interestPaidMinor: number; paymentsCount: number };

export async function listDebts(userId: string, workspace: WorkspaceView, opts: { includeArchived?: boolean } = {}): Promise<DebtWithBalance[]> {
  const db = await getDb();
  const debts = await db.query.debts.findMany({ where: and(eq(schema.debts.userId, userId), workspace === "combined" ? undefined : eq(schema.debts.workspace, workspace), opts.includeArchived ? undefined : isNull(schema.debts.archivedAt)), orderBy: [asc(schema.debts.name)] });
  if (!debts.length) return [];
  const accounts = await listAccounts(userId, workspace, { includeArchived: true });
  const pays = await db
    .select({ debtId: schema.transactions.debtId, principal: sql<number>`coalesce(sum(${schema.transactions.principalMinor}),0)`, interest: sql<number>`coalesce(sum(${schema.transactions.interestMinor}),0) + coalesce(sum(${schema.transactions.feesMinor}),0)`, n: sql<number>`count(*)` })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.userId, userId), inArray(schema.transactions.debtId, debts.map((d) => d.id)), eq(schema.transactions.kind, "debt_payment")))
    .groupBy(schema.transactions.debtId);
  return debts.map((d) => {
    const acc = accounts.find((a) => a.id === d.accountId);
    const p = pays.find((x) => x.debtId === d.id);
    return { ...d, owedMinor: acc?.owedMinor ?? 0, currency: acc?.currency ?? "DOP", accountName: acc?.name ?? "—", principalPaidMinor: Number(p?.principal ?? 0), interestPaidMinor: Number(p?.interest ?? 0), paymentsCount: Number(p?.n ?? 0) };
  });
}

/** Creates the debt and, unless an existing liability account is given, its liability account. */
export async function createDebt(userId: string, input: { workspace: Workspace; name: string; kind: "credit_card" | "loan" | "other"; currency: string; owedMinor: number; accountId?: string | null; aprBasisPoints?: number | null; minimumPaymentMinor?: number | null; dueDay?: number | null; notes?: string | null; openingDate: string }) {
  const db = await getDb();
  let accountId = input.accountId ?? null;
  if (!accountId) {
    const acc = await createAccount(userId, { workspace: input.workspace, name: input.name.trim(), type: input.kind === "credit_card" ? "credit_card" : "loan", currency: input.currency, openingBalanceMinor: input.owedMinor, openingDate: input.openingDate });
    accountId = acc.id;
  }
  const interest = await findCategoryByName(userId, input.workspace, "Interest & fees");
  const [d] = await db
    .insert(schema.debts)
    .values({ userId, workspace: input.workspace, name: input.name.trim(), kind: input.kind, accountId, interestCategoryId: interest?.id ?? null, aprBasisPoints: input.aprBasisPoints ?? null, minimumPaymentMinor: input.minimumPaymentMinor ?? null, dueDay: input.dueDay ?? null, notes: input.notes ?? null })
    .returning();
  await logActivity({ userId, workspace: input.workspace, entityType: "debt", entityId: d.id, action: "create", summary: `Added debt ${d.name} · ${fmtMoney(input.owedMinor, input.currency)} owed` });
  return d;
}

export async function updateDebt(userId: string, id: string, patch: Partial<{ name: string; aprBasisPoints: number | null; minimumPaymentMinor: number | null; dueDay: number | null; notes: string | null; archived: boolean }>) {
  const db = await getDb();
  const { archived, ...rest } = patch;
  await db
    .update(schema.debts)
    .set({ ...rest, ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}) })
    .where(and(eq(schema.debts.id, id), eq(schema.debts.userId, userId)));
}
