"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/components/forms";
import { bool, errorMessage, isoDate, money, opt, str } from "@/lib/form";
import { addDeliverable, addDependency, addInstallment, attachFileToProject, removeDeliverable, removeDependency, removeInstallment, replacePhases, setDependencyStatus, setProjectPhase, toggleDeliverable, updateInstallment, updateProject, type ProjectStatus } from "@/lib/business/projects";
import { storeUpload } from "@/lib/files";
import { todayInTz } from "@/lib/dates";

export async function updateProjectAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    await updateProject(user.id, str(fd, "id"), {
      name: str(fd, "name"),
      brief: opt(fd, "brief"),
      scope: opt(fd, "scope"),
      status: (str(fd, "status") || "active") as ProjectStatus,
      startDate: isoDate(fd, "startDate"),
      targetDate: isoDate(fd, "targetDate"),
      agreedValueMinor: money(fd, "agreed") ?? 0,
      currency: str(fd, "currency") || "USD",
      nextAction: opt(fd, "nextAction"),
      notes: opt(fd, "notes"),
      followUpDate: isoDate(fd, "followUpDate"),
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Project updated." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function waitingAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const waiting = bool(fd, "waiting");
    await updateProject(user.id, str(fd, "id"), { waitingOnClient: waiting, waitingNote: waiting ? opt(fd, "waitingNote") : null, followUpDate: waiting ? isoDate(fd, "followUpDate") : null, waitingSince: waiting ? todayInTz(user.timezone) : null });
    revalidatePath("/", "layout");
    return { ok: true, message: waiting ? "Flagged as waiting on the client." : "Cleared." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function setPhaseAction(projectId: string, phaseId: string) {
  const user = await requireUser();
  await setProjectPhase(user.id, projectId, phaseId);
  revalidatePath("/", "layout");
}

export async function phasesAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    await replacePhases(user.id, str(fd, "projectId"), str(fd, "phases").split("\n"));
    revalidatePath("/", "layout");
    return { ok: true, message: "Phases updated." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function archiveProjectAction(id: string, archived: boolean) {
  const user = await requireUser();
  await updateProject(user.id, id, { archived });
  revalidatePath("/", "layout");
}

export async function deliverableAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const op = str(fd, "op");
    if (op === "add") await addDeliverable(user.id, str(fd, "projectId"), str(fd, "title"));
    else if (op === "toggle") await toggleDeliverable(user.id, str(fd, "id"), str(fd, "done") === "1");
    else if (op === "remove") await removeDeliverable(user.id, str(fd, "id"));
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function dependencyAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const op = str(fd, "op");
    if (op === "add") await addDependency(user.id, str(fd, "projectId"), { title: str(fd, "title"), dueDate: isoDate(fd, "dueDate"), requestedOn: todayInTz(user.timezone) });
    else if (op === "received") await setDependencyStatus(user.id, str(fd, "id"), true);
    else if (op === "pending") await setDependencyStatus(user.id, str(fd, "id"), false);
    else if (op === "remove") await removeDependency(user.id, str(fd, "id"));
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function installmentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const op = str(fd, "op");
    if (op === "add") {
      const amount = money(fd, "amount");
      if (!amount || amount <= 0) return { error: "Enter an amount greater than zero." };
      await addInstallment(user.id, str(fd, "projectId"), { label: str(fd, "label") || "Installment", amountMinor: amount, dueDate: isoDate(fd, "dueDate") });
    } else if (op === "update") await updateInstallment(user.id, str(fd, "id"), { label: str(fd, "label"), amountMinor: money(fd, "amount") ?? undefined, dueDate: isoDate(fd, "dueDate") });
    else if (op === "remove") await removeInstallment(user.id, str(fd, "id"));
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function uploadProjectFileAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };
    const stored = await storeUpload(user.id, file, "projects");
    await attachFileToProject(user.id, str(fd, "projectId"), stored.id, opt(fd, "label") ?? undefined);
    revalidatePath("/", "layout");
    return { ok: true, message: "File attached." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
