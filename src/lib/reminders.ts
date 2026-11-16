import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env } from "@/lib/env";
import { getReminderSettings, type ReminderSettings } from "@/lib/settings";
import { addDaysISO, fmtDate, hourInTz, relativeDay, todayInTz } from "@/lib/dates";
import { unpaidBillsThrough } from "@/lib/money/bills";
import { listTasks } from "@/lib/tasks";
import { listInvoices } from "@/lib/business/documents";
import { listProjects } from "@/lib/business/projects";
import { listClients } from "@/lib/business/clients";
import { listPaydays } from "@/lib/money/paydays";
import { getEmailTransport, type EmailTransport } from "@/lib/email";
import { digestEmail, type DigestItem } from "@/lib/email/templates";
import { fmtMoney } from "@/lib/money/format";
import type { NotificationItem } from "@/db/schema";

export type DueItem = NotificationItem & { group: string; detail: string };

/**
 * Compute everything that is due and unresolved right now for a user.
 * Status is always re-read from the records, never from a cached list.
 */
export async function collectDueItems(userId: string, tz: string, settings: ReminderSettings, now: Date): Promise<DueItem[]> {
  const today = todayInTz(tz, now);
  const items: DueItem[] = [];
  if (settings.include.bills) {
    const bills = await unpaidBillsThrough(userId, "combined", addDaysISO(today, settings.leadDays.bills));
    for (const o of bills) items.push({ itemType: "bill_occurrence", itemId: o.id, title: `${o.bill.name} · ${fmtMoney(o.amountMinor, o.bill.currency)}`, due: o.dueDate, href: `/money/bills?occ=${o.id}`, group: "Bills", detail: `Due ${fmtDate(o.dueDate)} (${relativeDay(o.dueDate, today)})` });
  }
  if (settings.include.tasks) {
    const tasks = await listTasks(userId, { status: "open", dueTo: addDaysISO(today, settings.leadDays.tasks) });
    for (const t of tasks) if (t.dueDate) items.push({ itemType: "task", itemId: t.id, title: t.title, due: t.dueDate, href: `/tasks?task=${t.id}`, group: "Tasks", detail: `Due ${fmtDate(t.dueDate)} (${relativeDay(t.dueDate, today)})${t.projectName ? ` · ${t.projectName}` : ""}` });
  }
  if (settings.include.invoices) {
    const invoices = await listInvoices(userId, { status: "open", today });
    for (const i of invoices) if (i.balanceMinor > 0 && i.dueDate && i.dueDate <= addDaysISO(today, settings.leadDays.invoices)) items.push({ itemType: "invoice", itemId: i.id, title: `${i.clientName} · ${i.number} · ${fmtMoney(i.balanceMinor, i.currency)}`, due: i.dueDate, href: `/documents/invoices/${i.id}`, group: "Client payments", detail: `${i.overdue ? "Overdue" : "Due"} ${fmtDate(i.dueDate)} (${relativeDay(i.dueDate, today)})` });
  }
  if (settings.include.followUps) {
    const limit = addDaysISO(today, settings.leadDays.followUps);
    for (const p of await listProjects(userId, { status: "open" })) if (p.followUpDate && p.followUpDate <= limit) items.push({ itemType: "project_followup", itemId: p.id, title: `Follow up: ${p.clientName} · ${p.name}`, due: p.followUpDate, href: `/projects/${p.id}`, group: "Follow-ups", detail: `${p.waitingNote ? `Waiting on client: ${p.waitingNote} · ` : ""}${relativeDay(p.followUpDate, today)}` });
    for (const c of await listClients(userId)) if (c.followUpDate && c.followUpDate <= limit) items.push({ itemType: "client_followup", itemId: c.id, title: `Follow up: ${c.company}`, due: c.followUpDate, href: `/clients/${c.id}`, group: "Follow-ups", detail: `${c.status === "prospect" ? `Prospect · ${c.pipelineStage.replace("_", " ")} · ` : ""}${relativeDay(c.followUpDate, today)}` });
  }
  if (settings.include.paydays) {
    const pays = await listPaydays(userId, "combined", today, today);
    for (const p of pays) if (p.status === "expected") items.push({ itemType: "payday", itemId: p.id, title: `${p.schedule.name} · ${fmtMoney(p.amountMinor, p.schedule.currency)}`, due: p.date, href: `/money/bills?payday=${p.id}`, group: "Paydays", detail: "Expected today" });
  }
  return items;
}

export type RunResult = { userId: string; eligible: number; sent: number; skipped: string; notificationId?: string; items: DueItem[] };

export type RunOptions = {
  now?: Date;
  transport?: EmailTransport;
  /** Visibly labeled test: sends regardless of schedule and never touches reminder state. */
  test?: boolean;
  /** Compute only; do not send or record anything. */
  dryRun?: boolean;
  /** Ignore the send-hour gate (used by tests). */
  ignoreHour?: boolean;
  /** Override delivery gate (tests). */
  deliveryOn?: boolean;
};

/**
 * Run reminders for one user. Safe to call repeatedly: one logical delivery per
 * local day per item set is recorded under a unique dedupe key, so a retried run
 * never sends twice. Items repeat about every `repeatHours` while unresolved.
 */
export async function runRemindersForUser(userId: string, opts: RunOptions = {}): Promise<RunResult> {
  const db = await getDb();
  const now = opts.now ?? new Date();
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) return { userId, eligible: 0, sent: 0, skipped: "no user", items: [] };
  const settings = await getReminderSettings(userId);
  const tz = user.timezone;
  const today = todayInTz(tz, now);
  if (!opts.test && !settings.enabled) return { userId, eligible: 0, sent: 0, skipped: "reminders disabled", items: [] };
  if (!opts.test && !opts.ignoreHour && hourInTz(tz, now) < settings.sendHour) return { userId, eligible: 0, sent: 0, skipped: `before send hour (${settings.sendHour}:00 ${tz})`, items: [] };

  const all = await collectDueItems(userId, tz, settings, now);
  // Apply per-item state: mute, snooze and the repeat interval.
  const states = all.length ? await db.query.reminderStates.findMany({ where: and(eq(schema.reminderStates.userId, userId), inArray(schema.reminderStates.itemId, all.map((i) => i.itemId))) }) : [];
  const repeatMs = Math.max(1, settings.repeatHours) * 3_600_000;
  const eligible = all.filter((it) => {
    const st = states.find((s) => s.itemType === it.itemType && s.itemId === it.itemId);
    if (!st) return true;
    if (st.muted) return false;
    if (st.snoozedUntil && st.snoozedUntil.getTime() > now.getTime()) return false;
    if (!opts.test && st.lastSentAt && now.getTime() - st.lastSentAt.getTime() < repeatMs - 60_000) return false;
    return true;
  });
  if (opts.dryRun) return { userId, eligible: eligible.length, sent: 0, skipped: "dry run", items: eligible };
  if (!eligible.length) return { userId, eligible: 0, sent: 0, skipped: "nothing due", items: [] };

  const dedupeKey = opts.test ? `test:${now.toISOString()}` : settings.digest ? `digest:${today}` : `single:${today}:${eligible.map((i) => i.itemId).join(",").slice(0, 200)}`;
  const deliveryOn = opts.deliveryOn ?? env.remindersDelivery;
  const transport = opts.transport ?? getEmailTransport();
  const channel = opts.test || deliveryOn ? "email" : "in_app";
  const tpl = digestEmail({ items: eligible.map<DigestItem>((i) => ({ title: i.title, detail: i.detail, href: i.href, group: i.group })), dateLabel: fmtDate(today, "long"), appUrl: env.appUrl, isTest: !!opts.test });

  // Insert the notification first; a unique dedupe key is the retry guard.
  let notificationId: string;
  try {
    const [n] = await db.insert(schema.notifications).values({ userId, channel, kind: opts.test ? "test" : settings.digest ? "digest" : "single", subject: tpl.subject, body: tpl.text, items: eligible.map(({ itemType, itemId, title, due, href }) => ({ itemType, itemId, title, due, href })), dedupeKey, status: "queued", isTest: !!opts.test }).returning();
    notificationId = n.id;
  } catch {
    return { userId, eligible: eligible.length, sent: 0, skipped: "already delivered for this day (dedupe key exists)", items: eligible };
  }

  let sent = 0;
  if (channel === "email") {
    const res = await transport.send({ to: user.email, subject: tpl.subject, text: tpl.text, html: tpl.html, idempotencyKey: dedupeKey });
    if (res.ok) {
      sent = 1;
      await db.update(schema.notifications).set({ status: "sent", sentAt: now, providerMessageId: `${res.transport}:${res.id}` }).where(eq(schema.notifications.id, notificationId));
    } else {
      await db.update(schema.notifications).set({ status: "failed", error: res.error }).where(eq(schema.notifications.id, notificationId));
      return { userId, eligible: eligible.length, sent: 0, skipped: `send failed: ${res.error}`, notificationId, items: eligible };
    }
  } else {
    // Delivery is off: keep the reminder in the in-app history only.
    sent = 1;
    await db.update(schema.notifications).set({ status: "sent", sentAt: now, providerMessageId: "in_app" }).where(eq(schema.notifications.id, notificationId));
  }

  if (!opts.test) {
    for (const it of eligible) {
      await db
        .insert(schema.reminderStates)
        .values({ userId, itemType: it.itemType, itemId: it.itemId, firstSentAt: now, lastSentAt: now, timesSent: 1 })
        .onConflictDoUpdate({ target: [schema.reminderStates.userId, schema.reminderStates.itemType, schema.reminderStates.itemId], set: { lastSentAt: now, timesSent: (states.find((s) => s.itemId === it.itemId)?.timesSent ?? 0) + 1, resolvedAt: null } });
    }
  }
  return { userId, eligible: eligible.length, sent, skipped: "", notificationId, items: eligible };
}

export async function runRemindersForAllUsers(opts: RunOptions = {}): Promise<RunResult[]> {
  const db = await getDb();
  const users = await db.query.users.findMany();
  const out: RunResult[] = [];
  for (const u of users) out.push(await runRemindersForUser(u.id, opts));
  return out;
}

export async function snoozeItem(userId: string, itemType: string, itemId: string, until: Date | null) {
  const db = await getDb();
  await db
    .insert(schema.reminderStates)
    .values({ userId, itemType, itemId, snoozedUntil: until })
    .onConflictDoUpdate({ target: [schema.reminderStates.userId, schema.reminderStates.itemType, schema.reminderStates.itemId], set: { snoozedUntil: until } });
}

export async function muteItem(userId: string, itemType: string, itemId: string, muted: boolean) {
  const db = await getDb();
  await db
    .insert(schema.reminderStates)
    .values({ userId, itemType, itemId, muted })
    .onConflictDoUpdate({ target: [schema.reminderStates.userId, schema.reminderStates.itemType, schema.reminderStates.itemId], set: { muted } });
}

export async function listNotifications(userId: string, limit = 50) {
  const db = await getDb();
  return db.query.notifications.findMany({ where: eq(schema.notifications.userId, userId), orderBy: (n, { desc }) => [desc(n.createdAt)], limit });
}

export async function listReminderStates(userId: string) {
  const db = await getDb();
  return db.query.reminderStates.findMany({ where: eq(schema.reminderStates.userId, userId) });
}
