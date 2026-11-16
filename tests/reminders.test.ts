import { describe, it, expect } from "vitest";
import { makeUser, account, cat } from "./helpers";
import { createTask, completeTask, updateTask } from "@/lib/tasks";
import { runRemindersForUser } from "@/lib/reminders";
import { setSetting, DEFAULT_REMINDERS } from "@/lib/settings";
import { MemoryTransport } from "@/lib/email";
import { createBill, listBillOccurrences, rescheduleOccurrence } from "@/lib/money/bills";
import { buildAgenda } from "@/lib/agenda";

const at = (iso: string) => new Date(iso);

describe("reminders with a controlled clock and a test transport", () => {
  it("sends once, repeats after 24h, never duplicates on retry, and stops after completion", async () => {
    const u = await makeUser();
    await setSetting(u.id, "reminders", { ...DEFAULT_REMINDERS, enabled: true, sendHour: 8, include: { ...DEFAULT_REMINDERS.include, paydays: false } });
    const task = await createTask(u.id, { workspace: "personal", title: "Renew passport", dueDate: "2026-11-16" });
    const mail = new MemoryTransport();
    const opts = { transport: mail, deliveryOn: true };

    // 07:00 local (11:00Z) is before the send hour → nothing.
    const early = await runRemindersForUser(u.id, { ...opts, now: at("2026-11-16T11:00:00Z") });
    expect(early.sent).toBe(0);
    expect(mail.sent).toHaveLength(0);

    // 08:30 local → one digest with the task.
    const first = await runRemindersForUser(u.id, { ...opts, now: at("2026-11-16T12:30:00Z") });
    expect(first.sent).toBe(1);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].text).toContain("Renew passport");

    // Retry of the same scheduled run (same day) → no duplicate.
    const retry = await runRemindersForUser(u.id, { ...opts, now: at("2026-11-16T12:31:00Z") });
    expect(retry.sent).toBe(0);
    expect(mail.sent).toHaveLength(1);
    // Later the same day → still nothing (24h repeat).
    const later = await runRemindersForUser(u.id, { ...opts, now: at("2026-11-16T20:00:00Z") });
    expect(later.sent).toBe(0);

    // Next day, still unresolved → repeat.
    const next = await runRemindersForUser(u.id, { ...opts, now: at("2026-11-17T12:30:00Z") });
    expect(next.sent).toBe(1);
    expect(mail.sent).toHaveLength(2);
    const nextRetry = await runRemindersForUser(u.id, { ...opts, now: at("2026-11-17T12:40:00Z") });
    expect(nextRetry.sent).toBe(0);
    expect(mail.sent).toHaveLength(2);

    // Complete the task → no further reminders.
    await completeTask(u.id, task.id);
    const after = await runRemindersForUser(u.id, { ...opts, now: at("2026-11-18T12:30:00Z") });
    expect(after.sent).toBe(0);
    expect(after.eligible).toBe(0);
    expect(mail.sent).toHaveLength(2);
  });

  it("a recurring task stops the current occurrence and keeps the next one scheduled", async () => {
    const u = await makeUser();
    const t = await createTask(u.id, { workspace: "personal", title: "Water plants", dueDate: "2026-11-16", recurrence: { frequency: "weekly", interval: 1 } });
    await completeTask(u.id, t.id);
    const agenda = await buildAgenda({ user: u, view: "personal", today: "2026-11-16", tz: u.timezone }, "2026-11-16", "2026-11-30");
    const open = agenda.filter((a) => a.kind === "task" && a.status !== "done");
    expect(open).toHaveLength(1);
    expect(open[0].date).toBe("2026-11-23");
  });

  it("a labeled test send does not change reminder state, and delivery-off runs are recorded in-app only", async () => {
    const u = await makeUser();
    await setSetting(u.id, "reminders", { ...DEFAULT_REMINDERS, enabled: true });
    await createTask(u.id, { workspace: "business", title: "Call client", dueDate: "2026-11-16" });
    const mail = new MemoryTransport();
    const test = await runRemindersForUser(u.id, { transport: mail, test: true, now: at("2026-11-16T12:30:00Z") });
    expect(test.sent).toBe(1);
    expect(mail.sent[0].subject).toMatch(/^\[Test\]/);
    // Real run afterwards still sends (test did not mark anything as sent).
    const real = await runRemindersForUser(u.id, { transport: mail, deliveryOn: false, now: at("2026-11-16T12:30:00Z") });
    expect(real.sent).toBe(1);
    expect(mail.sent).toHaveLength(1); // delivery off → in-app record only, no email
  });

  it("editing a due date at the source moves the agenda entry", async () => {
    const u = await makeUser();
    const checking = await account(u.id, { name: "Checking", opening: 1_000_00 });
    const t = await createTask(u.id, { workspace: "personal", title: "Dentist", dueDate: "2026-11-20" });
    await updateTask(u.id, t.id, { dueDate: "2026-11-25" });
    const bill = await createBill(u.id, { workspace: "personal", name: "Internet", amountMinor: 2_000_00, currency: "DOP", categoryId: await cat(u.id, "personal", "Internet"), accountId: checking.id, frequency: "monthly", anchorDate: "2026-11-21" });
    void bill;
    const occ = (await listBillOccurrences(u.id, "personal", "2026-11-01", "2026-11-30"))[0];
    await rescheduleOccurrence(u.id, occ.id, "2026-11-27");
    const agenda = await buildAgenda({ user: u, view: "personal", today: "2026-11-16", tz: u.timezone }, "2026-11-16", "2026-11-30");
    expect(agenda.find((a) => a.kind === "task")?.date).toBe("2026-11-25");
    expect(agenda.filter((a) => a.kind === "task")).toHaveLength(1);
    expect(agenda.find((a) => a.kind === "bill")?.date).toBe("2026-11-27");
    expect(agenda.filter((a) => a.kind === "bill")).toHaveLength(1);
  });
});
