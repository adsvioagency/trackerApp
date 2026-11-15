"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { completeTask } from "@/lib/tasks";

export async function completeTaskAction(taskId: string) {
  const user = await requireUser();
  await completeTask(user.id, taskId);
  revalidatePath("/", "layout");
}
