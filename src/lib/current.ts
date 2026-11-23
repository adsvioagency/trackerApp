import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { getWorkspaceView } from "@/lib/workspace";
import { todayInTz } from "@/lib/dates";
import type { WorkspaceView } from "@/lib/settings";

export type Ctx = { user: CurrentUser; view: WorkspaceView; today: string; tz: string };

/** Signed-in context for pages. Redirects to sign-in when there is no session. */
export const getCtx = cache(async (): Promise<Ctx> => {
  const [user, view] = await Promise.all([getCurrentUser(), getWorkspaceView()]);
  if (!user) redirect("/sign-in");
  return { user, view, today: todayInTz(user.timezone), tz: user.timezone };
});
