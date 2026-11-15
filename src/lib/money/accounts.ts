import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Workspace } from "@/lib/settings";

export type AccountType = "cash" | "checking" | "savings" | "credit_card" | "loan" | "other";

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  cash: "Cash",
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit card",
  loan: "Loan",
  other: "Other",
};

export function isLiability(type: AccountType) {
  return type === "credit_card" || type === "loan";
}

export type AccountWithBalance = typeof schema.accounts.$inferSelect & {
  /** Signed balance in the account's currency. Liabilities are negative when owed. */
  balanceMinor: number;
  /** Amount owed for liabilities (positive), 0 for assets. */
  owedMinor: number;
  lastActivity: string | null;
  txCount: number;
};

const SIGNED = sql<number>`coalesce(sum(case when ${schema.transactions.kind} in ('income','refund','transfer_in','owner_contribution') then ${schema.transactions.amountMinor} else -${schema.transactions.amountMinor} end), 0)`;

export async function listAccounts(userId: string, workspace?: Workspace | "combined", opts: { includeArchived?: boolean } = {}): Promise<AccountWithBalance[]> {
  const db = await getDb();
  const where = and(
    eq(schema.accounts.userId, userId),
    workspace && workspace !== "combined" ? eq(schema.accounts.workspace, workspace) : undefined,
    opts.includeArchived ? undefined : isNull(schema.accounts.archivedAt),
  );
  const rows = await db
    .select({
      account: schema.accounts,
      moved: SIGNED,
      lastActivity: sql<string | null>`max(${schema.transactions.date})`,
      txCount: sql<number>`count(${schema.transactions.id})`,
    })
    .from(schema.accounts)
    .leftJoin(schema.transactions, eq(schema.transactions.accountId, schema.accounts.id))
    .where(where)
    .groupBy(schema.accounts.id)
    .orderBy(asc(schema.accounts.sort), asc(schema.accounts.name));
  return rows.map((r) => {
    const balance = Number(r.account.openingBalanceMinor) + Number(r.moved);
    return {
      ...r.account,
      balanceMinor: balance,
      owedMinor: isLiability(r.account.type) ? Math.max(0, -balance) : 0,
      lastActivity: r.lastActivity,
      txCount: Number(r.txCount),
    };
  });
}

export async function getAccount(userId: string, id: string) {
  const db = await getDb();
  return db.query.accounts.findFirst({ where: and(eq(schema.accounts.id, id), eq(schema.accounts.userId, userId)) });
}

export async function createAccount(
  userId: string,
  input: {
    workspace: Workspace;
    name: string;
    type: AccountType;
    currency: string;
    openingBalanceMinor: number;
    openingDate: string;
    isSpending?: boolean;
    creditLimitMinor?: number | null;
  },
) {
  const db = await getDb();
  const liability = isLiability(input.type);
  const [a] = await db
    .insert(schema.accounts)
    .values({
      userId,
      workspace: input.workspace,
      name: input.name.trim(),
      type: input.type,
      currency: input.currency,
      // For liabilities an "opening balance" of 5,000 means 5,000 owed → stored negative.
      openingBalanceMinor: liability ? -Math.abs(input.openingBalanceMinor) : input.openingBalanceMinor,
      openingDate: input.openingDate,
      isSpending: liability ? false : input.isSpending ?? input.type !== "savings",
      creditLimitMinor: input.creditLimitMinor ?? null,
    })
    .returning();
  return a;
}

export async function updateAccount(userId: string, id: string, patch: Partial<{ name: string; isSpending: boolean; archived: boolean; manualDopValuationMinor: number | null; manualDopValuationDate: string | null; creditLimitMinor: number | null; openingBalanceMinor: number; openingDate: string }>) {
  const db = await getDb();
  const acc = await getAccount(userId, id);
  if (!acc) throw new Error("Account not found");
  const set: Partial<typeof schema.accounts.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.isSpending !== undefined) set.isSpending = patch.isSpending;
  if (patch.archived !== undefined) set.archivedAt = patch.archived ? new Date() : null;
  if (patch.manualDopValuationMinor !== undefined) set.manualDopValuationMinor = patch.manualDopValuationMinor;
  if (patch.manualDopValuationDate !== undefined) set.manualDopValuationDate = patch.manualDopValuationDate;
  if (patch.creditLimitMinor !== undefined) set.creditLimitMinor = patch.creditLimitMinor;
  if (patch.openingBalanceMinor !== undefined) set.openingBalanceMinor = isLiability(acc.type) ? -Math.abs(patch.openingBalanceMinor) : patch.openingBalanceMinor;
  if (patch.openingDate !== undefined) set.openingDate = patch.openingDate;
  await db.update(schema.accounts).set(set).where(and(eq(schema.accounts.id, id), eq(schema.accounts.userId, userId)));
}

/** Accounts used recently for quick reuse in forms (most recent first). */
export async function recentAccountIds(userId: string, workspace: Workspace, limit = 3): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.transactions.accountId, last: sql<string>`max(${schema.transactions.createdAt})` })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.userId, userId), eq(schema.transactions.workspace, workspace)))
    .groupBy(schema.transactions.accountId)
    .orderBy(sql`max(${schema.transactions.createdAt}) desc`)
    .limit(limit);
  return rows.map((r) => r.id);
}
