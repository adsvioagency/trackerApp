"use client";

import { useState } from "react";
import { Field, Notice } from "@/components/ui";
import { QuickForm } from "./frame";
import { ClientProjectFields, type Ref } from "./money-forms";
import { addEventAction, addNoteAction, addTaskAction } from "@/app/(app)/add/actions";

export type WorkFormData = { workspace: "personal" | "business"; today: string; clients: Ref[]; projects: Ref[]; backHref: string; defaults?: Record<string, string | undefined> };

export function TaskForm({ data }: { data: WorkFormData }) {
  const d = data.defaults ?? {};
  return (
    <QuickForm action={addTaskAction} title="Add task" workspace={data.workspace} backHref={data.backHref} doneHref="/tasks" recordHref={(id) => `/tasks?task=${id}`} hiddenFields={{ workspace: data.workspace, noteId: d.noteId, billId: d.billId, invoiceId: d.invoiceId }}>
      {() => (
        <>
          <Field label="Title" htmlFor="title">
            <input id="title" name="title" className="input" required autoFocus defaultValue={d.title ?? ""} placeholder="What needs to happen?" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due date" htmlFor="dueDate">
              <input id="dueDate" name="dueDate" type="date" className="input" defaultValue={d.dueDate ?? ""} />
            </Field>
            <Field label="Time (optional)" htmlFor="dueTime">
              <input id="dueTime" name="dueTime" type="time" className="input" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority" htmlFor="priority">
              <select id="priority" name="priority" className="select" defaultValue="normal">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </Field>
            <Field label="Repeats" htmlFor="recurrence">
              <select id="recurrence" name="recurrence" className="select" defaultValue="none">
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </Field>
          </div>
          <Field label="Checklist (one item per line, optional)" htmlFor="checklist">
            <textarea id="checklist" name="checklist" className="textarea" rows={3} />
          </Field>
          {data.workspace === "business" && <ClientProjectFields clients={data.clients} projects={data.projects} defaultClientId={d.clientId} defaultProjectId={d.projectId} />}
          <Field label="Notes (optional)" htmlFor="notes">
            <textarea id="notes" name="notes" className="textarea" rows={2} defaultValue={d.notes ?? ""} />
          </Field>
        </>
      )}
    </QuickForm>
  );
}

export function NoteForm({ data }: { data: WorkFormData }) {
  return (
    <QuickForm action={addNoteAction} title="Quick note" workspace={data.workspace} backHref={data.backHref} doneHref="/notes" recordHref={(id) => `/notes/${id}`} hiddenFields={{ workspace: data.workspace }}>
      {() => (
        <>
          <Field label="Title (optional)" htmlFor="title">
            <input id="title" name="title" className="input" />
          </Field>
          <Field label="Note" htmlFor="body">
            <textarea id="body" name="body" className="textarea" rows={6} required autoFocus placeholder="Capture the idea…" />
          </Field>
          <Field label="Tags (comma or space separated)" htmlFor="tags">
            <input id="tags" name="tags" className="input" placeholder="idea, follow-up" />
          </Field>
          {data.workspace === "business" && <ClientProjectFields clients={data.clients} projects={data.projects} />}
          <div className="flex flex-wrap gap-4 text-[14px]">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="pinned" className="size-4 accent-[var(--mango-deep)]" /> Pin
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="isPrivate" className="size-4 accent-[var(--mango-deep)]" /> Private (never shared with the assistant unless you attach it)
            </label>
          </div>
        </>
      )}
    </QuickForm>
  );
}

export function EventForm({ data }: { data: WorkFormData }) {
  const [allDay, setAllDay] = useState(false);
  return (
    <QuickForm action={addEventAction} title={data.workspace === "business" ? "Add meeting" : "Add appointment"} workspace={data.workspace} backHref={data.backHref} doneHref="/calendar" hiddenFields={{ workspace: data.workspace }}>
      {() => (
        <>
          <Field label="Title" htmlFor="title">
            <input id="title" name="title" className="input" required autoFocus />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Date" htmlFor="date">
              <input id="date" name="date" type="date" className="input" defaultValue={data.defaults?.date ?? data.today} required />
            </Field>
            <Field label="Start" htmlFor="startTime">
              <input id="startTime" name="startTime" type="time" className="input" defaultValue="09:00" disabled={allDay} />
            </Field>
            <Field label="End" htmlFor="endTime">
              <input id="endTime" name="endTime" type="time" className="input" defaultValue="10:00" disabled={allDay} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" name="allDay" className="size-4 accent-[var(--mango-deep)]" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
          </label>
          <Field label="Location (optional)" htmlFor="location">
            <input id="location" name="location" className="input" placeholder="Address, Zoom, phone…" />
          </Field>
          {data.workspace === "business" && <ClientProjectFields clients={data.clients} projects={data.projects} />}
          <Field label="Notes (optional)" htmlFor="notes">
            <textarea id="notes" name="notes" className="textarea" rows={2} />
          </Field>
          <Notice tone="neutral">Times use your configured timezone.</Notice>
        </>
      )}
    </QuickForm>
  );
}
