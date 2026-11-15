import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Workspace, WorkspaceView } from "@/lib/settings";
import { logActivity } from "@/lib/activity";
import { fmtMoney } from "./format";

export type Goal = typeof schema.goals.$inferSelect;
export type GoalWithProgress = Goal & { savedMinor: number; pct: number; contributions: number; accountName: string | null };

export async function listGoals(userId: string, workspace: WorkspaceView, opts: { includeArchived?: boolean } = {}): Promise<GoalWithProgress[]> {
  const db = await getDb();
  const goals = await db.query.goals.findMany({
    where: and(eq(schema.goals.userId, userId), workspace === "combined" ? undefined : eq(schema.goals.workspace, workspace), opts.includeArchived ? undefined : isNull(schema.goals.archivedAt)),
    orderBy: [asc(schema.goals.createdAt)],
  });
  if (!goals.length) return [];
  const ids = goals.map((g) => g.id);
  const movements = await db
    .select({ goalId: schema.transactions.goalId, kind: schema.transactions.kind, total: sql<number>`sum(${schema.transactions.amountMinor})`, n: sql<number>`count(*)` })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.userId, userId), inArray(schema.transactions.goalId, ids), inArray(schema.transactions.kind, ["transfer_in", "transfer_out", "income"])))
    .groupBy(schema.transactions.goalId, schema.transactions.kind);
  const accountIds = goals.map((g) => g.accountId).filter((x): x is string => !!x);
  const accs = accountIds.length ? await db.query.accounts.findMany({ where: inArray(schema.accounts.id, accountIds) }) : [];
  return goals.map((g) => {
    const inflow = movements.filter((m) => m.goalId === g.id && (m.kind === "transfer_in" || m.kind === "income")).reduce((s, m) => s + Number(m.total), 0);
    const outflow = movements.filter((m) => m.goalId === g.id && m.kind === "transfer_out").reduce((s, m) => s + Number(m.total), 0);
    const contributions = movements.filter((m) => m.goalId === g.id && m.kind === "transfer_in").reduce((s, m) => s + Number(m.n), 0);
    const savedMinor = g.startingMinor + inflow - outflow;
    return { ...g, savedMinor, pct: g.targetMinor > 0 ? Math.min(100, Math.round((savedMinor / g.targetMinor) * 100)) : 0, contributions, accountName: accs.find((a) => a.id === g.accountId)?.name ?? null };
  });
}

export async function createGoal(userId: string, input: { workspace: Workspace; name: string; targetMinor: number; currency: string; accountId?: string | null; startingMinor?: number; targetDate?: string | null; notes?: string | null }) {
  const db = await getDb();
  const [g] = await db.insert(schema.goals).values({ userId, workspace: input.workspace, name: input.name.trim(), targetMinor: input.targetMinor, currency: input.currency, accountId: input.accountId ?? null, startingMinor: input.startingMinor ?? 0, targetDate: input.targetDate ?? null, notes: input.notes ?? null }).returning();
  await logActivity({ userId, workspace: input.workspace, entityType: "goal", entityId: g.id, action: "create", summary: `Added savings goal ${g.name} · target ${fmtMoney(g.targetMinor, g.currency)}` });
  return g;
}

export async function updateGoal(userId: string, id: string, patch: Partial<{ name: string; targetMinor: number; accountId: string | null; startingMinor: number; targetDate: string | null; notes: string | null; archived: boolean }>) {
  const db = await getDb();
  const { archived, ...rest } = patch;
  await db
    .update(schema.goals)
    .set({ ...rest, ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}) })
    .where(and(eq(schema.goals.id, id), eq(schema.goals.userId, userId)));
}
