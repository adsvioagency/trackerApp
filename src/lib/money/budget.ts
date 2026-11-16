import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Workspace } from "@/lib/settings";
import { addMonthsKey, monthEnd, monthKey, monthStart } from "@/lib/dates";
import { getCategoryTree, type CategoryKind } from "./categories";
import { spendingByCategory } from "./transactions";
import { listPaydays, paycheckWindowFor, type PaydayRow } from "./paydays";
import { logActivity } from "@/lib/activity";
import { fmtMoney } from "./format";

export type BudgetPeriod =
  | { type: "month"; month: string; from: string; to: string }
  | { type: "paycheck"; paydayId: string; month: string; from: string; to: string; payday: PaydayRow; next: PaydayRow | null };

export type BudgetLine = {
  categoryId: string;
  name: string;
  groupId: string;
  groupName: string;
  kind: CategoryKind;
  /** Plan for this period (month: month line + paycheck lines; paycheck: that paycheck's line). */
  targetMinor: number;
  monthLineMinor: number;
  paycheckAllocations: { paydayId: string; date: string; amountMinor: number }[];
  rolloverEnabled: boolean;
  carryMinor: number;
  adjustmentMinor: number;
  availableMinor: number; // target + carry + adjustment
  actualMinor: number; // DOP
  remainingMinor: number; // available − actual
  missingCount: number;
  headroomPct: number | null;
};

export type BudgetPlan = {
  period: BudgetPeriod;
  lines: BudgetLine[];
  groups: { id: string; name: string; kind: CategoryKind; targetMinor: number; actualMinor: number; remainingMinor: number; lines: BudgetLine[] }[];
  totals: { targetMinor: number; availableMinor: number; actualMinor: number; remainingMinor: number; expectedIncomeMinor: number; leftToAssignMinor: number; missingCount: number; uncategorizedMinor: number };
  paydaysInMonth: PaydayRow[];
};

export async function resolvePeriod(userId: string, workspace: Workspace, p: { type: "month"; month: string } | { type: "paycheck"; date?: string; paydayId?: string }): Promise<BudgetPeriod | null> {
  if (p.type === "month") return { type: "month", month: p.month, from: monthStart(p.month), to: monthEnd(p.month) };
  const db = await getDb();
  let date = p.date;
  if (p.paydayId) {
    const occ = await db.query.paydayOccurrences.findFirst({ where: and(eq(schema.paydayOccurrences.id, p.paydayId), eq(schema.paydayOccurrences.userId, userId)) });
    if (occ) date = occ.date;
  }
  if (!date) return null;
  const win = await paycheckWindowFor(userId, workspace, date);
  if (!win) return null;
  return { type: "paycheck", paydayId: win.payday.id, month: monthKey(win.start), from: win.start, to: win.end, payday: win.payday, next: win.next };
}

async function linesFor(userId: string, workspace: Workspace, periodType: "month" | "paycheck", keys: string[]) {
  if (!keys.length) return [];
  const db = await getDb();
  return db.query.budgetLines.findMany({ where: and(eq(schema.budgetLines.userId, userId), eq(schema.budgetLines.workspace, workspace), eq(schema.budgetLines.periodType, periodType), inArray(schema.budgetLines.periodKey, keys)) });
}

/** Month target per category = month line + paycheck lines for paydays dated inside the month. */
async function monthTargets(userId: string, workspace: Workspace, month: string): Promise<{ targets: Map<string, number>; monthLines: Map<string, number>; paycheckLines: Map<string, { paydayId: string; date: string; amountMinor: number }[]>; paydays: PaydayRow[] }> {
  const paydays = await listPaydays(userId, workspace, monthStart(month), monthEnd(month));
  const mLines = await linesFor(userId, workspace, "month", [month]);
  const pLines = await linesFor(
    userId,
    workspace,
    "paycheck",
    paydays.map((p) => p.id),
  );
  const targets = new Map<string, number>();
  const monthLines = new Map<string, number>();
  const paycheckLines = new Map<string, { paydayId: string; date: string; amountMinor: number }[]>();
  for (const l of mLines) {
    monthLines.set(l.categoryId, l.amountMinor);
    targets.set(l.categoryId, (targets.get(l.categoryId) ?? 0) + l.amountMinor);
  }
  for (const l of pLines) {
    const pd = paydays.find((p) => p.id === l.periodKey)!;
    paycheckLines.set(l.categoryId, [...(paycheckLines.get(l.categoryId) ?? []), { paydayId: pd.id, date: pd.date, amountMinor: l.amountMinor }]);
    targets.set(l.categoryId, (targets.get(l.categoryId) ?? 0) + l.amountMinor);
  }
  return { targets, monthLines, paycheckLines, paydays };
}

/** Carry into `month` for rollover-enabled categories, walking forward from each category's start month. */
async function carryInto(userId: string, workspace: Workspace, month: string, enabled: Map<string, string>): Promise<Map<string, number>> {
  const carry = new Map<string, number>();
  if (!enabled.size) return carry;
  const db = await getDb();
  const earliest = [...enabled.values()].sort()[0];
  const adjustments = await db.query.rolloverAdjustments.findMany({ where: and(eq(schema.rolloverAdjustments.userId, userId), inArray(schema.rolloverAdjustments.categoryId, [...enabled.keys()])) });
  let m = earliest;
  let guard = 0;
  while (m < month && guard++ < 36) {
    const { targets } = await monthTargets(userId, workspace, m);
    const spend = await spendingByCategory(userId, workspace, monthStart(m), monthEnd(m));
    for (const [catId, since] of enabled) {
      if (m < since) continue;
      const prev = carry.get(catId) ?? 0;
      const adj = adjustments.filter((a) => a.categoryId === catId && a.month === m).reduce((s, a) => s + a.amountMinor, 0);
      const target = targets.get(catId) ?? 0;
      const actual = spend.lines.get(catId)?.dopMinor ?? 0;
      carry.set(catId, prev + target + adj - actual);
    }
    m = addMonthsKey(m, 1);
  }
  return carry;
}

export async function getBudgetPlan(userId: string, workspace: Workspace, period: BudgetPeriod): Promise<BudgetPlan> {
  const db = await getDb();
  const tree = await getCategoryTree(userId, workspace);
  const budgetable = tree.filter((g) => g.kind !== "income");
  const catIds = budgetable.flatMap((g) => g.categories.map((c) => c.id));
  const rollovers = catIds.length ? await db.query.rolloverSettings.findMany({ where: and(eq(schema.rolloverSettings.userId, userId), inArray(schema.rolloverSettings.categoryId, catIds), eq(schema.rolloverSettings.enabled, true)) }) : [];
  const enabled = new Map(rollovers.map((r) => [r.categoryId, r.sinceMonth ?? period.month]));
  const adjustmentsRows = catIds.length ? await db.query.rolloverAdjustments.findMany({ where: and(eq(schema.rolloverAdjustments.userId, userId), inArray(schema.rolloverAdjustments.categoryId, catIds), eq(schema.rolloverAdjustments.month, period.month)) }) : [];

  const month = await monthTargets(userId, workspace, period.month);
  const carry = period.type === "month" ? await carryInto(userId, workspace, period.month, enabled) : new Map<string, number>();
  const spend = await spendingByCategory(userId, workspace, period.from, period.to);

  const lines: BudgetLine[] = [];
  for (const g of budgetable) {
    for (const c of g.categories) {
      const paycheckAllocations = month.paycheckLines.get(c.id) ?? [];
      const monthLineMinor = month.monthLines.get(c.id) ?? 0;
      const targetMinor = period.type === "month" ? month.targets.get(c.id) ?? 0 : paycheckAllocations.find((a) => a.paydayId === period.paydayId)?.amountMinor ?? 0;
      const rolloverEnabled = enabled.has(c.id);
      const carryMinor = period.type === "month" ? carry.get(c.id) ?? 0 : 0;
      const adjustmentMinor = period.type === "month" ? adjustmentsRows.filter((a) => a.categoryId === c.id).reduce((s, a) => s + a.amountMinor, 0) : 0;
      const s = spend.lines.get(c.id);
      const actualMinor = s?.dopMinor ?? 0;
      const availableMinor = targetMinor + carryMinor + adjustmentMinor;
      const line: BudgetLine = {
        categoryId: c.id,
        name: c.name,
        groupId: g.id,
        groupName: g.name,
        kind: g.kind,
        targetMinor,
        monthLineMinor,
        paycheckAllocations,
        rolloverEnabled,
        carryMinor,
        adjustmentMinor,
        availableMinor,
        actualMinor,
        remainingMinor: availableMinor - actualMinor,
        missingCount: s?.missingCount ?? 0,
        headroomPct: availableMinor > 0 ? Math.round(((availableMinor - actualMinor) / availableMinor) * 100) : null,
      };
      lines.push(line);
    }
  }
  const groups = budgetable.map((g) => {
    const gl = lines.filter((l) => l.groupId === g.id);
    return { id: g.id, name: g.name, kind: g.kind, targetMinor: gl.reduce((s, l) => s + l.targetMinor, 0), actualMinor: gl.reduce((s, l) => s + l.actualMinor, 0), remainingMinor: gl.reduce((s, l) => s + l.remainingMinor, 0), lines: gl };
  });
  const targetMinor = lines.reduce((s, l) => s + l.targetMinor, 0);
  const availableMinor = lines.reduce((s, l) => s + l.availableMinor, 0);
  const actualMinor = lines.reduce((s, l) => s + l.actualMinor, 0);
  const expectedIncomeMinor =
    period.type === "month"
      ? month.paydays.filter((p) => p.status !== "skipped" && p.schedule.currency === "DOP").reduce((s, p) => s + p.amountMinor, 0)
      : period.payday.schedule.currency === "DOP"
        ? period.payday.amountMinor
        : 0;
  const uncategorizedMinor = spend.lines.get(null)?.dopMinor ?? 0;
  return {
    period,
    lines,
    groups,
    totals: { targetMinor, availableMinor, actualMinor, remainingMinor: availableMinor - actualMinor, expectedIncomeMinor, leftToAssignMinor: expectedIncomeMinor - targetMinor, missingCount: spend.missingCount, uncategorizedMinor },
    paydaysInMonth: month.paydays,
  };
}

export async function setBudgetLine(userId: string, workspace: Workspace, categoryId: string, periodType: "month" | "paycheck", periodKey: string, amountMinor: number) {
  const db = await getDb();
  if (amountMinor <= 0) {
    await db.delete(schema.budgetLines).where(and(eq(schema.budgetLines.userId, userId), eq(schema.budgetLines.categoryId, categoryId), eq(schema.budgetLines.periodType, periodType), eq(schema.budgetLines.periodKey, periodKey)));
  } else {
    await db
      .insert(schema.budgetLines)
      .values({ userId, workspace, categoryId, periodType, periodKey, amountMinor })
      .onConflictDoUpdate({ target: [schema.budgetLines.userId, schema.budgetLines.categoryId, schema.budgetLines.periodType, schema.budgetLines.periodKey], set: { amountMinor } });
  }
  await logActivity({ userId, workspace, entityType: "budget", entityId: categoryId, action: "set", summary: `Set ${periodType} budget line to ${fmtMoney(amountMinor)} (${periodKey})` });
}

export async function setRollover(userId: string, categoryId: string, enabled: boolean, sinceMonth: string) {
  const db = await getDb();
  await db
    .insert(schema.rolloverSettings)
    .values({ userId, categoryId, enabled, sinceMonth })
    .onConflictDoUpdate({ target: [schema.rolloverSettings.userId, schema.rolloverSettings.categoryId], set: { enabled, sinceMonth } });
}

export async function addRolloverAdjustment(userId: string, categoryId: string, month: string, amountMinor: number, note?: string) {
  const db = await getDb();
  await db.insert(schema.rolloverAdjustments).values({ userId, categoryId, month, amountMinor, note: note ?? null });
  await logActivity({ userId, entityType: "budget", entityId: categoryId, action: "rollover_adjust", summary: `Rollover adjustment ${fmtMoney(amountMinor, "DOP", { signed: true })} for ${month}${note ? ` · ${note}` : ""}` });
}

/** Copy last month's month lines into a month that has none yet. */
export async function copyPreviousMonthPlan(userId: string, workspace: Workspace, month: string) {
  const db = await getDb();
  const prev = addMonthsKey(month, -1);
  const existing = await linesFor(userId, workspace, "month", [month]);
  if (existing.length) return 0;
  const lines = await linesFor(userId, workspace, "month", [prev]);
  if (!lines.length) return 0;
  await db.insert(schema.budgetLines).values(lines.map((l) => ({ userId, workspace, categoryId: l.categoryId, periodType: "month", periodKey: month, amountMinor: l.amountMinor }))).onConflictDoNothing();
  return lines.length;
}
