import Link from "next/link";
import { LogOut } from "lucide-react";
import { WordmarkText } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import type { WorkspaceView } from "@/lib/settings";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { MobileTabs, Sidebar } from "./nav";
import { AddMenu } from "./add-menu";
import { signOutAction } from "@/app/(app)/actions";
import { Hotkeys } from "./hotkeys";

export function AppShell({ view, email, isDemo, children }: { view: WorkspaceView; email: string; isDemo: boolean; children: React.ReactNode }) {
  return (
    <div className="app-shell flex min-h-dvh">
      <Hotkeys />
      {/* Desktop sidebar */}
      <aside className="app-chrome sticky top-0 hidden h-dvh w-[240px] shrink-0 flex-col border-r border-rule bg-paper-deep/60 px-3 py-4 md:flex">
        <div className="mb-4 flex items-center justify-between px-2">
          <Link href="/today" className="text-[20px]">
            <WordmarkText />
          </Link>
        </div>
        <div className="mb-4 px-1">
          <WorkspaceSwitcher view={view} full />
        </div>
        <div className="mb-4 px-1">
          <AddMenu view={view} variant="sidebar" />
        </div>
        <div className="flex-1 overflow-y-auto px-1">
          <Sidebar view={view} />
        </div>
        <div className="mt-3 space-y-2 border-t border-rule px-1 pt-3">
          <ThemeToggle compact />
          <div className="flex items-center justify-between gap-2">
            <span className="muted truncate text-[12px]" title={email}>
              {email}
            </span>
            <form action={signOutAction}>
              <button type="submit" className="btn btn-ghost btn-sm" title="Sign out">
                <LogOut className="size-4" /> <span className="sr-only md:not-sr-only">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="app-chrome sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-rule bg-paper/95 px-4 py-2.5 backdrop-blur md:hidden">
          <Link href="/today" className="text-[18px]">
            <WordmarkText />
          </Link>
          <WorkspaceSwitcher view={view} />
        </header>
        {isDemo && (
          <div className="bg-sun-wash px-4 py-1.5 text-center text-[12px] font-semibold text-warn">Demo environment · fictional data · no outbound email</div>
        )}
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-4 md:px-8 md:pb-12 md:pt-7">{children}</main>
        <div className="app-chrome contents">
          <MobileTabs view={view} />
          <AddMenu view={view} variant="fab" />
        </div>
      </div>
    </div>
  );
}
