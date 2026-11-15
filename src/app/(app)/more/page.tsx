import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, LogOut } from "lucide-react";
import { getCtx } from "@/lib/current";
import { sidebarSections } from "@/components/shell/nav";
import { PageHeader } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOutAction } from "../actions";

export const metadata: Metadata = { title: "More" };

export default async function MorePage() {
  const { view, user } = await getCtx();
  const sections = sidebarSections(view).slice(1);
  return (
    <div>
      <PageHeader title="More" description={`Signed in as ${user.email}`} />
      <div className="mb-5 flex items-center justify-between">
        <span className="text-[14px] font-semibold">Appearance</span>
        <ThemeToggle />
      </div>
      <div className="space-y-5">
        {sections.map((s) => (
          <section key={s.title} className="card overflow-hidden">
            {s.title && <h2 className="eyebrow px-4 pt-3">{s.title}</h2>}
            <ul>
              {s.items.map((it) => {
                const Icon = it.icon;
                return (
                  <li key={it.href}>
                    <Link href={it.href} className="flex min-h-[52px] items-center gap-3 border-b border-rule px-4 last:border-b-0 hover:bg-surface-2">
                      <Icon className="size-5 text-ink-muted" />
                      <span className="flex-1 font-medium">{it.label}</span>
                      <ChevronRight className="size-4 text-ink-muted" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <form action={signOutAction}>
          <button type="submit" className="btn btn-secondary w-full">
            <LogOut className="size-4" /> Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
