import Link from "next/link";
import { Receipt, HandCoins, CheckSquare, CalendarClock, FileText, Flag, MessageSquare, Banknote } from "lucide-react";
import type { AgendaItem, AgendaKind } from "@/lib/agenda";
import { fmtDate, relativeDay } from "@/lib/dates";
import { Money, WorkspaceBadge, cx, EmptyState } from "@/components/ui";

const ICON: Record<AgendaKind, React.ComponentType<{ className?: string }>> = {
  bill: Receipt,
  payday: Banknote,
  task: CheckSquare,
  event: CalendarClock,
  invoice: HandCoins,
  milestone: Flag,
  followup: MessageSquare,
  installment: FileText,
};

const KIND_LABEL: Record<AgendaKind, string> = {
  bill: "Bill",
  payday: "Payday",
  task: "Task",
  event: "Meeting",
  invoice: "Client payment",
  milestone: "Milestone",
  followup: "Follow-up",
  installment: "To invoice",
};

const KIND_TONE: Record<AgendaKind, string> = {
  bill: "bg-mango-wash text-mango-deep",
  payday: "bg-ok-wash text-ok",
  task: "bg-surface-2 text-ink-soft",
  event: "bg-teal-wash text-teal-deep",
  invoice: "bg-sun-wash text-warn",
  milestone: "bg-teal-wash text-teal-deep",
  followup: "bg-surface-2 text-ink-soft",
  installment: "bg-surface-2 text-ink-soft",
};

export function AgendaList({ items, today, showWorkspace, tz, emptyText = "Nothing scheduled in this range." }: { items: AgendaItem[]; today: string; showWorkspace: boolean; tz: string; emptyText?: string }) {
  void tz;
  if (!items.length) return <div className="p-4"><EmptyState title={emptyText} /></div>;
  const byDate = new Map<string, AgendaItem[]>();
  for (const it of items) byDate.set(it.date, [...(byDate.get(it.date) ?? []), it]);
  return (
    <div>
      {[...byDate.entries()].map(([date, list]) => (
        <section key={date} aria-label={fmtDate(date, "long")}>
          <header className={cx("sticky top-[52px] z-10 flex items-baseline gap-2 border-b border-rule bg-surface px-4 py-1.5 md:top-0", date === today && "text-mango-deep")}>
            <span className="text-[13px] font-bold">{date === today ? "Today" : fmtDate(date, "weekday")}</span>
            <span className="muted text-[12px]">{date === today ? fmtDate(date, "weekday") : relativeDay(date, today)}</span>
          </header>
          <ul>
            {list.map((it) => {
              const Icon = ICON[it.kind];
              return (
                <li key={it.id} className="border-b border-rule last:border-b-0">
                  <Link href={it.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/70">
                    <span className={cx("flex size-8 shrink-0 items-center justify-center rounded-lg", KIND_TONE[it.kind])} title={KIND_LABEL[it.kind]}>
                      <Icon className="size-4" aria-hidden />
                      <span className="sr-only">{KIND_LABEL[it.kind]}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className={cx("truncate font-medium", it.status === "done" && "text-ink-muted line-through")}>{it.title}</span>
                        {showWorkspace && <WorkspaceBadge workspace={it.workspace} />}
                        {it.status === "overdue" && <span className="pill pill-danger">Overdue</span>}
                      </div>
                      <div className="muted truncate text-[12px]">
                        {it.time ? `${it.time} · ` : ""}
                        {it.detail}
                        {it.status !== "done" ? ` · Next: ${it.nextAction}` : ""}
                      </div>
                    </div>
                    {it.amountMinor != null && it.currency && (
                      <Money minor={it.amountMinor} currency={it.currency} className={cx("shrink-0 text-[14px] font-semibold", it.status === "done" && "text-ink-muted")} />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
