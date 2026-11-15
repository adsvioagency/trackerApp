"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sun,
  Wallet,
  CalendarDays,
  MoreHorizontal,
  Users,
  FolderKanban,
  CheckSquare,
  StickyNote,
  FileText,
  Sparkles,
  Settings,
  Activity,
  Search,
  BarChart3,
  Receipt,
  PiggyBank,
  Landmark,
  Bell,
} from "lucide-react";
import type { WorkspaceView } from "@/lib/settings";
import { cx } from "@/components/ui";

export type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean };

export function primaryNav(view: WorkspaceView): NavItem[] {
  if (view === "business") {
    return [
      { href: "/today", label: "Today", icon: Sun },
      { href: "/clients", label: "Clients", icon: Users },
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/more", label: "More", icon: MoreHorizontal },
    ];
  }
  if (view === "combined") {
    return [
      { href: "/today", label: "Today", icon: Sun },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
      { href: "/money", label: "Money", icon: Wallet },
      { href: "/more", label: "More", icon: MoreHorizontal },
    ];
  }
  return [
    { href: "/today", label: "Today", icon: Sun },
    { href: "/money", label: "Money", icon: Wallet },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/more", label: "More", icon: MoreHorizontal },
  ];
}

export function sidebarSections(view: WorkspaceView): { title?: string; items: NavItem[] }[] {
  const common: NavItem[] = [
    { href: "/tasks", label: "Tasks", icon: CheckSquare },
    { href: "/notes", label: "Notes", icon: StickyNote },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/assistant", label: "Assistant", icon: Sparkles },
  ];
  const system: NavItem[] = [
    { href: "/search", label: "Search", icon: Search },
    { href: "/activity", label: "Activity", icon: Activity },
    { href: "/notifications", label: "Reminders", icon: Bell },
    { href: "/settings", label: "Settings", icon: Settings },
  ];
  if (view === "business") {
    return [
      { items: [{ href: "/today", label: "Today", icon: Sun, exact: true }] },
      {
        title: "Adsvio",
        items: [
          { href: "/clients", label: "Clients", icon: Users },
          { href: "/projects", label: "Projects", icon: FolderKanban },
          { href: "/documents", label: "Proposals & Invoices", icon: FileText },
          { href: "/money", label: "Business Money", icon: Wallet },
          { href: "/money/reports", label: "Reports", icon: BarChart3 },
        ],
      },
      { title: "Work", items: common },
      { title: "System", items: system },
    ];
  }
  if (view === "combined") {
    return [
      { items: [{ href: "/today", label: "Today", icon: Sun, exact: true }] },
      { title: "Overview", items: [{ href: "/money", label: "Money", icon: Wallet }, { href: "/money/reports", label: "Reports", icon: BarChart3 }] },
      { title: "Work", items: common },
      { title: "System", items: system },
    ];
  }
  return [
    { items: [{ href: "/today", label: "Today", icon: Sun, exact: true }] },
    {
      title: "Money",
      items: [
        { href: "/money", label: "Overview", icon: Wallet, exact: true },
        { href: "/money/transactions", label: "Transactions", icon: Receipt },
        { href: "/money/budget", label: "Budget", icon: BarChart3 },
        { href: "/money/bills", label: "Bills & paydays", icon: CalendarDays },
        { href: "/money/goals", label: "Goals & debts", icon: PiggyBank },
        { href: "/money/accounts", label: "Accounts", icon: Landmark },
        { href: "/money/reports", label: "Reports", icon: BarChart3 },
      ],
    },
    { title: "Work", items: common },
    { title: "System", items: system },
  ];
}

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
