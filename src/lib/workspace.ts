import "server-only";
import { cookies } from "next/headers";
import type { Workspace, WorkspaceView } from "@/lib/settings";

export const WS_COOKIE = "pa_ws";

export async function getWorkspaceView(): Promise<WorkspaceView> {
  const v = (await cookies()).get(WS_COOKIE)?.value;
  return v === "business" || v === "combined" ? v : "personal";
}

/** Workspace to write new records into from the current view. Combined asks explicitly. */
export function defaultWriteWorkspace(view: WorkspaceView): Workspace {
  return view === "business" ? "business" : "personal";
}

export async function setWorkspaceCookie(view: WorkspaceView) {
  (await cookies()).set(WS_COOKIE, view, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
}

export const WORKSPACE_LABEL: Record<WorkspaceView, string> = {
  personal: "Personal",
  business: "Business",
  combined: "Combined",
};
