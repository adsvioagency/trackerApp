import "server-only";
import { and, desc, eq, gte, inArray, lte, or, sql, ilike } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb, schema } from "@/db";
import type { Workspace, WorkspaceView } from "@/lib/settings";
import { getAccount, isLiability } from "./accounts";
import { logActivity } from "@/lib/activity";
import { fmtMoney } from "./format";

export type TxKind = (typeof schema.txKindEnum.enumValues)[number];
export type Tx = typeof schema.transactions.$inferSelect;

export const INFLOW_KINDS: TxKind[] = ["income", "refund", "transfer_in", "owner_contribution"];
export const TX_KIND_LABEL: Record<TxKind, string> = {
  expense: "Expense",
  income: "Income",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
  refund: "Refund",
  owner_contribution: "Owner contribution",
  owner_draw: "Owner draw",
  debt_payment: "Debt payment",
};

export function signedAmount(tx: Pick<Tx, "kind" | "amountMinor">): number {
  return INFLOW_KINDS.includes(tx.kind) ? tx.amountMinor : -tx.amountMinor;
}

/** DOP value of a transaction amount, or null when the equivalent is missing. */
export function dopValue(tx: Pick<Tx, "currency" | "amountMinor" | "dopEquivalentMinor">): number | null {
  if (tx.currency === "DOP") return tx.amountMinor;
  return tx.dopEquivalentMinor ?? null;
}

export type SplitInput = { categoryId: string | null; amountMinor: number; note?: string | null; clientId?: string | null; projectId?: string | null };

export type NewTransactionInput = {
  workspace: Workspace;
  kind: "expense" | "income" | "refund" | "owner_contribution" | "owner_draw";
  date: string;
  accountId: string;
  amountMinor: number;
  dopEquivalentMinor?: number | null;
  categoryId?: string | null;
  merchant?: string | null;
  note?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  refundOfId?: string | null;
  billOccurrenceId?: string | null;
  paymentId?: string | null;
  receiptFileId?: string | null;
  splits?: SplitInput[];
  idempotencyKey?: string | null;
  importBatchId?: string | null;
  importHash?: string | null;
  source?: "user" | "assistant" | "system" | "import";
};

function assertPositive(amount: number, what = "Amount") {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error(`${what} must be greater than zero.`);
}

export async function createTransaction(userId: string, input: NewTransactionInput): Promise<Tx> {
  const db = await getDb();
  assertPositive(input.amountMinor);
  const account = await getAccount(userId, input.accountId);
  if (!account) throw new Error("Account not found.");
  if (account.workspace !== input.workspace) throw new Error("That account belongs to the other workspace.");
  if (input.splits && input.splits.length) {
    const total = input.splits.reduce((a, s) => a + s.amountMinor, 0);
    if (total !== input.amountMinor) throw new Error(`Split lines must add up to the payment (${fmtMoney(input.amountMinor, account.currency)}).`);
  }
  if (account.currency !== "DOP" && input.dopEquivalentMinor !== undefined && input.dopEquivalentMinor !== null) assertPositive(input.dopEquivalentMinor, "DOP equivalent");

  const { tx, created } = await db.transaction(async (transaction) => {
    const [tx] = await transaction
      .insert(schema.transactions)
      .values({
        userId,
        workspace: input.workspace,
        kind: input.kind,
        date: input.date,
        accountId: input.accountId,
        amountMinor: input.amountMinor,
        currency: account.currency,
        dopEquivalentMinor: account.currency === "DOP" ? null : input.dopEquivalentMinor ?? null,
        categoryId: input.splits?.length ? null : input.categoryId ?? null,
        merchant: input.merchant?.trim() || null,
        note: input.note?.trim() || null,
        clientId: input.clientId ?? null,
        projectId: input.projectId ?? null,
        refundOfId: input.refundOfId ?? null,
        billOccurrenceId: input.billOccurrenceId ?? null,
        paymentId: input.paymentId ?? null,
        receiptFileId: input.receiptFileId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        importBatchId: input.importBatchId ?? null,
        importHash: input.importHash ?? null,
      })
      .onConflictDoNothing({ target: [schema.transactions.userId, schema.transactions.idempotencyKey] })
      .returning();
    if (!tx) {
      const existing = await transaction.query.transactions.findFirst({
        where: and(eq(schema.transactions.userId, userId), eq(schema.transactions.idempotencyKey, input.idempotencyKey!)),
      });
      if (!existing) throw new Error("Could not confirm the transaction. Try again.");
      return { tx: existing, created: false };
    }
    if (input.splits?.length) {
      await transaction.insert(schema.transactionSplits).values(input.splits.map((s) => ({ transactionId: tx.id, categoryId: s.categoryId, amountMinor: s.amountMinor, note: s.note ?? null, clientId: s.clientId ?? null, projectId: s.projectId ?? null })));
    }
    return { tx, created: true };
  });
  if (!created) return tx;
  await logActivity({
    userId,
    workspace: input.workspace,
    entityType: "transaction",
    entityId: tx.id,
    action: "create",
    summary: `${TX_KIND_LABEL[tx.kind]} ${fmtMoney(tx.amountMinor, tx.currency)}${tx.merchant ? ` · ${tx.merchant}` : ""}`,
    source: input.source ?? "user",
  });
  return tx;
}

export type TransferInput = {
  date: string;
  fromAccountId: string;
  toAccountId: string;
  amountMinor: number;
  /** Amount landing in the destination when currencies differ. Defaults to amountMinor. */
  toAmountMinor?: number | null;
  dopEquivalentMinor?: number | null;
  note?: string | null;
  goalId?: string | null;
  idempotencyKey?: string | null;
  source?: "user" | "assistant" | "system";
};

/** Two linked legs: money leaves one owned account and lands in another. Never counted as spending or income. */
export async function createTransfer(userId: string, input: TransferInput): Promise<{ out: Tx; in: Tx }> {
  const db = await getDb();
  assertPositive(input.amountMinor);
  if (input.fromAccountId === input.toAccountId) throw new Error("Choose two different accounts.");
  const from = await getAccount(userId, input.fromAccountId);
  const to = await getAccount(userId, input.toAccountId);
  if (!from || !to) throw new Error("Account not found.");
  const toAmount = input.toAmountMinor ?? input.amountMinor;
  assertPositive(toAmount, "Destination amount");
  if (from.currency !== to.currency && input.toAmountMinor == null) throw new Error("Enter the amount received in the destination currency.");
  const { outLeg, inLeg, created } = await db.transaction(async (transaction) => {
    const group = randomUUID();
    const base = { userId, date: input.date, transferGroupId: group, note: input.note?.trim() || null, goalId: input.goalId ?? null };
    const [outLeg] = await transaction
      .insert(schema.transactions)
      .values({ ...base, workspace: from.workspace, kind: "transfer_out", accountId: from.id, amountMinor: input.amountMinor, currency: from.currency, dopEquivalentMinor: from.currency === "DOP" ? null : input.dopEquivalentMinor ?? null, idempotencyKey: input.idempotencyKey ?? null })
      .onConflictDoNothing({ target: [schema.transactions.userId, schema.transactions.idempotencyKey] })
      .returning();
    if (!outLeg) {
      const existing = await transaction.query.transactions.findFirst({
        where: and(eq(schema.transactions.userId, userId), eq(schema.transactions.idempotencyKey, input.idempotencyKey!)),
      });
      if (!existing?.transferGroupId || existing.kind !== "transfer_out") throw new Error("Could not confirm the transfer. Try again.");
      const counterpart = await transaction.query.transactions.findFirst({
        where: and(
          eq(schema.transactions.userId, userId),
          eq(schema.transactions.transferGroupId, existing.transferGroupId),
          eq(schema.transactions.kind, "transfer_in"),
        ),
      });
      if (!counterpart) throw new Error("This transfer is missing its receiving entry.");
      return { outLeg: existing, inLeg: counterpart, created: false };
    }
    const [inLeg] = await transaction
      .insert(schema.transactions)
      .values({ ...base, workspace: to.workspace, kind: "transfer_in", accountId: to.id, amountMinor: toAmount, currency: to.currency, dopEquivalentMinor: to.currency === "DOP" ? null : input.dopEquivalentMinor ?? null })
      .returning();
    return { outLeg, inLeg, created: true };
  });
  if (!created) return { out: outLeg, in: inLeg };
  await logActivity({
    userId,
    workspace: from.workspace,
    entityType: "transfer",
    entityId: outLeg.id,
    action: "create",
    summary: `Transfer ${fmtMoney(input.amountMinor, from.currency)} from ${from.name} to ${to.name}${isLiability(to.type) ? " (card/loan payment)" : ""}`,
    source: input.source ?? "user",
  });
  return { out: outLeg, in: inLeg };
}

export type DebtPaymentInput = {
  date: string;
  fromAccountId: string;
  debtId: string;
  principalMinor: number;
  interestMinor: number;
  feesMinor?: number;
  note?: string | null;
  idempotencyKey?: string | null;
};

/**
 * A loan payment: cash leaves the paying account for the full amount; the
 * liability account receives only the principal; interest and fees count as
 * spending in the debt's interest category.
 */
export async function createDebtPayment(userId: string, input: DebtPaymentInput): Promise<{ out: Tx; in: Tx }> {
  const db = await getDb();
  const debt = await db.query.debts.findFirst({ where: and(eq(schema.debts.id, input.debtId), eq(schema.debts.userId, userId)) });
  if (!debt) throw new Error("Debt not found.");
  const from = await getAccount(userId, input.fromAccountId);
  const liability = await getAccount(userId, debt.accountId);
  if (!from || !liability) throw new Error("Account not found.");
  const fees = input.feesMinor ?? 0;
  const total = input.principalMinor + input.interestMinor + fees;
  assertPositive(total, "Payment");
  if (input.principalMinor < 0 || input.interestMinor < 0 || fees < 0) throw new Error("Amounts cannot be negative.");
  if (input.idempotencyKey) {
    const existing = await db.query.transactions.findFirst({ where: and(eq(schema.transactions.userId, userId), eq(schema.transactions.idempotencyKey, input.idempotencyKey)) });
    if (existing) {
      const legs = await db.query.transactions.findMany({ where: eq(schema.transactions.transferGroupId, existing.transferGroupId!) });
      return { out: legs.find((l) => l.kind === "debt_payment")!, in: legs.find((l) => l.kind === "transfer_in")! };
    }
  }
  const group = randomUUID();
  const [outLeg] = await db
    .insert(schema.transactions)
    .values({
      userId,
      workspace: from.workspace,
      kind: "debt_payment",
      date: input.date,
      accountId: from.id,
      amountMinor: total,
      currency: from.currency,
      categoryId: debt.interestCategoryId ?? null,
      debtId: debt.id,
      principalMinor: input.principalMinor,
      interestMinor: input.interestMinor,
      feesMinor: fees,
      transferGroupId: group,
      note: input.note?.trim() || null,
      idempotencyKey: input.idempotencyKey ?? null,
    })
    .returning();
  const [inLeg] = await db
    .insert(schema.transactions)
    .values({
      userId,
      workspace: liability.workspace,
      kind: "transfer_in",
      date: input.date,
      accountId: liability.id,
      amountMinor: Math.max(1, input.principalMinor),
      currency: liability.currency,
      debtId: debt.id,
      transferGroupId: group,
      note: "Principal portion",
    })
    .returning();
  await logActivity({ userId, workspace: from.workspace, entityType: "debt_payment", entityId: outLeg.id, action: "create", summary: `Paid ${fmtMoney(total, from.currency)} toward ${debt.name} (principal ${fmtMoney(input.principalMinor, from.currency)}, interest ${fmtMoney(input.interestMinor, from.currency)})` });
  return { out: outLeg, in: inLeg };
}

export async function getTransaction(userId: string, id: string) {
  const db = await getDb();
  const tx = await db.query.transactions.findFirst({ where: and(eq(schema.transactions.id, id), eq(schema.transactions.userId, userId)) });
  if (!tx) return null;
  const splits = await db.query.transactionSplits.findMany({ where: eq(schema.transactionSplits.transactionId, id) });
  const legs = tx.transferGroupId ? await db.query.transactions.findMany({ where: eq(schema.transactions.transferGroupId, tx.transferGroupId) }) : [];
  return { ...tx, splits, counterpart: legs.find((l) => l.id !== tx.id) ?? null };
}

export type TxPatch = Partial<{
  date: string;
  amountMinor: number;
  dopEquivalentMinor: number | null;
  categoryId: string | null;
  merchant: string | null;
  note: string | null;
  clientId: string | null;
  projectId: string | null;
  accountId: string;
  splits: SplitInput[] | null;
  receiptFileId: string | null;
}>;

/** Edits preserve links (bill occurrence, payment) and keep both transfer legs consistent. */
export async function updateTransaction(userId: string, id: string, patch: TxPatch) {
  const db = await getDb();
  const tx = await getTransaction(userId, id);
  if (!tx) throw new Error("Transaction not found.");
  const set: Partial<typeof schema.transactions.$inferInsert> = { updatedAt: new Date() };
  if (patch.date) set.date = patch.date;
  if (patch.amountMinor !== undefined) {
    assertPositive(patch.amountMinor);
    set.amountMinor = patch.amountMinor;
  }
  if (patch.dopEquivalentMinor !== undefined) set.dopEquivalentMinor = tx.currency === "DOP" ? null : patch.dopEquivalentMinor;
  if (patch.categoryId !== undefined) set.categoryId = patch.categoryId;
  if (patch.merchant !== undefined) set.merchant = patch.merchant?.trim() || null;
  if (patch.note !== undefined) set.note = patch.note?.trim() || null;
  if (patch.clientId !== undefined) set.clientId = patch.clientId;
  if (patch.projectId !== undefined) set.projectId = patch.projectId;
  if (patch.receiptFileId !== undefined) set.receiptFileId = patch.receiptFileId;
  if (patch.accountId && patch.accountId !== tx.accountId) {
    const acc = await getAccount(userId, patch.accountId);
    if (!acc) throw new Error("Account not found.");
    if (acc.currency !== tx.currency) throw new Error("Pick an account in the same currency, or delete and re-enter the transaction.");
    set.accountId = acc.id;
    set.workspace = acc.workspace;
  }
  if (patch.splits !== undefined) {
    await db.delete(schema.transactionSplits).where(eq(schema.transactionSplits.transactionId, id));
    if (patch.splits && patch.splits.length) {
      const total = patch.splits.reduce((a, s) => a + s.amountMinor, 0);
      const amount = patch.amountMinor ?? tx.amountMinor;
      if (total !== amount) throw new Error("Split lines must add up to the payment.");
      await db.insert(schema.transactionSplits).values(patch.splits.map((s) => ({ transactionId: id, categoryId: s.categoryId, amountMinor: s.amountMinor, note: s.note ?? null, clientId: s.clientId ?? null, projectId: s.projectId ?? null })));
      set.categoryId = null;
    }
  }
  await db.update(schema.transactions).set(set).where(eq(schema.transactions.id, id));
  // Keep the other transfer leg in step for shared fields.
  if (tx.counterpart) {
    const legSet: Partial<typeof schema.transactions.$inferInsert> = { updatedAt: new Date() };
    if (patch.date) legSet.date = patch.date;
    if (patch.note !== undefined) legSet.note = patch.note?.trim() || null;
    if (patch.amountMinor !== undefined && tx.counterpart.currency === tx.currency && tx.kind !== "debt_payment") legSet.amountMinor = patch.amountMinor;
    await db.update(schema.transactions).set(legSet).where(eq(schema.transactions.id, tx.counterpart.id));
  }
  // If the payment amount changed on a linked client payment, keep the payment record in sync.
  if (tx.paymentId && (patch.amountMinor !== undefined || patch.dopEquivalentMinor !== undefined || patch.date)) {
    await db
      .update(schema.payments)
      .set({ ...(patch.amountMinor !== undefined ? { amountMinor: patch.amountMinor } : {}), ...(patch.dopEquivalentMinor !== undefined ? { dopEquivalentMinor: patch.dopEquivalentMinor } : {}), ...(patch.date ? { date: patch.date } : {}) })
      .where(and(eq(schema.payments.id, tx.paymentId), eq(schema.payments.userId, userId)));
  }
  await logActivity({ userId, workspace: tx.workspace, entityType: "transaction", entityId: id, action: "update", summary: `Edited ${TX_KIND_LABEL[tx.kind].toLowerCase()} ${fmtMoney(patch.amountMinor ?? tx.amountMinor, tx.currency)}`, details: patch });
}

/** Deleting a transaction removes both transfer legs and resets any linked bill/payment status. */
export async function deleteTransaction(userId: string, id: string) {
  const db = await getDb();
  const tx = await getTransaction(userId, id);
  if (!tx) return;
  const ids = [tx.id, ...(tx.counterpart ? [tx.counterpart.id] : [])];
  if (tx.billOccurrenceId) {
    await db.update(schema.billOccurrences).set({ status: "unpaid", paidTransactionId: null, paidAt: null }).where(eq(schema.billOccurrences.id, tx.billOccurrenceId));
  }
  if (tx.paymentId) {
    await db.delete(schema.payments).where(and(eq(schema.payments.id, tx.paymentId), eq(schema.payments.userId, userId)));
  }
  await db.update(schema.paydayOccurrences).set({ status: "expected", transactionId: null }).where(inArray(schema.paydayOccurrences.transactionId, ids));
  await db.delete(schema.transactions).where(inArray(schema.transactions.id, ids));
  await logActivity({ userId, workspace: tx.workspace, entityType: "transaction", entityId: id, action: "delete", summary: `Deleted ${TX_KIND_LABEL[tx.kind].toLowerCase()} ${fmtMoney(tx.amountMinor, tx.currency)}${tx.merchant ? ` · ${tx.merchant}` : ""}` });
}

export type TxFilters = {
  workspace?: WorkspaceView;
  from?: string;
  to?: string;
  accountId?: string;
  categoryId?: string;
  kind?: TxKind | "spending" | "income" | "transfers";
  search?: string;
  clientId?: string;
  projectId?: string;
  limit?: number;
  offset?: number;
  needsDop?: boolean;
};

export async function listTransactions(userId: string, f: TxFilters = {}) {
  const db = await getDb();
  const conds = [eq(schema.transactions.userId, userId)];
  if (f.workspace && f.workspace !== "combined") conds.push(eq(schema.transactions.workspace, f.workspace));
  if (f.from) conds.push(gte(schema.transactions.date, f.from));
  if (f.to) conds.push(lte(schema.transactions.date, f.to));
  if (f.accountId) conds.push(eq(schema.transactions.accountId, f.accountId));
  if (f.categoryId) {
    const splitTx = db.select({ id: schema.transactionSplits.transactionId }).from(schema.transactionSplits).where(eq(schema.transactionSplits.categoryId, f.categoryId));
    conds.push(or(eq(schema.transactions.categoryId, f.categoryId), inArray(schema.transactions.id, splitTx))!);
  }
  if (f.kind === "spending") conds.push(inArray(schema.transactions.kind, ["expense", "refund", "debt_payment"]));
  else if (f.kind === "income") conds.push(eq(schema.transactions.kind, "income"));
  else if (f.kind === "transfers") conds.push(inArray(schema.transactions.kind, ["transfer_in", "transfer_out"]));
  else if (f.kind) conds.push(eq(schema.transactions.kind, f.kind));
  if (f.clientId) conds.push(eq(schema.transactions.clientId, f.clientId));
  if (f.projectId) conds.push(eq(schema.transactions.projectId, f.projectId));
  if (f.needsDop) conds.push(and(sql`${schema.transactions.currency} <> 'DOP'`, sql`${schema.transactions.dopEquivalentMinor} is null`)!);
  if (f.search) {
    const q = `%${f.search.trim()}%`;
    conds.push(or(ilike(schema.transactions.merchant, q), ilike(schema.transactions.note, q))!);
  }
  const rows = await db
    .select({ tx: schema.transactions, accountName: schema.accounts.name, categoryName: schema.categories.name })
    .from(schema.transactions)
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.transactions.accountId))
    .leftJoin(schema.categories, eq(schema.categories.id, schema.transactions.categoryId))
    .where(and(...conds))
    .orderBy(desc(schema.transactions.date), desc(schema.transactions.createdAt))
    .limit(f.limit ?? 200)
    .offset(f.offset ?? 0);
  const ids = rows.map((r) => r.tx.id);
  const splits = ids.length ? await db.query.transactionSplits.findMany({ where: inArray(schema.transactionSplits.transactionId, ids) }) : [];
  return rows.map((r) => ({ ...r.tx, accountName: r.accountName, categoryName: r.categoryName, splits: splits.filter((s) => s.transactionId === r.tx.id) }));
}

export type SpendingLine = { categoryId: string | null; dopMinor: number; missingCount: number; nativeByCurrency: Record<string, number> };

/**
 * Qualifying spending per category in DOP for a date range.
 * expense → +amount (split lines when present); refund → −amount; debt payment →
 * interest + fees only (principal is a balance movement). Transfers, owner
 * draws/contributions and card payments never count.
 */
export async function spendingByCategory(userId: string, workspace: WorkspaceView, from: string, to: string): Promise<{ lines: Map<string | null, SpendingLine>; totalDop: number; missingCount: number }> {
  const db = await getDb();
  const conds = [eq(schema.transactions.userId, userId), gte(schema.transactions.date, from), lte(schema.transactions.date, to), inArray(schema.transactions.kind, ["expense", "refund", "debt_payment"])];
  if (workspace !== "combined") conds.push(eq(schema.transactions.workspace, workspace));
  const rows = await db.query.transactions.findMany({ where: and(...conds) });
  const ids = rows.map((r) => r.id);
  const splits = ids.length ? await db.query.transactionSplits.findMany({ where: inArray(schema.transactionSplits.transactionId, ids) }) : [];
  const refundTargets = rows.filter((r) => r.kind === "refund" && r.refundOfId && !r.categoryId).map((r) => r.refundOfId!);
  const targets = refundTargets.length ? await db.query.transactions.findMany({ where: inArray(schema.transactions.id, refundTargets) }) : [];
  const lines = new Map<string | null, SpendingLine>();
  let totalDop = 0;
  let missingCount = 0;
  const add = (categoryId: string | null, nativeMinor: number, currency: string, dopMinor: number | null) => {
    const line = lines.get(categoryId) ?? { categoryId, dopMinor: 0, missingCount: 0, nativeByCurrency: {} };
    line.nativeByCurrency[currency] = (line.nativeByCurrency[currency] ?? 0) + nativeMinor;
    if (dopMinor === null) {
      line.missingCount += 1;
      missingCount += 1;
    } else {
      line.dopMinor += dopMinor;
      totalDop += dopMinor;
    }
    lines.set(categoryId, line);
  };
  for (const tx of rows) {
    const dop = dopValue(tx);
    const rate = dop === null ? null : dop / tx.amountMinor;
    if (tx.kind === "expense") {
      const txSplits = splits.filter((s) => s.transactionId === tx.id);
      if (txSplits.length) {
        for (const s of txSplits) add(s.categoryId, s.amountMinor, tx.currency, rate === null ? null : Math.round(s.amountMinor * rate));
      } else add(tx.categoryId, tx.amountMinor, tx.currency, dop);
    } else if (tx.kind === "refund") {
      const cat = tx.categoryId ?? targets.find((t) => t.id === tx.refundOfId)?.categoryId ?? null;
      add(cat, -tx.amountMinor, tx.currency, dop === null ? null : -dop);
    } else if (tx.kind === "debt_payment") {
      const portion = (tx.interestMinor ?? 0) + (tx.feesMinor ?? 0);
      if (portion > 0) add(tx.categoryId, portion, tx.currency, rate === null ? null : Math.round(portion * rate));
    }
  }
  return { lines, totalDop, missingCount };
}

/** Income in DOP for a range (client payments included, owner contributions and transfers excluded). */
export async function incomeTotal(userId: string, workspace: WorkspaceView, from: string, to: string): Promise<{ dopMinor: number; missingCount: number; byCategory: Map<string | null, number>; nativeByCurrency: Record<string, number> }> {
  const db = await getDb();
  const conds = [eq(schema.transactions.userId, userId), gte(schema.transactions.date, from), lte(schema.transactions.date, to), eq(schema.transactions.kind, "income")];
  if (workspace !== "combined") conds.push(eq(schema.transactions.workspace, workspace));
  const rows = await db.query.transactions.findMany({ where: and(...conds) });
  let dopMinor = 0;
  let missingCount = 0;
  const byCategory = new Map<string | null, number>();
  const nativeByCurrency: Record<string, number> = {};
  for (const tx of rows) {
    nativeByCurrency[tx.currency] = (nativeByCurrency[tx.currency] ?? 0) + tx.amountMinor;
    const dop = dopValue(tx);
    if (dop === null) missingCount++;
    else {
      dopMinor += dop;
      byCategory.set(tx.categoryId, (byCategory.get(tx.categoryId) ?? 0) + dop);
    }
  }
  return { dopMinor, missingCount, byCategory, nativeByCurrency };
}

/** Recent merchants for quick reuse. */
export async function recentMerchants(userId: string, workspace: Workspace, limit = 8): Promise<{ merchant: string; categoryId: string | null }[]> {
  const db = await getDb();
  const rows = await db
    .select({ merchant: schema.transactions.merchant, categoryId: schema.transactions.categoryId, last: sql<string>`max(${schema.transactions.createdAt})` })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.userId, userId), eq(schema.transactions.workspace, workspace), eq(schema.transactions.kind, "expense"), sql`${schema.transactions.merchant} is not null`))
    .groupBy(schema.transactions.merchant, schema.transactions.categoryId)
    .orderBy(sql`max(${schema.transactions.createdAt}) desc`)
    .limit(limit);
  return rows.filter((r) => r.merchant).map((r) => ({ merchant: r.merchant!, categoryId: r.categoryId }));
}
