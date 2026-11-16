"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";
import type { WorkspaceView } from "@/lib/settings";
import { primaryNav, sidebarSections, type NavItem } from "./nav-items";
export { primaryNav, sidebarSections, type NavItem };

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  if (item.href === "/money") return pathname === "/money";
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

export function MobileTabs({ view }: { view: WorkspaceView }) {
  const pathname = usePathname();
  const items = primaryNav(view);
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-surface/95 backdrop-blur md:hidden safe-bottom">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((it) => {
          const active = isActive(pathname, it) || (it.href === "/more" && ["/settings", "/notes", "/tasks", "/assistant", "/documents", "/activity", "/search", "/notifications"].some((p) => pathname.startsWith(p)) && !items.some((o) => o.href !== "/more" && isActive(pathname, o)));
          const Icon = it.icon;
          return (
            <li key={it.href}>
              <Link href={it.href} aria-current={active ? "page" : undefined} className={cx("flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", active ? "text-mango-deep" : "text-ink-soft")}>
                <Icon className="size-[22px]" />
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Sidebar({ view }: { view: WorkspaceView }) {
  const pathname = usePathname();
  const sections = sidebarSections(view);
  return (
    <nav aria-label="Primary" className="space-y-5">
      {sections.map((s, i) => (
        <div key={i}>
          {s.title && <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{s.title}</div>}
          <ul className="space-y-0.5">
            {s.items.map((it) => {
              const active = isActive(pathname, it);
              const Icon = it.icon;
              return (
                <li key={it.href}>
                  <Link href={it.href} aria-current={active ? "page" : undefined} className={cx("flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[14px] font-medium transition-colors", active ? "bg-surface-2 text-ink" : "text-ink-soft hover:bg-surface-2/70 hover:text-ink")}>
                    <Icon className={cx("size-4", active ? "text-mango-deep" : "text-ink-muted")} />
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
