import "server-only";
import { and, asc, desc, eq, ilike, inArray, max, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import type { WorkspaceView } from "@/lib/settings";

const date = z.iso.date().nullable();
const goalInput = z.object({
  workspace: z.enum(["personal", "business"]),
  year: z.number().int().min(1900).max(9999),
  area: z.string().trim().min(1, "Enter an area for this goal.").max(60),
  title: z.string().trim().min(1, "Enter a goal name.").max(140),
  motivation: z.string().trim().max(2000).nullable(),
  outcome: z.string().trim().max(2000).nullable(),
  dueDate: date,
});
const milestoneInput = z.object({
  title: z.string().trim().min(1, "Enter a milestone name.").max(180),
  dueDate: date,
});
const idInput = z.uuid();

export type TrackedGoal = typeof schema.trackedGoals.$inferSelect;
export type GoalMilestone = typeof schema.goalMilestones.$inferSelect;
export type GoalInput = z.input<typeof goalInput>;
type MilestoneInput = z.input<typeof milestoneInput>;

function parse<T>(validator: z.ZodType<T>, input: unknown): T {
  const result = validator.safeParse(input);
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Check the details and try again.");
  return result.data;
}

function ownerGoal(userId: string, id: string) {
  return and(eq(schema.trackedGoals.userId, userId), eq(schema.trackedGoals.id, parse(idInput, id)));
}

export async function listTrackedGoals(userId: string, view: WorkspaceView, opts: { year?: number; search?: string } = {}) {
  const db = await getDb();
  const table = schema.trackedGoals;
  const filters: (SQL | undefined)[] = [eq(table.userId, userId)];
  if (view !== "combined") filters.push(eq(table.workspace, view));
  if (opts.year !== undefined) filters.push(eq(table.year, opts.year));
  if (opts.search) {
    const query = "%" + opts.search.replace(/[\\%_]/g, "\\$&") + "%";
    filters.push(or(ilike(table.title, query), ilike(table.area, query), ilike(table.outcome, query)));
  }
  const goals = await db.select().from(table).where(and(...filters)).orderBy(asc(table.area), desc(table.createdAt), asc(table.id));
  if (!goals.length) return [];
  const milestones = await db.select().from(schema.goalMilestones)
    .where(inArray(schema.goalMilestones.goalId, goals.map((goal) => goal.id)))
    .orderBy(asc(schema.goalMilestones.position), asc(schema.goalMilestones.id));
  const byGoal = new Map<string, GoalMilestone[]>();
  for (const milestone of milestones) {
    const list = byGoal.get(milestone.goalId) ?? [];
    list.push(milestone);
    byGoal.set(milestone.goalId, list);
  }
  return goals.map((goal) => ({ ...goal, milestones: byGoal.get(goal.id) ?? [] }));
}

export async function getTrackedGoal(userId: string, id: string) {
  if (!idInput.safeParse(id).success) return null;
  const db = await getDb();
  const [goal] = await db.select().from(schema.trackedGoals).where(ownerGoal(userId, id)).limit(1);
  if (!goal) return null;
  const milestones = await db.select().from(schema.goalMilestones).where(eq(schema.goalMilestones.goalId, id))
    .orderBy(asc(schema.goalMilestones.position), asc(schema.goalMilestones.id));
  return { ...goal, milestones };
}

export async function saveTrackedGoal(userId: string, input: GoalInput, id?: string, steps: string[] = []) {
  const data = parse(goalInput, input);
  const db = await getDb();
  if (id) {
    const [updated] = await db.update(schema.trackedGoals).set(data).where(ownerGoal(userId, id)).returning();
    if (!updated) throw new Error("Goal not found.");
    return updated.id;
  }
  const initial = parse(z.array(milestoneInput).max(20, "Start with up to 20 milestones."), steps.map((title) => ({ title, dueDate: null })));
  return db.transaction(async (tx) => {
    const [goal] = await tx.insert(schema.trackedGoals).values({ ...data, userId }).returning();
    if (initial.length) await tx.insert(schema.goalMilestones).values(initial.map((step, position) => ({ ...step, position, goalId: goal.id })));
    return goal.id;
  });
}

export async function changeGoalStatus(userId: string, id: string, change: "complete" | "reopen" | "archive" | "restore") {
  const table = schema.trackedGoals;
  const data = {
    complete: { completedAt: new Date() },
    reopen: { completedAt: null },
    archive: { archivedAt: new Date() },
    restore: { archivedAt: null },
  }[change];
  const db = await getDb();
  const [updated] = await db.update(table).set(data).where(ownerGoal(userId, id)).returning();
  if (!updated) throw new Error("Goal not found.");
}

export async function writeMilestone(
  userId: string,
  goalId: string,
  operation: { type: "save"; data: MilestoneInput; id?: string } | { type: "toggle"; id: string; done: boolean } | { type: "remove"; id: string },
) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [goal] = await tx.select({ id: schema.trackedGoals.id, archivedAt: schema.trackedGoals.archivedAt })
      .from(schema.trackedGoals).where(ownerGoal(userId, goalId)).for("update");
    if (!goal) throw new Error("Goal not found.");
    if (goal.archivedAt) throw new Error("Restore this goal to change its milestones.");
    const table = schema.goalMilestones;
    if (operation.type === "save" && !operation.id) {
      const [last] = await tx.select({ position: max(table.position) }).from(table).where(eq(table.goalId, goalId));
      await tx.insert(table).values({ ...parse(milestoneInput, operation.data), goalId, position: (last.position ?? -1) + 1 });
      return;
    }
    const where = and(eq(table.goalId, goalId), eq(table.id, parse(idInput, operation.id)));
    const updated = operation.type === "remove"
      ? await tx.delete(table).where(where).returning()
      : await tx.update(table).set(operation.type === "toggle"
        ? { completedAt: operation.done ? new Date() : null }
        : parse(milestoneInput, operation.data)).where(where).returning();
    if (!updated.length) throw new Error("Milestone not found.");
  });
}
