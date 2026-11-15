import "server-only";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Workspace, WorkspaceView } from "@/lib/settings";
import { addMonthsISO, occurrencesBetween, type Frequency } from "@/lib/dates";
import { createTransaction } from "./transactions";
import { logActivity } from "@/lib/activity";
import { fmtMoney } from "./format";

export type Bill = typeof schema.bills.$inferSelect;
export type BillOccurrence = typeof schema.billOccurrences.$inferSelect;

/** Materialize occurrences for a bill up to a horizon (idempotent). */
export async function ensureBillOccurrences(userId: string, bill: Bill, until: string) {
  const db = await getDb();
  if (!bill.active) return;
  const list = occurrencesBetween({ frequency: bill.frequency as Frequency, interval: bill.interval, anchorDate: bill.anchorDate, endDate: bill.endDate }, bill.anchorDate, until);
  if (!list.length) return;
  await db
    .insert(schema.billOccurrences)
    .values(list.map((o) => ({ billId: bill.id, userId, dueDate: o.date, scheduledDate: o.scheduledDate, clamped: o.clamped, amountMinor: bill.amountMinor })))
    .onConflictDoNothing({ target: [schema.billOccurrences.billId, schema.billOccurrences.scheduledDate] });
}

export async function ensureAllBillOccurrences(userId: string, workspace: WorkspaceView, until: string) {
  const db = await getDb();
  const list = await db.query.bills.findMany({ where: and(eq(schema.bills.userId, userId), eq(schema.bills.active, true), workspace === "combined" ? undefined : eq(schema.bills.workspace, workspace)) });
  for (const b of list) await ensureBillOccurrences(userId, b, until);
}

export async function listBills(userId: string, workspace: WorkspaceView, opts: { includeInactive?: boolean } = {}) {
  const db = await getDb();
  return db.query.bills.findMany({
    where: and(eq(schema.bills.userId, userId), workspace === "combined" ? undefined : eq(schema.bills.workspace, workspace), opts.includeInactive ? undefined : eq(schema.bills.active, true)),
    orderBy: [asc(schema.bills.name)],
  });
}

export type OccurrenceRow = BillOccurrence & { bill: Bill };

export async function listBillOccurrences(userId: string, workspace: WorkspaceView, from: string, to: string, opts: { status?: ("unpaid" | "paid" | "skipped")[] } = {}): Promise<OccurrenceRow[]> {
  const db = await getDb();
  await ensureAllBillOccurrences(userId, workspace, to > addMonthsISO(from, 1) ? to : addMonthsISO(from, 1));
  const rows = await db
    .select({ occ: schema.billOccurrences, bill: schema.bills })
    .from(schema.billOccurrences)
    .innerJoin(schema.bills, eq(schema.bills.id, schema.billOccurrences.billId))
    .where(
      and(
        eq(schema.billOccurrences.userId, userId),
        gte(schema.billOccurrences.dueDate, from),
        lte(schema.billOccurrences.dueDate, to),
        workspace === "combined" ? undefined : eq(schema.bills.workspace, workspace),
        opts.status ? inArray(schema.billOccurrences.status, opts.status) : undefined,
      ),
    )
    .orderBy(asc(schema.billOccurrences.dueDate));
  return rows.map((r) => ({ ...r.occ, bill: r.bill }));
}

/** Unpaid occurrences due on or before `to` (includes overdue ones from any earlier date). */
export async function unpaidBillsThrough(userId: string, workspace: WorkspaceView, to: string): Promise<OccurrenceRow[]> {
  const db = await getDb();
  await ensureAllBillOccurrences(userId, workspace, to);
  const rows = await db
    .select({ occ: schema.billOccurrences, bill: schema.bills })
    .from(schema.billOccurrences)
    .innerJoin(schema.bills, eq(schema.bills.id, schema.billOccurrences.billId))
    .where(and(eq(schema.billOccurrences.userId, userId), lte(schema.billOccurrences.dueDate, to), eq(schema.billOccurrences.status, "unpaid"), workspace === "combined" ? undefined : eq(schema.bills.workspace, workspace), eq(schema.bills.active, true)))
    .orderBy(asc(schema.billOccurrences.dueDate));
  return rows.map((r) => ({ ...r.occ, bill: r.bill }));
}

export async function createBill(
  userId: string,
  input: { workspace: Workspace; name: string; amountMinor: number; currency: string; categoryId?: string | null; accountId?: string | null; frequency: Frequency; interval?: number; anchorDate: string; endDate?: string | null; isSubscription?: boolean; autopay?: boolean; notes?: string | null },
) {
  const db = await getDb();
  const [bill] = await db
    .insert(schema.bills)
    .values({
      userId,
      workspace: input.workspace,
      name: input.name.trim(),
      amountMinor: input.amountMinor,
      currency: input.currency,
      categoryId: input.categoryId ?? null,
      accountId: input.accountId ?? null,
      frequency: input.frequency,
      interval: input.interval ?? 1,
      anchorDate: input.anchorDate,
      endDate: input.endDate ?? null,
      isSubscription: input.isSubscription ?? false,
      autopay: input.autopay ?? false,
      notes: input.notes ?? null,
    })
    .returning();
  await ensureBillOccurrences(userId, bill, addMonthsISO(input.anchorDate, 13));
  await logActivity({ userId, workspace: input.workspace, entityType: "bill", entityId: bill.id, action: "create", summary: `Added bill ${bill.name} · ${fmtMoney(bill.amountMinor, bill.currency)} ${bill.frequency}` });
  return bill;
}

export async function updateBill(userId: string, id: string, patch: Partial<{ name: string; amountMinor: number; categoryId: string | null; accountId: string | null; frequency: Frequency; interval: number; anchorDate: string; endDate: string | null; isSubscription: boolean; autopay: boolean; notes: string | null; active: boolean }>) {
  const db = await getDb();
  const bill = await db.query.bills.findFirst({ where: and(eq(schema.bills.id, id), eq(schema.bills.userId, userId)) });
  if (!bill) throw new Error("Bill not found.");
  await db.update(schema.bills).set({ ...patch, name: patch.name?.trim() ?? bill.name }).where(eq(schema.bills.id, id));
  const scheduleChanged = patch.frequency !== undefined || patch.anchorDate !== undefined || patch.interval !== undefined || patch.endDate !== undefined;
  if (scheduleChanged) {
    // Regenerate only future unpaid occurrences; paid history is preserved.
    await db.delete(schema.billOccurrences).where(and(eq(schema.billOccurrences.billId, id), eq(schema.billOccurrences.status, "unpaid")));
  } else if (patch.amountMinor !== undefined) {
    await db.update(schema.billOccurrences).set({ amountMinor: patch.amountMinor }).where(and(eq(schema.billOccurrences.billId, id), eq(schema.billOccurrences.status, "unpaid")));
  }
  const updated = (await db.query.bills.findFirst({ where: eq(schema.bills.id, id) }))!;
  await ensureBillOccurrences(userId, updated, addMonthsISO(updated.anchorDate, 13));
  await logActivity({ userId, workspace: bill.workspace, entityType: "bill", entityId: id, action: "update", summary: `Edited bill ${updated.name}`, details: patch });
  return updated;
}

export async function getBillOccurrence(userId: string, occurrenceId: string): Promise<OccurrenceRow | null> {
  const db = await getDb();
  const row = await db
    .select({ occ: schema.billOccurrences, bill: schema.bills })
    .from(schema.billOccurrences)
    .innerJoin(schema.bills, eq(schema.bills.id, schema.billOccurrences.billId))
    .where(and(eq(schema.billOccurrences.id, occurrenceId), eq(schema.billOccurrences.userId, userId)))
    .limit(1);
  return row[0] ? { ...row[0].occ, bill: row[0].bill } : null;
}

/** Records the payment once: creates the expense and marks the occurrence paid. Retries are safe. */
export async function payBillOccurrence(userId: string, occurrenceId: string, input: { accountId: string; date: string; amountMinor?: number; dopEquivalentMinor?: number | null; note?: string | null; source?: "user" | "assistant" | "system" }) {
  const db = await getDb();
  const occ = await getBillOccurrence(userId, occurrenceId);
  if (!occ) throw new Error("Bill occurrence not found.");
  if (occ.status === "paid" && occ.paidTransactionId) return occ; // already recorded
  const tx = await createTransaction(userId, {
    workspace: occ.bill.workspace,
    kind: "expense",
    date: input.date,
    accountId: input.accountId,
    amountMinor: input.amountMinor ?? occ.amountMinor,
    dopEquivalentMinor: input.dopEquivalentMinor,
    categoryId: occ.bill.categoryId,
    merchant: occ.bill.name,
    note: input.note ?? null,
    billOccurrenceId: occ.id,
    idempotencyKey: `bill-occ:${occ.id}`,
    source: input.source,
  });
  await db.update(schema.billOccurrences).set({ status: "paid", paidTransactionId: tx.id, paidAt: new Date(), amountMinor: tx.amountMinor }).where(eq(schema.billOccurrences.id, occ.id));
  return { ...occ, status: "paid" as const, paidTransactionId: tx.id };
}

export async function skipBillOccurrence(userId: string, occurrenceId: string, skipped = true) {
  const db = await getDb();
  await db
    .update(schema.billOccurrences)
    .set({ status: skipped ? "skipped" : "unpaid" })
    .where(and(eq(schema.billOccurrences.id, occurrenceId), eq(schema.billOccurrences.userId, userId), eq(schema.billOccurrences.status, skipped ? "unpaid" : "skipped")));
}

/** Change a single occurrence's due date (the bill's schedule stays the same). */
export async function rescheduleOccurrence(userId: string, occurrenceId: string, dueDate: string) {
  const db = await getDb();
  await db.update(schema.billOccurrences).set({ dueDate }).where(and(eq(schema.billOccurrences.id, occurrenceId), eq(schema.billOccurrences.userId, userId)));
}
