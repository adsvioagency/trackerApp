import "server-only";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { logActivity } from "@/lib/activity";

export type Client = typeof schema.clients.$inferSelect;
export type ClientStatus = Client["status"];
export type PipelineStage = Client["pipelineStage"];

export const PIPELINE_STAGES: { value: PipelineStage; label: string }[] = [
  { value: "inquiry", label: "Inquiry" },
  { value: "discussion", label: "Discussion" },
  { value: "proposal_sent", label: "Proposal sent" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = { prospect: "Prospect", active: "Active", inactive: "Inactive", archived: "Archived" };

export async function listClients(userId: string, opts: { search?: string; status?: ClientStatus | "all"; includeArchived?: boolean } = {}) {
  const db = await getDb();
  const conds = [eq(schema.clients.userId, userId)];
  if (!opts.includeArchived && opts.status !== "archived") conds.push(isNull(schema.clients.archivedAt));
  if (opts.status && opts.status !== "all") conds.push(eq(schema.clients.status, opts.status));
  if (opts.search) {
    const q = `%${opts.search.trim()}%`;
    conds.push(or(ilike(schema.clients.company, q), ilike(schema.clients.contactName, q), ilike(schema.clients.email, q), ilike(schema.clients.phone, q))!);
  }
  const rows = await db
    .select({ client: schema.clients, projectCount: sql<number>`(select count(*) from ${schema.projects} p where p.client_id = ${schema.clients.id} and p.archived_at is null)` })
    .from(schema.clients)
    .where(and(...conds))
    .orderBy(asc(schema.clients.company));
  return rows.map((r) => ({ ...r.client, projectCount: Number(r.projectCount) }));
}

export async function getClient(userId: string, id: string) {
  const db = await getDb();
  const client = await db.query.clients.findFirst({ where: and(eq(schema.clients.id, id), eq(schema.clients.userId, userId)) });
  if (!client) return null;
  const contacts = await db.query.clientContacts.findMany({ where: eq(schema.clientContacts.clientId, id), orderBy: [asc(schema.clientContacts.name)] });
  const activities = await db.query.clientActivities.findMany({ where: eq(schema.clientActivities.clientId, id), orderBy: [desc(schema.clientActivities.occurredAt)], limit: 100 });
  return { ...client, contacts, activities };
}

export type ClientInput = {
  company: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  billingAddress?: string | null;
  preferredContact?: string | null;
  notes?: string | null;
  status?: ClientStatus;
  pipelineStage?: PipelineStage;
  estimateMinor?: number | null;
  estimateCurrency?: string | null;
  followUpDate?: string | null;
};

export async function createClient(userId: string, input: ClientInput, source: "user" | "assistant" | "system" = "user") {
  const db = await getDb();
  const [c] = await db
    .insert(schema.clients)
    .values({
      userId,
      company: input.company.trim(),
      contactName: input.contactName?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      phone: input.phone?.trim() || null,
      website: input.website?.trim() || null,
      billingAddress: input.billingAddress?.trim() || null,
      preferredContact: input.preferredContact || null,
      notes: input.notes?.trim() || null,
      status: input.status ?? "prospect",
      pipelineStage: input.pipelineStage ?? "inquiry",
      estimateMinor: input.estimateMinor ?? null,
      estimateCurrency: input.estimateCurrency ?? "USD",
      followUpDate: input.followUpDate ?? null,
    })
    .returning();
  await db.insert(schema.clientActivities).values({ userId, clientId: c.id, kind: "system", body: `Added as ${c.status === "active" ? "a client" : "a prospect"}.` });
  await logActivity({ userId, workspace: "business", entityType: "client", entityId: c.id, action: "create", summary: `Added ${c.status === "active" ? "client" : "prospect"} ${c.company}`, source });
  return c;
}

export async function updateClient(userId: string, id: string, patch: Partial<ClientInput> & { archived?: boolean }, source: "user" | "assistant" | "system" = "user") {
  const db = await getDb();
  const before = await db.query.clients.findFirst({ where: and(eq(schema.clients.id, id), eq(schema.clients.userId, userId)) });
  if (!before) throw new Error("Client not found.");
  const { archived, ...rest } = patch;
  const set: Partial<typeof schema.clients.$inferInsert> = { ...rest, updatedAt: new Date() };
  if (rest.company !== undefined) set.company = rest.company.trim();
  if (rest.email !== undefined) set.email = rest.email?.trim().toLowerCase() || null;
  if (archived !== undefined) {
    set.archivedAt = archived ? new Date() : null;
    if (archived) set.status = "archived";
    else if (before.status === "archived") set.status = "inactive";
  }
  await db.update(schema.clients).set(set).where(eq(schema.clients.id, id));
  if (rest.pipelineStage && rest.pipelineStage !== before.pipelineStage) {
    await db.insert(schema.clientActivities).values({ userId, clientId: id, kind: "stage", body: `Pipeline moved from ${before.pipelineStage.replace("_", " ")} to ${rest.pipelineStage.replace("_", " ")}.` });
    if (rest.pipelineStage === "won" && before.status === "prospect") await db.update(schema.clients).set({ status: "active" }).where(eq(schema.clients.id, id));
  }
  if (rest.status && rest.status !== before.status) {
    await db.insert(schema.clientActivities).values({ userId, clientId: id, kind: "system", body: `Status changed to ${CLIENT_STATUS_LABEL[rest.status].toLowerCase()}.` });
  }
  await logActivity({ userId, workspace: "business", entityType: "client", entityId: id, action: archived ? "archive" : "update", summary: `${archived ? "Archived" : archived === false ? "Restored" : "Edited"} client ${before.company}`, details: patch, source });
}

export async function addClientActivity(userId: string, clientId: string, kind: string, body: string) {
  const db = await getDb();
  const client = await db.query.clients.findFirst({ where: and(eq(schema.clients.id, clientId), eq(schema.clients.userId, userId)) });
  if (!client) throw new Error("Client not found.");
  const [a] = await db.insert(schema.clientActivities).values({ userId, clientId, kind, body: body.trim() }).returning();
  return a;
}

export async function addClientContact(userId: string, clientId: string, input: { name: string; role?: string | null; email?: string | null; phone?: string | null }) {
  const db = await getDb();
  const client = await db.query.clients.findFirst({ where: and(eq(schema.clients.id, clientId), eq(schema.clients.userId, userId)) });
  if (!client) throw new Error("Client not found.");
  const [c] = await db.insert(schema.clientContacts).values({ clientId, name: input.name.trim(), role: input.role?.trim() || null, email: input.email?.trim() || null, phone: input.phone?.trim() || null }).returning();
  return c;
}

export async function removeClientContact(userId: string, contactId: string) {
  const db = await getDb();
  const row = await db
    .select({ id: schema.clientContacts.id })
    .from(schema.clientContacts)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.clientContacts.clientId))
    .where(and(eq(schema.clientContacts.id, contactId), eq(schema.clients.userId, userId)));
  if (row[0]) await db.delete(schema.clientContacts).where(eq(schema.clientContacts.id, contactId));
}
