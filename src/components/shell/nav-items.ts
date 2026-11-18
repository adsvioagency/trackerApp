import type React from "react";
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
  Target,
} from "lucide-react";
import type { WorkspaceView } from "@/lib/settings";
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
    { href: "/goals", label: "Goals", icon: Target },
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
        { href: "/money/goals", label: "Savings & debts", icon: PiggyBank },
        { href: "/money/accounts", label: "Accounts", icon: Landmark },
        { href: "/money/reports", label: "Reports", icon: BarChart3 },
      ],
    },
    { title: "Work", items: common },
    { title: "System", items: system },
  ];
}

