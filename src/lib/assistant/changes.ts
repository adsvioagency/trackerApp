import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { ChangePreview } from "@/db/schema";
import { createTask, getTask, updateTask, completeTask } from "@/lib/tasks";
import { updateProject } from "@/lib/business/projects";
import { createNote } from "@/lib/notes";
import { logActivity } from "@/lib/activity";

/**
 * Proposed changes: the assistant can only write here. Nothing touches real
 * records until the owner presses Apply. Money movement and outbound client
 * communication are not available actions.
 */

export type ProposedChange = typeof schema.proposedChanges.$inferSelect;
type Ws = "personal" | "business";
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const s = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export type ProposalInput =
  | { action: "task.create"; workspace: Ws; title: string; dueDate?: string | null; notes?: string | null; projectId?: string | null; clientId?: string | null }
  | { action: "task.update"; taskId: string; title?: string; dueDate?: string | null; complete?: boolean }
  | { action: "project.update"; projectId: string; nextAction?: string | null; waitingOnClient?: boolean; followUpDate?: string | null; targetDate?: string | null }
  | { action: "note.create"; workspace: Ws; title?: string | null; body: string };

async function own<T extends { userId: string }>(row: T | undefined | null, userId: string, what: string): Promise<T> {
  if (!row || row.userId !== userId) throw new Error(`${what} not found.`);
  return row;
}

/** Validate input against current records and store a previewable proposal. */
export async function proposeChange(userId: string, conversationId: string | null, raw: Record<string, unknown>): Promise<ProposedChange> {
  const db = await getDb();
  const action = s(raw.action);
  let entityType = "";
  let entityId: string | null = null;
  let summary = "";
  let payload: Record<string, unknown> = {};
  let preview: ChangePreview[] = [];

  if (action === "task.create") {
    const workspace: Ws = raw.workspace === "business" ? "business" : "personal";
    const title = s(raw.title, 200);
    if (!title) throw new Error("A task needs a title.");
    const dueDate = isDate(raw.dueDate) ? raw.dueDate : null;
    let projectId: string | null = null;
    let clientId: string | null = null;
    if (typeof raw.projectId === "string" && raw.projectId) {
      const p = await own(await db.query.projects.findFirst({ where: eq(schema.projects.id, raw.projectId) }), userId, "Project");
      projectId = p.id;
      clientId = p.clientId;
    } else if (typeof raw.clientId === "string" && raw.clientId) {
      clientId = (await own(await db.query.clients.findFirst({ where: eq(schema.clients.id, raw.clientId) }), userId, "Client")).id;
    }
    entityType = "task";
    summary = `Create ${workspace} task “${title}”${dueDate ? ` due ${dueDate}` : ""}`;
    payload = { workspace, title, dueDate, notes: s(raw.notes, 2000) || null, projectId, clientId };
    preview = [
      { field: "Title", from: null, to: title },
      { field: "Workspace", from: null, to: workspace },
      { field: "Due date", from: null, to: dueDate },
    ];
  } else if (action === "task.update") {
    const t = await getTask(userId, s(raw.taskId, 64));
    if (!t) throw new Error("Task not found.");
    entityType = "task";
    entityId = t.id;
    const patch: Record<string, unknown> = {};
    if (raw.title !== undefined && s(raw.title, 200) && s(raw.title, 200) !== t.title) {
      patch.title = s(raw.title, 200);
      preview.push({ field: "Title", from: t.title, to: patch.title as string });
    }
    if (raw.dueDate !== undefined && (raw.dueDate === null || isDate(raw.dueDate)) && raw.dueDate !== t.dueDate) {
      patch.dueDate = raw.dueDate;
      preview.push({ field: "Due date", from: t.dueDate, to: raw.dueDate as string | null });
    }
    if (raw.complete === true && t.status !== "done") {
      patch.complete = true;
      preview.push({ field: "Status", from: t.status, to: "done" });
    }
    if (!preview.length) throw new Error("Nothing would change on that task.");
    summary = `Update task “${t.title}”`;
    payload = { taskId: t.id, ...patch };
  } else if (action === "project.update") {
    const p = await own(await db.query.projects.findFirst({ where: eq(schema.projects.id, s(raw.projectId, 64)) }), userId, "Project");
    entityType = "project";
    entityId = p.id;
    const patch: Record<string, unknown> = {};
    if (raw.nextAction !== undefined && (s(raw.nextAction, 300) || null) !== p.nextAction) {
      patch.nextAction = s(raw.nextAction, 300) || null;
      preview.push({ field: "Next action", from: p.nextAction, to: patch.nextAction as string | null });
    }
    if (typeof raw.waitingOnClient === "boolean" && raw.waitingOnClient !== p.waitingOnClient) {
      patch.waitingOnClient = raw.waitingOnClient;
      preview.push({ field: "Waiting on client", from: p.waitingOnClient ? "Yes" : "No", to: raw.waitingOnClient ? "Yes" : "No" });
    }
    for (const [key, label] of [["followUpDate", "Follow-up date"], ["targetDate", "Target date"]] as const) {
      const v = raw[key];
      if (v !== undefined && (v === null || isDate(v)) && v !== p[key]) {
        patch[key] = v;
        preview.push({ field: label, from: p[key], to: v as string | null });
      }
    }
    if (!preview.length) throw new Error("Nothing would change on that project.");
    summary = `Update project “${p.name}”`;
    payload = { projectId: p.id, ...patch };
  } else if (action === "note.create") {
    const workspace: Ws = raw.workspace === "business" ? "business" : "personal";
    const body = s(raw.body, 8000);
    if (!body) throw new Error("A note needs some text.");
    const title = s(raw.title, 200) || null;
    entityType = "note";
    summary = `Save a ${workspace} note${title ? ` “${title}”` : ""}`;
    payload = { workspace, title, body };
    preview = [
      { field: "Title", from: null, to: title },
      { field: "Text", from: null, to: body.length > 240 ? body.slice(0, 240) + "…" : body },
    ];
  } else {
    throw new Error(`“${action}” is not something the assistant can propose. It can create or update tasks, update project follow-ups, and save notes.`);
  }

  const [row] = await db.insert(schema.proposedChanges).values({ userId, conversationId, action, entityType, entityId, summary, payload, preview }).returning();
  return row;
}

export async function listProposedChanges(userId: string, conversationId: string) {
  const db = await getDb();
  return db.query.proposedChanges.findMany({ where: and(eq(schema.proposedChanges.userId, userId), eq(schema.proposedChanges.conversationId, conversationId)), orderBy: [desc(schema.proposedChanges.createdAt)] });
}

/** Apply a proposal on the owner's explicit approval. Idempotent: applying twice is a no-op. */
export async function applyProposedChange(userId: string, id: string): Promise<ProposedChange> {
  const db = await getDb();
  const ch = await db.query.proposedChanges.findFirst({ where: and(eq(schema.proposedChanges.id, id), eq(schema.proposedChanges.userId, userId)) });
  if (!ch) throw new Error("Proposed change not found.");
  if (ch.status !== "proposed") return ch;
  // Claim first so a double-submit cannot apply twice.
  const claimed = await db
    .update(schema.proposedChanges)
    .set({ status: "applied", appliedAt: new Date() })
    .where(and(eq(schema.proposedChanges.id, id), eq(schema.proposedChanges.status, "proposed")))
    .returning();
  if (!claimed.length) return ch;
  const p = ch.payload as Record<string, unknown>;
  let entityId = ch.entityId;
  try {
    if (ch.action === "task.create") {
      const t = await createTask(userId, { workspace: p.workspace as Ws, title: p.title as string, dueDate: (p.dueDate as string) ?? null, notes: (p.notes as string) ?? null, projectId: (p.projectId as string) ?? null, clientId: (p.clientId as string) ?? null }, "assistant");
      entityId = t.id;
    } else if (ch.action === "task.update") {
      const { taskId, complete, ...patch } = p as { taskId: string; complete?: boolean; title?: string; dueDate?: string | null };
      if (Object.keys(patch).length) await updateTask(userId, taskId, patch, "assistant");
      if (complete) await completeTask(userId, taskId, "assistant");
    } else if (ch.action === "project.update") {
      const { projectId, ...patch } = p as { projectId: string; nextAction?: string | null; waitingOnClient?: boolean; followUpDate?: string | null; targetDate?: string | null };
      await updateProject(userId, projectId, patch, "assistant");
    } else if (ch.action === "note.create") {
      const n = await createNote(userId, { workspace: p.workspace as Ws, title: (p.title as string) ?? null, body: p.body as string }, "assistant");
      entityId = n.id;
    }
  } catch (e) {
    await db.update(schema.proposedChanges).set({ status: "proposed", appliedAt: null }).where(eq(schema.proposedChanges.id, id));
    throw e;
  }
  const [done] = await db.update(schema.proposedChanges).set({ entityId }).where(eq(schema.proposedChanges.id, id)).returning();
  await logActivity({ userId, entityType: ch.entityType, entityId, action: "assistant.apply", summary: `Applied assistant suggestion: ${ch.summary}`, details: { proposedChangeId: id, preview: ch.preview }, source: "assistant" });
  return done;
}

export async function rejectProposedChange(userId: string, id: string) {
  const db = await getDb();
  await db.update(schema.proposedChanges).set({ status: "rejected" }).where(and(eq(schema.proposedChanges.id, id), eq(schema.proposedChanges.userId, userId), eq(schema.proposedChanges.status, "proposed")));
}
