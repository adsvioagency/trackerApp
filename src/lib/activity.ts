import "server-only";
import { getDb, schema } from "@/db";

export type ActivitySource = "user" | "assistant" | "system" | "import";

export async function logActivity(p: {
  userId: string;
  workspace?: "personal" | "business" | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  summary: string;
  details?: unknown;
  source?: ActivitySource;
}) {
  const db = await getDb();
  await db.insert(schema.activityLog).values({
    userId: p.userId,
    workspace: p.workspace ?? null,
    entityType: p.entityType,
    entityId: p.entityId ?? null,
    action: p.action,
    summary: p.summary,
    details: p.details === undefined ? null : (p.details as object),
    source: p.source ?? "user",
  });
}
