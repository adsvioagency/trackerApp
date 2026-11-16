import { describe, it, expect } from "vitest";
import { makeUser } from "./helpers";
import { createTask, getTask } from "@/lib/tasks";
import { createNote } from "@/lib/notes";
import { createClient } from "@/lib/business/clients";
import { createProject, addDependency, updateProject } from "@/lib/business/projects";
import { proposeChange, applyProposedChange, rejectProposedChange } from "@/lib/assistant/changes";
import { ruleBasedAnswer, sendMessage, setAttachedNotes } from "@/lib/assistant";
import { qSearch, qAttachedNotes } from "@/lib/assistant/queries";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";

const ctxFor = (user: Awaited<ReturnType<typeof makeUser>>) => ({ user: user as never, view: "combined" as const, today: "2026-11-16", tz: user.timezone });

describe("assistant", () => {
  it("proposes a change with a preview and only changes the record after explicit approval", async () => {
    const u = await makeUser();
    const t = await createTask(u.id, { workspace: "personal", title: "Pay internet", dueDate: "2026-11-16" });
    const ch = await proposeChange(u.id, null, { action: "task.update", taskId: t.id, dueDate: "2026-11-20" });
    expect(ch.status).toBe("proposed");
    expect(ch.preview).toEqual([{ field: "Due date", from: "2026-11-16", to: "2026-11-20" }]);
    expect((await getTask(u.id, t.id))!.dueDate).toBe("2026-11-16"); // untouched
    await applyProposedChange(u.id, ch.id);
    await applyProposedChange(u.id, ch.id); // second apply is a no-op
    expect((await getTask(u.id, t.id))!.dueDate).toBe("2026-11-20");
    const db = await getDb();
    const log = await db.query.activityLog.findMany({ where: eq(schema.activityLog.userId, u.id) });
    expect(log.filter((l) => l.action === "assistant.apply")).toHaveLength(1);
    expect(log.find((l) => l.action === "assistant.apply")?.source).toBe("assistant");
    // Rejected proposals never apply.
    const ch2 = await proposeChange(u.id, null, { action: "task.create", workspace: "business", title: "Send brief" });
    await rejectProposedChange(u.id, ch2.id);
    const after = await applyProposedChange(u.id, ch2.id);
    expect(after.status).toBe("rejected");
  });

  it("refuses unsupported actions and other owners' records", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const t = await createTask(b.id, { workspace: "personal", title: "Private to B" });
    await expect(proposeChange(a.id, null, { action: "task.update", taskId: t.id, complete: true })).rejects.toThrow(/not found/);
    await expect(proposeChange(a.id, null, { action: "payment.create" })).rejects.toThrow(/not something/);
  });

  it("keeps private notes out unless attached, and answers from records without AI", async () => {
    const u = await makeUser();
    await createNote(u.id, { workspace: "personal", title: "Bank PIN hint", body: "secret stuff", isPrivate: true });
    const pub = await createNote(u.id, { workspace: "personal", title: "Bank visit", body: "bring passport" });
    const ctx = ctxFor(u);
    const s = await qSearch(ctx, { query: "bank" });
    expect(s.notes.map((n) => n.id)).toEqual([pub.id]);
    const client = await createClient(u.id, { company: "Fictional Bakery", status: "active" });
    const p = await createProject(u.id, { clientId: client.id, name: "Bakery site", agreedValueMinor: 0, currency: "USD" });
    await updateProject(u.id, p.id, { waitingOnClient: true, waitingSince: "2026-11-10" });
    await addDependency(u.id, p.id, { title: "Logo files" });
    const r = await ruleBasedAnswer(ctx, "Which projects are blocked?");
    expect(r.text).toContain("Bakery site");
    expect(r.text).toContain("Logo files");
    const sent = await sendMessage(ctx, null, "Who owes me money?");
    expect(sent.message.content).toMatch(/Outstanding/);
    const priv = (await getDb()).query.notes.findFirst({ where: eq(schema.notes.title, "Bank PIN hint") });
    const pn = (await priv)!;
    await setAttachedNotes(u.id, sent.conversationId, [pn.id]);
    expect((await qAttachedNotes(u.id, [pn.id]))[0].private).toBe(true);
  });
});
