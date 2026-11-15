"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Receipt, TrendingUp, CheckSquare, StickyNote, ArrowLeftRight, HandCoins, Users, FolderKanban, CalendarPlus, FileText } from "lucide-react";
import type { WorkspaceView } from "@/lib/settings";
import { Sheet } from "@/components/forms";

type Action = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; hint?: string };

const PERSONAL: Action[] = [
  { href: "/add/expense?ws=personal", label: "Add expense", icon: Receipt },
  { href: "/add/income?ws=personal", label: "Add income", icon: TrendingUp },
  { href: "/add/task?ws=personal", label: "Add task", icon: CheckSquare },
  { href: "/add/note?ws=personal", label: "Quick note", icon: StickyNote },
];
const PERSONAL_MORE: Action[] = [
  { href: "/add/transfer?ws=personal", label: "Transfer or card payment", icon: ArrowLeftRight },
  { href: "/add/event?ws=personal", label: "Appointment", icon: CalendarPlus },
];
const BUSINESS: Action[] = [
  { href: "/add/payment", label: "Record client payment", icon: HandCoins },
  { href: "/add/expense?ws=business", label: "Add expense", icon: Receipt },
  { href: "/add/task?ws=business", label: "Add task", icon: CheckSquare },
  { href: "/add/client", label: "Add client or project", icon: Users },
];
const BUSINESS_MORE: Action[] = [
  { href: "/add/project", label: "New project", icon: FolderKanban },
  { href: "/documents/new", label: "New proposal or invoice", icon: FileText },
  { href: "/add/note?ws=business", label: "Quick note", icon: StickyNote },
  { href: "/add/transfer?ws=business", label: "Transfer or owner movement", icon: ArrowLeftRight },
  { href: "/add/event?ws=business", label: "Meeting", icon: CalendarPlus },
];

function Group({ title, actions, onPick, primary }: { title?: string; actions: Action[]; onPick: () => void; primary?: boolean }) {
  return (
    <div>
      {title && <div className="eyebrow mb-2">{title}</div>}
      <ul className={primary ? "grid grid-cols-2 gap-2" : "space-y-1"}>
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <li key={a.href}>
              <Link
                href={a.href}
                onClick={onPick}
                className={
                  primary
                    ? "flex min-h-[76px] flex-col justify-between rounded-xl border border-rule bg-surface-2/60 p-3 text-[14px] font-semibold hover:bg-surface-2"
                    : "flex items-center gap-3 rounded-lg px-2 py-2 text-[14px] font-medium hover:bg-surface-2"
                }
              >
                <Icon className={primary ? "size-5 text-mango-deep" : "size-4 text-ink-muted"} />
                <span>{a.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AddMenu({ view, variant }: { view: WorkspaceView; variant: "fab" | "sidebar" }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      {variant === "fab" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Add"
          className="fixed bottom-[calc(64px+env(safe-area-inset-bottom))] right-4 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-fg shadow-card md:hidden"
        >
          <Plus className="size-7" />
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="btn btn-primary w-full">
          <Plus className="size-4" /> Add
        </button>
      )}
      <Sheet open={open} onClose={close} title="Add">
        <div className="space-y-5">
          {view === "personal" && (
            <>
              <Group actions={PERSONAL} onPick={close} primary />
              <Group title="Also" actions={PERSONAL_MORE} onPick={close} />
            </>
          )}
          {view === "business" && (
            <>
              <Group actions={BUSINESS} onPick={close} primary />
              <Group title="Also" actions={BUSINESS_MORE} onPick={close} />
            </>
          )}
          {view === "combined" && (
            <>
              <p className="muted -mt-1 text-[13px]">You are in Combined. Each item below says where it will be saved.</p>
              <Group title="Save to Personal" actions={PERSONAL} onPick={close} primary />
              <Group title="Save to Business" actions={BUSINESS} onPick={close} primary />
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
