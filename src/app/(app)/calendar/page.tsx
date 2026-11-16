import type { Metadata } from "next";
import Link from "next/link";
import { getCtx } from "@/lib/current";
import { PageHeader, Card, Segmented, WorkspaceBadge, cx } from "@/components/ui";
import { buildAgenda, type AgendaItem } from "@/lib/agenda";
import { AgendaList } from "@/components/agenda";
import { addDaysISO, fmtDate, fmtMonth, monthEnd, monthKey, monthStart, addMonthsKey, toDate, fromDate } from "@/lib/dates";
import { getEvent } from "@/lib/events";
import { EventSheet, CalendarNav } from "./calendar-client";
import { listClients } from "@/lib/business/clients";
import { listProjects } from "@/lib/business/projects";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Calendar" };

type View = "today" | "week" | "month" | "agenda";

function weekStart(d: string) {
  const dt = toDate(d);
  const dow = dt.getDay(); // 0 Sunday
  return fromDate(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - ((dow + 6) % 7))); // Monday
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; event?: string }> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const { user, view: ws, today, tz } = ctx;
  const view: View = (["today", "week", "month", "agenda"] as View[]).includes(sp.view as View) ? (sp.view as View) : "agenda";
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;
  let from = anchor;
  let to = anchor;
  if (view === "week") {
    from = weekStart(anchor);
    to = addDaysISO(from, 6);
  } else if (view === "month") {
    from = monthStart(monthKey(anchor));
    to = monthEnd(monthKey(anchor));
  } else if (view === "agenda") {
    from = anchor;
    to = addDaysISO(anchor, 30);
  }
  const items = await buildAgenda(ctx, view === "agenda" ? addDaysISO(from, -60) : from, to);
  const visible = view === "agenda" ? items.filter((i) => i.date >= from || i.status === "overdue") : items;
  const focusEvent = sp.event ? await getEvent(user.id, sp.event) : null;
  const [clients, projects] = focusEvent ? await Promise.all([listClients(user.id), listProjects(user.id, { status: "open" })]) : [[], []];
  const prev = view === "month" ? monthStart(addMonthsKey(monthKey(anchor), -1)) : view === "week" ? addDaysISO(from, -7) : addDaysISO(anchor, view === "agenda" ? -30 : -1);
  const next = view === "month" ? monthStart(addMonthsKey(monthKey(anchor), 1)) : view === "week" ? addDaysISO(from, 7) : addDaysISO(anchor, view === "agenda" ? 30 : 1);
  const label = view === "month" ? fmtMonth(monthKey(anchor)) : view === "week" ? `${fmtDate(from, "short")} – ${fmtDate(to)}` : view === "today" ? fmtDate(anchor, "long") : `From ${fmtDate(anchor)}`;

  return (
    <div>
      <PageHeader title="Calendar" description="Bills, paydays, invoice due dates, milestones, tasks, follow-ups and appointments from their own records. Edit dates at the source." actions={<Link href={`/add/event?ws=${ws === "business" ? "business" : "personal"}&date=${anchor}&back=/calendar?view=${view}%26date=${anchor}`} className="btn btn-primary">Add {ws === "business" ? "meeting" : "appointment"}</Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={view} options={[{ value: "today", label: "Today" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }, { value: "agenda", label: "Agenda" }]} hrefFor={(v) => `/calendar?view=${v}&date=${anchor}`} ariaLabel="Calendar view" />
        <Suspense><CalendarNav label={label} prevHref={`/calendar?view=${view}&date=${prev}`} nextHref={`/calendar?view=${view}&date=${next}`} todayHref={`/calendar?view=${view}&date=${today}`} /></Suspense>
        <span className="muted text-[12px]">Timezone {tz}</span>
      </div>

      {view === "month" ? (
        <MonthGrid month={monthKey(anchor)} items={visible} today={today} showWs={ws === "combined"} view={view} />
      ) : view === "week" ? (
        <div className="grid gap-3 md:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => addDaysISO(from, i)).map((d) => {
            const dayItems = visible.filter((it) => it.date === d);
            return (
              <section key={d} className={cx("card min-h-[120px] p-2", d === today && "border-mango")} aria-label={fmtDate(d, "long")}>
                <Link href={`/calendar?view=today&date=${d}`} className={cx("mb-1 block text-[12px] font-bold uppercase tracking-wide", d === today ? "text-mango-deep" : "text-ink-soft")}>{fmtDate(d, "weekday")}</Link>
                <ul className="space-y-1">
                  {dayItems.map((it) => (
                    <li key={it.id}><Link href={it.href} className={cx("block rounded-md px-1.5 py-1 text-[12px] leading-tight hover:bg-surface-2", it.status === "overdue" ? "bg-danger-wash text-danger" : it.kind === "payday" ? "bg-ok-wash" : it.kind === "bill" || it.kind === "invoice" ? "bg-mango-wash" : it.kind === "event" ? "bg-teal-wash" : "bg-surface-2")}>{it.time ? `${it.time} ` : ""}{it.title}{ws === "combined" ? ` · ${it.workspace === "business" ? "B" : "P"}` : ""}</Link></li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <Card className="p-0"><AgendaList items={visible} today={today} showWorkspace={ws === "combined"} tz={tz} emptyText={view === "today" ? "Nothing on this day." : "Nothing in this range."} /></Card>
      )}
      <p className="muted mt-3 text-[12px]">Legend: bills and client payments in mango, paydays in green, appointments in teal, overdue in red. {ws === "combined" ? <>Items carry <WorkspaceBadge workspace="personal" /> / <WorkspaceBadge workspace="business" /> labels.</> : null}</p>
      {focusEvent && <EventSheet event={{ id: focusEvent.id, title: focusEvent.title, date: new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(focusEvent.startAt), startTime: focusEvent.allDay ? "" : new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(focusEvent.startAt), endTime: focusEvent.endAt && !focusEvent.allDay ? new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(focusEvent.endAt) : "", allDay: focusEvent.allDay, location: focusEvent.location, notes: focusEvent.notes, clientId: focusEvent.clientId, projectId: focusEvent.projectId, workspace: focusEvent.workspace }} clients={clients.map((c) => ({ id: c.id, name: c.company }))} projects={projects.map((p) => ({ id: p.id, name: p.name, clientId: p.clientId }))} />}
    </div>
  );
}

function MonthGrid({ month, items, today, showWs, view }: { month: string; items: AgendaItem[]; today: string; showWs: boolean; view: string }) {
  void view;
  const start = monthStart(month);
  const gridStart = weekStart(start);
  const days = Array.from({ length: 42 }, (_, i) => addDaysISO(gridStart, i));
  return (
    <div className="card overflow-hidden p-0">
      <div className="grid grid-cols-7 border-b border-rule bg-surface-2/50 text-center text-[11px] font-bold uppercase tracking-wide text-ink-soft">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-1.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const inMonth = d.startsWith(month);
          const dayItems = items.filter((it) => it.date === d);
          return (
            <div key={d} className={cx("min-h-[72px] border-b border-r border-rule p-1 md:min-h-[96px]", !inMonth && "bg-surface-2/40 text-ink-muted")}>
              <Link href={`/calendar?view=today&date=${d}`} className={cx("inline-flex size-6 items-center justify-center rounded-full text-[12px] font-semibold", d === today && "bg-mango-deep text-white")}>{Number(d.slice(8, 10))}</Link>
              <ul className="mt-0.5 space-y-0.5">
                {dayItems.slice(0, 3).map((it) => (
                  <li key={it.id}><Link href={it.href} title={it.title} className={cx("block truncate rounded px-1 text-[10px] leading-4 md:text-[11px]", it.status === "overdue" ? "bg-danger-wash text-danger" : it.kind === "payday" ? "bg-ok-wash" : it.kind === "bill" || it.kind === "invoice" ? "bg-mango-wash" : it.kind === "event" ? "bg-teal-wash" : "bg-surface-2")}>{showWs ? (it.workspace === "business" ? "B · " : "P · ") : ""}{it.title}</Link></li>
                ))}
                {dayItems.length > 3 && <li className="muted px-1 text-[10px]"><Link href={`/calendar?view=today&date=${d}`}>+{dayItems.length - 3} more</Link></li>}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
