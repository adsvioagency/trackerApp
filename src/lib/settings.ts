import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type ReminderSettings = {
  enabled: boolean;
  /** Local hour (0-23) when the daily digest is sent. */
  sendHour: number;
  digest: boolean;
  repeatHours: number;
  leadDays: { bills: number; tasks: number; invoices: number; followUps: number };
  include: { bills: boolean; tasks: boolean; invoices: boolean; followUps: boolean; paydays: boolean };
};

export const DEFAULT_REMINDERS: ReminderSettings = {
  enabled: false,
  sendHour: 8,
  digest: true,
  repeatHours: 24,
  leadDays: { bills: 3, tasks: 0, invoices: 0, followUps: 0 },
  include: { bills: true, tasks: true, invoices: true, followUps: true, paydays: false },
};

export type Workspace = "personal" | "business";
export type WorkspaceView = Workspace | "combined";

export async function getSetting<T>(userId: string, key: string, fallback: T): Promise<T> {
  const db = await getDb();
  const row = await db.query.userSettings.findFirst({
    where: and(eq(schema.userSettings.userId, userId), eq(schema.userSettings.key, key)),
  });
  if (!row) return fallback;
  if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) {
    return { ...(fallback as object), ...(row.value as object) } as T;
  }
  return row.value as T;
}

export async function setSetting(userId: string, key: string, value: unknown) {
  const db = await getDb();
  await db
    .insert(schema.userSettings)
    .values({ userId, key, value: value as object })
    .onConflictDoUpdate({
      target: [schema.userSettings.userId, schema.userSettings.key],
      set: { value: value as object, updatedAt: new Date() },
    });
}

export async function getReminderSettings(userId: string) {
  return getSetting<ReminderSettings>(userId, "reminders", DEFAULT_REMINDERS);
}
