"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/components/forms";
import { bool, errorMessage, isoDate, opt, str } from "@/lib/form";
import { deleteEvent, updateEvent } from "@/lib/events";
import { zonedDateTimeToUtc } from "@/lib/dates";

export async function updateEventAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const date = isoDate(fd, "date");
    if (!date) return { error: "Pick a date." };
    const allDay = bool(fd, "allDay");
    const startAt = zonedDateTimeToUtc(date, allDay ? "00:00" : str(fd, "startTime") || "09:00", user.timezone);
    const endAt = allDay || !str(fd, "endTime") ? null : zonedDateTimeToUtc(date, str(fd, "endTime"), user.timezone);
    await updateEvent(user.id, str(fd, "id"), { title: str(fd, "title"), startAt, endAt, allDay, location: opt(fd, "location"), notes: opt(fd, "notes"), clientId: fd.has("clientId") ? opt(fd, "clientId") : undefined, projectId: fd.has("projectId") ? opt(fd, "projectId") : undefined });
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function deleteEventAction(id: string) {
  const user = await requireUser();
  await deleteEvent(user.id, id);
  revalidatePath("/", "layout");
}
