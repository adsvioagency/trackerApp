"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/forms";
import { requireUser } from "@/lib/auth";
import { errorMessage, opt, str, workspaceOf } from "@/lib/form";
import { changeGoalStatus, saveTrackedGoal, writeMilestone } from "@/lib/goal-tracker";

export async function saveGoalAction(_previous: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = opt(fd, "id");
  let savedId: string;
  try {
    savedId = await saveTrackedGoal(user.id, {
      workspace: workspaceOf(fd),
      year: Number(str(fd, "year")),
      area: str(fd, "area"),
      title: str(fd, "title"),
      motivation: opt(fd, "motivation"),
      outcome: opt(fd, "outcome"),
      dueDate: opt(fd, "dueDate"),
    }, id ?? undefined, str(fd, "steps").split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
    revalidatePath("/goals", "layout");
  } catch (error) {
    return { error: errorMessage(error) };
  }
  if (!id) redirect("/goals/" + savedId);
  return { ok: true, message: "Goal saved." };
}

export async function changeGoalStatusAction(id: string, _previous: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const change = str(fd, "change");
  if (change !== "complete" && change !== "reopen" && change !== "archive" && change !== "restore") {
    return { error: "Choose an action for this goal." };
  }
  try {
    await changeGoalStatus(user.id, id, change);
    revalidatePath("/goals", "layout");
    return { ok: true, message: "Goal updated." };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function milestoneAction(goalId: string, _previous: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = opt(fd, "milestoneId");
  const command = str(fd, "command");
  try {
    if (command === "toggle" && id) {
      await writeMilestone(user.id, goalId, { type: "toggle", id, done: str(fd, "done") === "true" });
    } else if (command === "remove" && id) {
      await writeMilestone(user.id, goalId, { type: "remove", id });
    } else if (command === "save") {
      await writeMilestone(user.id, goalId, { type: "save", id: id ?? undefined, data: { title: str(fd, "title"), dueDate: opt(fd, "dueDate") } });
    } else {
      return { error: "Choose an action for this milestone." };
    }
    revalidatePath("/goals", "layout");
    return { ok: true, message: "Milestones updated." };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}
