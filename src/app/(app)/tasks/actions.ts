"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/components/forms";
import { errorMessage, isoDate, opt, str } from "@/lib/form";
import { cancelTask, completeTask, deleteTask, reopenTask, toggleChecklistItem, updateTask } from "@/lib/tasks";
import type { Recurrence } from "@/db/schema";

export async function completeTaskAction(id: string) {
  const user = await requireUser();
  await completeTask(user.id, id);
  revalidatePath("/", "layout");
}
export async function reopenTaskAction(id: string) {
  const user = await requireUser();
  await reopenTask(user.id, id);
  revalidatePath("/", "layout");
}
export async function cancelTaskAction(id: string) {
  const user = await requireUser();
  await cancelTask(user.id, id);
  revalidatePath("/", "layout");
}
export async function deleteTaskAction(id: string) {
  const user = await requireUser();
  await deleteTask(user.id, id);
  revalidatePath("/", "layout");
}
export async function toggleChecklistAction(taskId: string, itemId: string, done: boolean) {
  const user = await requireUser();
  await toggleChecklistItem(user.id, taskId, itemId, done);
  revalidatePath("/", "layout");
}

export async function updateTaskAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const freq = str(fd, "recurrence");
    const recurrence: Recurrence = freq && freq !== "none" ? { frequency: freq as "daily", interval: 1 } : null;
    await updateTask(user.id, str(fd, "id"), {
      title: str(fd, "title"),
      notes: opt(fd, "notes"),
      dueDate: isoDate(fd, "dueDate"),
      dueTime: opt(fd, "dueTime"),
      priority: (str(fd, "priority") || "normal") as "normal",
      recurrence,
      checklist: str(fd, "checklist")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((text) => {
          const existing = JSON.parse(str(fd, "checklistState") || "[]") as { text: string; done: boolean; id: string }[];
          const hit = existing.find((e) => e.text === text);
          return hit ? hit : { id: Math.random().toString(36).slice(2, 10), text, done: false };
        }),
      clientId: fd.has("clientId") ? opt(fd, "clientId") : undefined,
      projectId: fd.has("projectId") ? opt(fd, "projectId") : undefined,
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Task updated." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
