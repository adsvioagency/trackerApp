"use client";

import Link from "next/link";
import { useActionState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Field } from "@/components/ui";
import { Sheet, SubmitButton, ActionMessage, useAfterSuccess, type ActionState } from "@/components/forms";
import { ClientProjectFields } from "@/components/quick-add/money-forms";
import { deleteEventAction, updateEventAction } from "./actions";

export function CalendarNav({ label, prevHref, nextHref, todayHref }: { label: string; prevHref: string; nextHref: string; todayHref: string }) {
  return (
    <div className="inline-flex items-center rounded-[10px] border border-rule bg-surface">
      <Link href={prevHref} className="btn btn-ghost btn-icon btn-sm" aria-label="Previous"><ChevronLeft className="size-4" /></Link>
      <span className="min-w-[150px] text-center text-[13px] font-semibold">{label}</span>
      <Link href={nextHref} className="btn btn-ghost btn-icon btn-sm" aria-label="Next"><ChevronRight className="size-4" /></Link>
      <Link href={todayHref} className="btn btn-ghost btn-sm">Today</Link>
    </div>
  );
}

type Ev = { id: string; title: string; date: string; startTime: string; endTime: string; allDay: boolean; location: string | null; notes: string | null; clientId: string | null; projectId: string | null; workspace: "personal" | "business" };

export function EventSheet({ event, clients, projects }: { event: Ev; clients: { id: string; name: string }[]; projects: { id: string; name: string; clientId: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const close = () => {
    const next = new URLSearchParams(sp.toString());
    next.delete("event");
    router.replace(`${pathname}?${next.toString()}`);
  };
  const [state, action] = useActionState<ActionState, FormData>(updateEventAction, null);
  const [pending, start] = useTransition();
  useAfterSuccess(state, close);
  return (
    <Sheet open onClose={close} title={event.workspace === "business" ? "Meeting" : "Appointment"}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="id" value={event.id} />
        <Field label="Title" htmlFor="ev-title"><input id="ev-title" name="title" className="input" defaultValue={event.title} required /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Date" htmlFor="ev-date"><input id="ev-date" name="date" type="date" className="input" defaultValue={event.date} required /></Field>
          <Field label="Start" htmlFor="ev-start"><input id="ev-start" name="startTime" type="time" className="input" defaultValue={event.startTime} /></Field>
          <Field label="End" htmlFor="ev-end"><input id="ev-end" name="endTime" type="time" className="input" defaultValue={event.endTime} /></Field>
        </div>
        <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="allDay" defaultChecked={event.allDay} className="size-4 accent-[var(--mango-deep)]" /> All day</label>
        <Field label="Location" htmlFor="ev-loc"><input id="ev-loc" name="location" className="input" defaultValue={event.location ?? ""} /></Field>
        {event.workspace === "business" && <ClientProjectFields clients={clients} projects={projects} defaultClientId={event.clientId} defaultProjectId={event.projectId} />}
        <Field label="Notes" htmlFor="ev-notes"><textarea id="ev-notes" name="notes" className="textarea" rows={3} defaultValue={event.notes ?? ""} /></Field>
        <ActionMessage state={state} />
        <div className="flex items-center gap-2">
          <SubmitButton>Save</SubmitButton>
          <button type="button" className="btn btn-ghost btn-icon ml-auto" aria-label="Delete" disabled={pending} onClick={() => { if (window.confirm("Delete this appointment?")) start(async () => { await deleteEventAction(event.id); close(); router.refresh(); }); }}><Trash2 className="size-4" /></button>
        </div>
      </form>
    </Sheet>
  );
}
