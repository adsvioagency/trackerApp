import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Workspace, WorkspaceView } from "@/lib/settings";
import { logActivity } from "@/lib/activity";

export type Event = typeof schema.events.$inferSelect;

export async function createEvent(userId: string, input: { workspace: Workspace; title: string; startAt: Date; endAt?: Date | null; allDay?: boolean; location?: string | null; notes?: string | null; clientId?: string | null; projectId?: string | null }) {
  const db = await getDb();
  const [e] = await db.insert(schema.events).values({ userId, workspace: input.workspace, title: input.title.trim(), startAt: input.startAt, endAt: input.endAt ?? null, allDay: !!input.allDay, location: input.location?.trim() || null, notes: input.notes?.trim() || null, clientId: input.clientId ?? null, projectId: input.projectId ?? null }).returning();
  await logActivity({ userId, workspace: input.workspace, entityType: "event", entityId: e.id, action: "create", summary: `Added ${input.workspace === "business" ? "meeting" : "appointment"} “${e.title}”` });
  return e;
}

export async function updateEvent(userId: string, id: string, patch: Partial<{ title: string; startAt: Date; endAt: Date | null; allDay: boolean; location: string | null; notes: string | null; clientId: string | null; projectId: string | null }>) {
  const db = await getDb();
  await db.update(schema.events).set(patch).where(and(eq(schema.events.id, id), eq(schema.events.userId, userId)));
}

export async function deleteEvent(userId: string, id: string) {
  const db = await getDb();
  await db.delete(schema.events).where(and(eq(schema.events.id, id), eq(schema.events.userId, userId)));
}

export async function getEvent(userId: string, id: string) {
  const db = await getDb();
  return db.query.events.findFirst({ where: and(eq(schema.events.id, id), eq(schema.events.userId, userId)) });
}

export async function eventsBetween(userId: string, workspace: WorkspaceView, from: Date, to: Date) {
  const db = await getDb();
  return db.query.events.findMany({ where: and(eq(schema.events.userId, userId), workspace === "combined" ? undefined : eq(schema.events.workspace, workspace), gte(schema.events.startAt, from), lte(schema.events.startAt, to)), orderBy: [asc(schema.events.startAt)] });
}
