"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getCtx } from "@/lib/current";
import type { ActionState } from "@/components/forms";
import { errorMessage, str } from "@/lib/form";
import { deleteConversation, sendMessage, setAttachedNotes, createConversation } from "@/lib/assistant";
import { applyProposedChange, rejectProposedChange } from "@/lib/assistant/changes";
import { createNote } from "@/lib/notes";

export async function askAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await getCtx();
    const r = await sendMessage(ctx, str(fd, "conversationId") || null, str(fd, "question"));
    revalidatePath("/assistant");
    return { ok: true, id: r.conversationId };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function applyChangeAction(id: string): Promise<ActionState> {
  const user = await requireUser();
  try {
    const ch = await applyProposedChange(user.id, id);
    revalidatePath("/", "layout");
    return { ok: true, message: `Applied: ${ch.summary}` };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function rejectChangeAction(id: string) {
  const user = await requireUser();
  await rejectProposedChange(user.id, id);
  revalidatePath("/assistant");
}

/** Save an assistant reply as a note (owner action, not an assistant action). */
export async function saveReplyAsNoteAction(messageId: string, workspace: "personal" | "business"): Promise<ActionState> {
  const user = await requireUser();
  try {
    const db = await getDb();
    const m = await db.query.messages.findFirst({ where: and(eq(schema.messages.id, messageId), eq(schema.messages.userId, user.id)) });
    if (!m) return { error: "Message not found." };
    const conv = await db.query.conversations.findFirst({ where: eq(schema.conversations.id, m.conversationId) });
    const n = await createNote(user.id, { workspace, title: conv?.title ? `Assistant: ${conv.title}` : "Assistant reply", body: m.content, tags: ["assistant"] });
    revalidatePath("/notes");
    return { ok: true, message: "Saved as a note.", id: n.id };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function attachNotesAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    let id = str(fd, "conversationId");
    if (!id) id = (await createConversation(user.id, "New conversation")).id;
    await setAttachedNotes(user.id, id, fd.getAll("noteIds").map(String));
    revalidatePath("/assistant");
    return { ok: true, message: "Attached notes updated.", id };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function deleteConversationAction(id: string) {
  const user = await requireUser();
  await deleteConversation(user.id, id);
  revalidatePath("/assistant");
  redirect("/assistant");
}
