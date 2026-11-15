"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { setSetting, type ReminderSettings, getReminderSettings } from "@/lib/settings";
import type { ActionState } from "@/components/forms";
import { logActivity } from "@/lib/activity";

export async function saveProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const tz = String(formData.get("timezone") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    return { error: "That timezone name is not valid. Use an IANA name like America/Santo_Domingo." };
  }
  const db = await getDb();
  await db.update(schema.users).set({ timezone: tz, name: name || null }).where(eq(schema.users.id, user.id));
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile saved." };
}

export async function saveRemindersAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const current = await getReminderSettings(user.id);
  const next: ReminderSettings = {
    enabled: formData.get("enabled") === "on",
    sendHour: Math.min(23, Math.max(0, Number(formData.get("sendHour") ?? current.sendHour))),
    digest: formData.get("digest") !== "off",
    repeatHours: Math.max(1, Number(formData.get("repeatHours") ?? 24)),
    leadDays: {
      bills: Math.max(0, Number(formData.get("leadBills") ?? current.leadDays.bills)),
      tasks: Math.max(0, Number(formData.get("leadTasks") ?? current.leadDays.tasks)),
      invoices: Math.max(0, Number(formData.get("leadInvoices") ?? current.leadDays.invoices)),
      followUps: Math.max(0, Number(formData.get("leadFollowUps") ?? current.leadDays.followUps)),
    },
    include: {
      bills: formData.get("incBills") === "on",
      tasks: formData.get("incTasks") === "on",
      invoices: formData.get("incInvoices") === "on",
      followUps: formData.get("incFollowUps") === "on",
      paydays: formData.get("incPaydays") === "on",
    },
  };
  await setSetting(user.id, "reminders", next);
  await logActivity({ userId: user.id, entityType: "settings", action: "reminders", summary: `Reminders ${next.enabled ? "enabled" : "disabled"} · digest at ${String(next.sendHour).padStart(2, "0")}:00` });
  revalidatePath("/settings");
  return { ok: true, message: next.enabled ? "Reminders are on." : "Reminders are off." };
}
