import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql, ilike } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { ChecklistItem, Recurrence } from "@/db/schema";
import type { Workspace, WorkspaceView } from "@/lib/settings";
import { addDaysISO, addMonthsISO, addWeeksISO, addYearsISO } from "@/lib/dates";
import { logActivity } from "@/lib/activity";
import { shortId } from "@/lib/ids";

export type Task = typeof schema.tasks.$inferSelect;

export type TaskInput = {
  workspace: Workspace;
  title: string;
  notes?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: Task["priority"];
  checklist?: string[] | ChecklistItem[];
  recurrence?: Recurrence;
  clientId?: string | null;
  projectId?: string | null;
  noteId?: string | null;
  billId?: string | null;
  invoiceId?: string | null;
  proposalId?: string | null;
};

function normalizeChecklist(items?: string[] | ChecklistItem[]): ChecklistItem[] {
  if (!items) return [];
  return items
    .map((it) => (typeof it === "string" ? { id: shortId(), text: it.trim(), done: false } : { id: it.id || shortId(), text: it.text.trim(), done: !!it.done }))
    .filter((it) => it.text);
}

export async function createTask(userId: string, input: TaskInput, source: "user" | "assistant" | "system" = "user") {
  const db = await getDb();
  const [t] = await db
    .insert(schema.tasks)
    .values({
      userId,
      workspace: input.workspace,
      title: input.title.trim(),
      notes: input.notes?.trim() || null,
      dueDate: input.dueDate || null,
      dueTime: input.dueTime || null,
      priority: input.priority ?? "normal",
      checklist: normalizeChecklist(input.checklist),
      recurrence: input.recurrence ?? null,
      clientId: input.clientId ?? null,
      projectId: input.projectId ?? null,
      noteId: input.noteId ?? null,
      billId: input.billId ?? null,
      invoiceId: input.invoiceId ?? null,
      proposalId: input.proposalId ?? null,
    })
    .returning();
  await logActivity({ userId, workspace: input.workspace, entityType: "task", entityId: t.id, action: "create", summary: `Added task “${t.title}”${t.dueDate ? ` due ${t.dueDate}` : ""}`, source });
  return t;
}

export async function updateTask(userId: string, id: string, patch: Partial<TaskInput> & { status?: Task["status"] }, source: "user" | "assistant" | "system" = "user") {
  const db = await getDb();
  const before = await db.query.tasks.findFirst({ where: and(eq(schema.tasks.id, id), eq(schema.tasks.userId, userId)) });
  if (!before) throw new Error("Task not found.");
  const { checklist, ...rest } = patch;
  const set: Partial<typeof schema.tasks.$inferInsert> = { ...rest, updatedAt: new Date() };
  if (rest.title !== undefined) set.title = rest.title.trim();
  if (checklist !== undefined) set.checklist = normalizeChecklist(checklist);
  if (rest.status === "done") set.completedAt = new Date();
  if (rest.status === "open") set.completedAt = null;
  await db.update(schema.tasks).set(set).where(eq(schema.tasks.id, id));
  const dueChanged = patch.dueDate !== undefined && patch.dueDate !== before.dueDate;
  await logActivity({ userId, workspace: before.workspace, entityType: "task", entityId: id, action: "update", summary: `Edited task “${before.title}”${dueChanged ? ` · due date ${before.dueDate ?? "none"} → ${patch.dueDate ?? "none"}` : ""}`, details: patch, source });
}

/** Complete a task. Recurring tasks spawn the next occurrence and keep future ones scheduled. */
export async function completeTask(userId: string, id: string, source: "user" | "assistant" | "system" = "user") {
  const db = await getDb();
  const t = await db.query.tasks.findFirst({ where: and(eq(schema.tasks.id, id), eq(schema.tasks.userId, userId)) });
  if (!t || t.status === "done") return t;
  await db.update(schema.tasks).set({ status: "done", completedAt: new Date(), updatedAt: new Date() }).where(eq(schema.tasks.id, id));
  await db.update(schema.reminderStates).set({ resolvedAt: new Date() }).where(and(eq(schema.reminderStates.userId, userId), eq(schema.reminderStates.itemType, "task"), eq(schema.reminderStates.itemId, id)));
  if (t.recurrence && t.dueDate) {
    const r = t.recurrence;
    const n = Math.max(1, r.interval || 1);
    const next = r.frequency === "daily" ? addDaysISO(t.dueDate, n) : r.frequency === "weekly" ? addWeeksISO(t.dueDate, n) : r.frequency === "monthly" ? addMonthsISO(t.dueDate, n) : addYearsISO(t.dueDate, n);
    await db.insert(schema.tasks).values({
      userId,
      workspace: t.workspace,
      title: t.title,
      notes: t.notes,
      dueDate: next,
      dueTime: t.dueTime,
      priority: t.priority,
      checklist: t.checklist.map((c) => ({ ...c, done: false })),
      recurrence: t.recurrence,
      clientId: t.clientId,
      projectId: t.projectId,
      noteId: t.noteId,
      billId: t.billId,
      invoiceId: t.invoiceId,
      proposalId: t.proposalId,
    });
  }
  await logActivity({ userId, workspace: t.workspace, entityType: "task", entityId: id, action: "complete", summary: `Completed “${t.title}”`, source });
  return { ...t, status: "done" as const };
}

export async function reopenTask(userId: string, id: string) {
  const db = await getDb();
  await db.update(schema.tasks).set({ status: "open", completedAt: null, updatedAt: new Date() }).where(and(eq(schema.tasks.id, id), eq(schema.tasks.userId, userId)));
  await db.update(schema.reminderStates).set({ resolvedAt: null }).where(and(eq(schema.reminderStates.userId, userId), eq(schema.reminderStates.itemType, "task"), eq(schema.reminderStates.itemId, id)));
}

export async function cancelTask(userId: string, id: string) {
  const db = await getDb();
  await db.update(schema.tasks).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(schema.tasks.id, id), eq(schema.tasks.userId, userId)));
  await db.update(schema.reminderStates).set({ resolvedAt: new Date() }).where(and(eq(schema.reminderStates.userId, userId), eq(schema.reminderStates.itemType, "task"), eq(schema.reminderStates.itemId, id)));
}

export async function deleteTask(userId: string, id: string) {
  const db = await getDb();
  await db.delete(schema.tasks).where(and(eq(schema.tasks.id, id), eq(schema.tasks.userId, userId)));
}

export async function toggleChecklistItem(userId: string, taskId: string, itemId: string, done: boolean) {
  const db = await getDb();
  const t = await db.query.tasks.findFirst({ where: and(eq(schema.tasks.id, taskId), eq(schema.tasks.userId, userId)) });
  if (!t) throw new Error("Task not found.");
  await db.update(schema.tasks).set({ checklist: t.checklist.map((c) => (c.id === itemId ? { ...c, done } : c)), updatedAt: new Date() }).where(eq(schema.tasks.id, taskId));
}

export type TaskFilters = { workspace?: WorkspaceView; status?: "open" | "done" | "cancelled" | "all"; dueFrom?: string; dueTo?: string; projectId?: string; clientId?: string; search?: string; limit?: number; includeUndated?: boolean };

export type TaskRow = Task & { projectName: string | null; clientName: string | null };

export async function listTasks(userId: string, f: TaskFilters = {}): Promise<TaskRow[]> {
  const db = await getDb();
  const conds = [eq(schema.tasks.userId, userId)];
  if (f.workspace && f.workspace !== "combined") conds.push(eq(schema.tasks.workspace, f.workspace));
  if (f.status && f.status !== "all") conds.push(eq(schema.tasks.status, f.status));
  if (f.dueFrom || f.dueTo) {
    const range = and(f.dueFrom ? gte(schema.tasks.dueDate, f.dueFrom) : undefined, f.dueTo ? lte(schema.tasks.dueDate, f.dueTo) : undefined)!;
    conds.push(f.includeUndated ? or(range, isNull(schema.tasks.dueDate))! : range);
  }
  if (f.projectId) conds.push(eq(schema.tasks.projectId, f.projectId));
  if (f.clientId) conds.push(eq(schema.tasks.clientId, f.clientId));
  if (f.search) conds.push(or(ilike(schema.tasks.title, `%${f.search}%`), ilike(schema.tasks.notes, `%${f.search}%`))!);
  const rows = await db
    .select({ t: schema.tasks, projectName: schema.projects.name, clientName: schema.clients.company })
    .from(schema.tasks)
    .leftJoin(schema.projects, eq(schema.projects.id, schema.tasks.projectId))
    .leftJoin(schema.clients, eq(schema.clients.id, schema.tasks.clientId))
    .where(and(...conds))
    .orderBy(sql`${schema.tasks.dueDate} asc nulls last`, asc(schema.tasks.dueTime), desc(schema.tasks.priority), asc(schema.tasks.createdAt))
    .limit(f.limit ?? 300);
  return rows.map((r) => ({ ...r.t, projectName: r.projectName, clientName: r.clientName }));
}

export async function getTask(userId: string, id: string): Promise<TaskRow | null> {
  const rows = await listTasks(userId, { status: "all", limit: 1000 });
  return rows.find((t) => t.id === id) ?? null;
}

/** Open tasks due on or before `date` (overdue + today), plus high-priority undated ones. */
export async function dueTasks(userId: string, workspace: WorkspaceView, date: string) {
  const list = await listTasks(userId, { workspace, status: "open", dueTo: date });
  return list.filter((t) => t.dueDate && t.dueDate <= date);
}

export async function tasksInRange(userId: string, workspace: WorkspaceView, from: string, to: string) {
  return listTasks(userId, { workspace, status: "all", dueFrom: from, dueTo: to });
}

export { inArray };
