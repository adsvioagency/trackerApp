"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/components/forms";
import { bool, errorMessage, isoDate, opt, str } from "@/lib/form";
import { deleteNote, getNote, updateNote } from "@/lib/notes";
import { createTask } from "@/lib/tasks";

export async function updateNoteAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    await updateNote(user.id, str(fd, "id"), { title: opt(fd, "title"), body: str(fd, "body"), tags: str(fd, "tags").split(/[,\s]+/).filter(Boolean), pinned: bool(fd, "pinned"), isPrivate: bool(fd, "isPrivate"), clientId: fd.has("clientId") ? opt(fd, "clientId") : undefined, projectId: fd.has("projectId") ? opt(fd, "projectId") : undefined, archived: bool(fd, "archived") });
    revalidatePath("/", "layout");
    return { ok: true, message: "Note saved." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function togglePinAction(id: string, pinned: boolean) {
  const user = await requireUser();
  await updateNote(user.id, id, { pinned });
  revalidatePath("/", "layout");
}

export async function deleteNoteAction(id: string) {
  const user = await requireUser();
  await deleteNote(user.id, id);
  revalidatePath("/", "layout");
  redirect("/notes");
}

/** Turn a note into a task; the task keeps a link back to the note. */
export async function noteToTaskAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const note = await getNote(user.id, str(fd, "id"));
    if (!note) return { error: "Note not found." };
    const t = await createTask(user.id, { workspace: note.workspace, title: str(fd, "title") || note.title || note.body.slice(0, 80), notes: note.body, dueDate: isoDate(fd, "dueDate"), noteId: note.id, clientId: note.clientId, projectId: note.projectId });
    revalidatePath("/", "layout");
    return { ok: true, message: "Task created from this note.", id: t.id };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
