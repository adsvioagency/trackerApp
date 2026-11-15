import { getCtx } from "@/lib/current";
import { AppShell } from "@/components/shell/app-shell";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, view } = await getCtx();
  return (
    <AppShell view={view} email={user.email} isDemo={env.isDemo}>
      {children}
    </AppShell>
  );
}
