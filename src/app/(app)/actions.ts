"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser, signOut } from "@/lib/auth";
import { setWorkspaceCookie } from "@/lib/workspace";
import { setSetting } from "@/lib/settings";
import type { WorkspaceView } from "@/lib/settings";

export async function setWorkspaceAction(view: WorkspaceView) {
  const user = await requireUser();
  const v: WorkspaceView = view === "business" || view === "combined" ? view : "personal";
  await setWorkspaceCookie(v);
  await setSetting(user.id, "lastWorkspace", v);
  revalidatePath("/", "layout");
}

export async function signOutAction() {
  await signOut();
  redirect("/sign-in");
}
