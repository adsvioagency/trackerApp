"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/components/forms";
import { muteItem, runRemindersForUser, snoozeItem } from "@/lib/reminders";
import { errorMessage } from "@/lib/form";

export async function sendTestReminderAction(): Promise<ActionState> {
  const user = await requireUser();
  try {
    const r = await runRemindersForUser(user.id, { test: true });
    revalidatePath("/notifications");
    if (r.eligible === 0) return { ok: true, message: "Nothing is due right now, so no test email was sent." };
    return r.sent ? { ok: true, message: `Test reminder with ${r.eligible} item(s) sent through the ${process.env.EMAIL_TRANSPORT === "resend" ? "email" : "console"} transport. Reminder state was not changed.` } : { error: r.skipped };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function previewRemindersAction(): Promise<{ items: { title: string; detail: string; group: string; href: string }[]; skipped: string }> {
  const user = await requireUser();
  const r = await runRemindersForUser(user.id, { dryRun: true, ignoreHour: true });
  return { items: r.items.map((i) => ({ title: i.title, detail: i.detail, group: i.group, href: i.href })), skipped: r.skipped };
}

export async function runNowAction(): Promise<ActionState> {
  const user = await requireUser();
  try {
    const r = await runRemindersForUser(user.id, { ignoreHour: true });
    revalidatePath("/notifications");
    return { ok: true, message: r.sent ? `Delivered ${r.eligible} item(s).` : r.skipped || "Nothing to send." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function snoozeAction(itemType: string, itemId: string, days: number) {
  const user = await requireUser();
  await snoozeItem(user.id, itemType, itemId, days > 0 ? new Date(Date.now() + days * 86_400_000) : null);
  revalidatePath("/notifications");
}

export async function muteAction(itemType: string, itemId: string, muted: boolean) {
  const user = await requireUser();
  await muteItem(user.id, itemType, itemId, muted);
  revalidatePath("/notifications");
}
