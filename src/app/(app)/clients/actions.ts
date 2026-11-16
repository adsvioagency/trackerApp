"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/components/forms";
import { errorMessage, isoDate, money, opt, str } from "@/lib/form";
import { addClientActivity, addClientContact, removeClientContact, updateClient, type PipelineStage } from "@/lib/business/clients";

export async function updateClientAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    await updateClient(user.id, str(fd, "id"), {
      company: str(fd, "company"),
      contactName: opt(fd, "contactName"),
      email: opt(fd, "email"),
      phone: opt(fd, "phone"),
      website: opt(fd, "website"),
      billingAddress: opt(fd, "billingAddress"),
      preferredContact: opt(fd, "preferredContact"),
      notes: opt(fd, "notes"),
      status: (str(fd, "status") || "prospect") as "prospect",
      pipelineStage: (str(fd, "pipelineStage") || "inquiry") as PipelineStage,
      estimateMinor: money(fd, "estimate"),
      estimateCurrency: str(fd, "estimateCurrency") || "USD",
      followUpDate: isoDate(fd, "followUpDate"),
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Client updated." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function setPipelineStageAction(id: string, stage: PipelineStage) {
  const user = await requireUser();
  await updateClient(user.id, id, { pipelineStage: stage });
  revalidatePath("/", "layout");
}

export async function archiveClientAction(id: string, archived: boolean) {
  const user = await requireUser();
  await updateClient(user.id, id, { archived });
  revalidatePath("/", "layout");
}

export async function setFollowUpAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  await updateClient(user.id, str(fd, "id"), { followUpDate: isoDate(fd, "followUpDate") });
  revalidatePath("/", "layout");
  return { ok: true, message: "Follow-up updated." };
}

export async function addActivityAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const body = str(fd, "body");
    if (!body) return { error: "Write what happened." };
    await addClientActivity(user.id, str(fd, "clientId"), str(fd, "kind") || "note", body);
    revalidatePath("/", "layout");
    return { ok: true, message: "Logged." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function addContactAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    if (!str(fd, "name")) return { error: "Enter a name." };
    await addClientContact(user.id, str(fd, "clientId"), { name: str(fd, "name"), role: opt(fd, "role"), email: opt(fd, "email"), phone: opt(fd, "phone") });
    revalidatePath("/", "layout");
    return { ok: true, message: "Contact added." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function removeContactAction(id: string) {
  const user = await requireUser();
  await removeClientContact(user.id, id);
  revalidatePath("/", "layout");
}
