import "server-only";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Workspace, WorkspaceView } from "@/lib/settings";
import { logActivity } from "@/lib/activity";

export type Note = typeof schema.notes.$inferSelect;

export type NoteInput = { workspace: Workspace; title?: string | null; body: string; tags?: string[]; pinned?: boolean; clientId?: string | null; projectId?: string | null; isPrivate?: boolean };

export function parseTags(input: string | string[] | undefined | null): string[] {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : input.split(/[,\s]+/);
  return [...new Set(arr.map((t) => t.trim().replace(/^#/, "").toLowerCase()).filter(Boolean))].slice(0, 12);
}

export async function createNote(userId: string, input: NoteInput, source: "user" | "assistant" | "system" = "user") {
  const db = await getDb();
  const [n] = await db
    .insert(schema.notes)
    .values({ userId, workspace: input.workspace, title: input.title?.trim() || null, body: input.body.trim(), tags: parseTags(input.tags), pinned: !!input.pinned, clientId: input.clientId ?? null, projectId: input.projectId ?? null, isPrivate: !!input.isPrivate })
    .returning();
  await logActivity({ userId, workspace: input.workspace, entityType: "note", entityId: n.id, action: "create", summary: `Added note${n.title ? ` “${n.title}”` : ""}`, source });
  return n;
}

export async function updateNote(userId: string, id: string, patch: Partial<NoteInput> & { archived?: boolean }) {
  const db = await getDb();
  const { archived, tags, ...rest } = patch;
  const set: Partial<typeof schema.notes.$inferInsert> = { ...rest, updatedAt: new Date() };
  if (rest.title !== undefined) set.title = rest.title?.trim() || null;
  if (rest.body !== undefined) set.body = rest.body.trim();
  if (tags !== undefined) set.tags = parseTags(tags);
  if (archived !== undefined) set.archivedAt = archived ? new Date() : null;
  await db.update(schema.notes).set(set).where(and(eq(schema.notes.id, id), eq(schema.notes.userId, userId)));
}

export async function deleteNote(userId: string, id: string) {
  const db = await getDb();
  await db.delete(schema.notes).where(and(eq(schema.notes.id, id), eq(schema.notes.userId, userId)));
}

export async function getNote(userId: string, id: string) {
  const db = await getDb();
  return db.query.notes.findFirst({ where: and(eq(schema.notes.id, id), eq(schema.notes.userId, userId)) });
}

export async function listNotes(userId: string, f: { workspace?: WorkspaceView; search?: string; tag?: string; projectId?: string; clientId?: string; includeArchived?: boolean; limit?: number } = {}) {
  const db = await getDb();
  const conds = [eq(schema.notes.userId, userId)];
  if (f.workspace && f.workspace !== "combined") conds.push(eq(schema.notes.workspace, f.workspace));
  if (!f.includeArchived) conds.push(isNull(schema.notes.archivedAt));
  if (f.projectId) conds.push(eq(schema.notes.projectId, f.projectId));
  if (f.clientId) conds.push(eq(schema.notes.clientId, f.clientId));
  if (f.search) conds.push(or(ilike(schema.notes.title, `%${f.search}%`), ilike(schema.notes.body, `%${f.search}%`))!);
  if (f.tag) conds.push(sql`${schema.notes.tags} @> ${JSON.stringify([f.tag.toLowerCase()])}::jsonb`);
  return db.query.notes.findMany({ where: and(...conds), orderBy: [desc(schema.notes.pinned), desc(schema.notes.updatedAt)], limit: f.limit ?? 200 });
}
