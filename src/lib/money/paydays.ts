import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Workspace, WorkspaceView } from "@/lib/settings";
import { addDaysISO, addMonthsISO, occurrencesBetween, type Frequency } from "@/lib/dates";
import { createTransaction } from "./transactions";
import { logActivity } from "@/lib/activity";
import { fmtMoney } from "./format";

export type IncomeSchedule = typeof schema.incomeSchedules.$inferSelect;
export type PaydayOccurrence = typeof schema.paydayOccurrences.$inferSelect;

export async function ensurePaydayOccurrences(userId: string, s: IncomeSchedule, until: string) {
  const db = await getDb();
  if (!s.active) return;
  const list = occurrencesBetween({ frequency: s.frequency as Frequency, anchorDate: s.anchorDate, daysOfMonth: s.daysOfMonth }, s.anchorDate, until);
  if (!list.length) return;
  await db
    .insert(schema.paydayOccurrences)
    .values(list.map((o) => ({ scheduleId: s.id, userId, date: o.date, scheduledDate: o.scheduledDate, clamped: o.clamped, amountMinor: s.amountMinor })))
    .onConflictDoNothing({ target: [schema.paydayOccurrences.scheduleId, schema.paydayOccurrences.scheduledDate] });
}

export async function listSchedules(userId: string, workspace: WorkspaceView) {
  const db = await getDb();
  return db.query.incomeSchedules.findMany({ where: and(eq(schema.incomeSchedules.userId, userId), workspace === "combined" ? undefined : eq(schema.incomeSchedules.workspace, workspace)), orderBy: [asc(schema.incomeSchedules.name)] });
}

export async function ensureAllPaydays(userId: string, workspace: WorkspaceView, until: string) {
  const list = await listSchedules(userId, workspace);
  for (const s of list) await ensurePaydayOccurrences(userId, s, until);
}

export type PaydayRow = PaydayOccurrence & { schedule: IncomeSchedule };

export async function listPaydays(userId: string, workspace: WorkspaceView, from: string, to: string): Promise<PaydayRow[]> {
  const db = await getDb();
  await ensureAllPaydays(userId, workspace, to > addMonthsISO(from, 2) ? to : addMonthsISO(from, 2));
  const rows = await db
    .select({ occ: schema.paydayOccurrences, schedule: schema.incomeSchedules })
    .from(schema.paydayOccurrences)
    .innerJoin(schema.incomeSchedules, eq(schema.incomeSchedules.id, schema.paydayOccurrences.scheduleId))
    .where(and(eq(schema.paydayOccurrences.userId, userId), gte(schema.paydayOccurrences.date, from), lte(schema.paydayOccurrences.date, to), workspace === "combined" ? undefined : eq(schema.incomeSchedules.workspace, workspace), eq(schema.incomeSchedules.active, true)))
    .orderBy(asc(schema.paydayOccurrences.date));
  return rows.map((r) => ({ ...r.occ, schedule: r.schedule }));
}

export type PaycheckWindow = { payday: PaydayRow; start: string; end: string; next: PaydayRow | null };

/**
 * The paycheck window containing `date`: from that payday through the day before
 * the next one. Null when no payday schedule exists yet.
 */
export async function paycheckWindowFor(userId: string, workspace: Workspace, date: string): Promise<PaycheckWindow | null> {
  const list = await listPaydays(userId, workspace, addMonthsISO(date, -3), addMonthsISO(date, 3));
  if (!list.length) return null;
  let current: PaydayRow | null = null;
  let next: PaydayRow | null = null;
  for (const p of list) {
    if (p.date <= date) current = p;
    else {
      next = p;
      break;
    }
  }
  // Before the first scheduled payday there is no paycheck window yet; callers fall back to the month view.
  if (!current) return null;
  return { payday: current, start: current.date, end: next ? addDaysISO(next.date, -1) : addMonthsISO(current.date, 1), next };
}

export async function nextPayday(userId: string, workspace: WorkspaceView, afterDate: string): Promise<PaydayRow | null> {
  const list = await listPaydays(userId, workspace, addDaysISO(afterDate, 1), addMonthsISO(afterDate, 3));
  return list.find((p) => p.status !== "skipped") ?? null;
}

export async function createSchedule(userId: string, input: { workspace: Workspace; name: string; amountMinor: number; currency: string; accountId?: string | null; categoryId?: string | null; frequency: "monthly" | "semimonthly" | "biweekly" | "weekly"; daysOfMonth?: number[] | null; anchorDate: string }) {
  const db = await getDb();
  const [s] = await db
    .insert(schema.incomeSchedules)
    .values({ userId, workspace: input.workspace, name: input.name.trim(), amountMinor: input.amountMinor, currency: input.currency, accountId: input.accountId ?? null, categoryId: input.categoryId ?? null, frequency: input.frequency, daysOfMonth: input.daysOfMonth ?? null, anchorDate: input.anchorDate })
    .returning();
  await ensurePaydayOccurrences(userId, s, addMonthsISO(input.anchorDate, 14));
  await logActivity({ userId, workspace: input.workspace, entityType: "payday", entityId: s.id, action: "create", summary: `Added payday ${s.name} · ${fmtMoney(s.amountMinor, s.currency)} ${s.frequency}` });
  return s;
}

export async function updateSchedule(userId: string, id: string, patch: Partial<{ name: string; amountMinor: number; accountId: string | null; categoryId: string | null; frequency: "monthly" | "semimonthly" | "biweekly" | "weekly"; daysOfMonth: number[] | null; anchorDate: string; active: boolean }>) {
  const db = await getDb();
  const s = await db.query.incomeSchedules.findFirst({ where: and(eq(schema.incomeSchedules.id, id), eq(schema.incomeSchedules.userId, userId)) });
  if (!s) throw new Error("Payday schedule not found.");
  await db.update(schema.incomeSchedules).set(patch).where(eq(schema.incomeSchedules.id, id));
  if (patch.frequency !== undefined || patch.anchorDate !== undefined || patch.daysOfMonth !== undefined) {
    await db.delete(schema.paydayOccurrences).where(and(eq(schema.paydayOccurrences.scheduleId, id), eq(schema.paydayOccurrences.status, "expected")));
  } else if (patch.amountMinor !== undefined) {
    await db.update(schema.paydayOccurrences).set({ amountMinor: patch.amountMinor }).where(and(eq(schema.paydayOccurrences.scheduleId, id), eq(schema.paydayOccurrences.status, "expected")));
  }
  const updated = (await db.query.incomeSchedules.findFirst({ where: eq(schema.incomeSchedules.id, id) }))!;
  await ensurePaydayOccurrences(userId, updated, addMonthsISO(updated.anchorDate, 14));
  return updated;
}

/** Record that a payday arrived: one income transaction, linked once. */
export async function receivePayday(userId: string, occurrenceId: string, input: { accountId: string; date: string; amountMinor?: number; dopEquivalentMinor?: number | null }) {
  const db = await getDb();
  const row = await db
    .select({ occ: schema.paydayOccurrences, schedule: schema.incomeSchedules })
    .from(schema.paydayOccurrences)
    .innerJoin(schema.incomeSchedules, eq(schema.incomeSchedules.id, schema.paydayOccurrences.scheduleId))
    .where(and(eq(schema.paydayOccurrences.id, occurrenceId), eq(schema.paydayOccurrences.userId, userId)))
    .limit(1);
  const hit = row[0];
  if (!hit) throw new Error("Payday not found.");
  if (hit.occ.status === "received" && hit.occ.transactionId) return hit.occ;
  const tx = await createTransaction(userId, {
    workspace: hit.schedule.workspace,
    kind: "income",
    date: input.date,
    accountId: input.accountId,
    amountMinor: input.amountMinor ?? hit.occ.amountMinor,
    dopEquivalentMinor: input.dopEquivalentMinor,
    categoryId: hit.schedule.categoryId,
    merchant: hit.schedule.name,
    idempotencyKey: `payday:${hit.occ.id}`,
  });
  await db.update(schema.paydayOccurrences).set({ status: "received", transactionId: tx.id, amountMinor: tx.amountMinor }).where(eq(schema.paydayOccurrences.id, hit.occ.id));
  return { ...hit.occ, status: "received" as const, transactionId: tx.id };
}
