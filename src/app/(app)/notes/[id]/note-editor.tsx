"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pin, PinOff, Trash2, CheckSquare } from "lucide-react";
import { Field, Pill } from "@/components/ui";
import { SubmitButton, ActionMessage, useAfterSuccess, Sheet, type ActionState } from "@/components/forms";
import { ClientProjectFields } from "@/components/quick-add/money-forms";
import { deleteNoteAction, noteToTaskAction, togglePinAction, updateNoteAction } from "../actions";

type Note = { id: string; title: string | null; body: string; tags: string[]; pinned: boolean; isPrivate: boolean; clientId: string | null; projectId: string | null; workspace: "personal" | "business"; archived: boolean };

export function NoteEditor({ note, clients, projects, linkedTasks, today }: { note: Note; clients: { id: string; name: string }[]; projects: { id: string; name: string; clientId: string }[]; linkedTasks: { id: string; title: string; status: string }[]; today: string }) {
  const [state, action] = useActionState<ActionState, FormData>(updateNoteAction, null);
  const [tState, tAction] = useActionState<ActionState, FormData>(noteToTaskAction, null);
  const [taskOpen, setTaskOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  useAfterSuccess(state);
  useAfterSuccess(tState, () => setTaskOpen(false));
  return (
    <div className="card p-4 md:p-5">
      <form action={action} className="space-y-3">
        <input type="hidden" name="id" value={note.id} />
        <div className="flex items-start gap-2">
          <Field label="Title" htmlFor="n-title" className="flex-1"><input id="n-title" name="title" className="input text-[18px] font-bold" defaultValue={note.title ?? ""} placeholder="Untitled" /></Field>
          <button type="button" className="btn btn-ghost btn-icon mt-6" aria-label={note.pinned ? "Unpin" : "Pin"} disabled={pending} onClick={() => start(async () => { await togglePinAction(note.id, !note.pinned); router.refresh(); })}>{note.pinned ? <PinOff className="size-5" /> : <Pin className="size-5" />}</button>
        </div>
        <Field label="Note" htmlFor="n-body"><textarea id="n-body" name="body" className="textarea min-h-[220px]" defaultValue={note.body} required /></Field>
        <Field label="Tags" htmlFor="n-tags"><input id="n-tags" name="tags" className="input" defaultValue={note.tags.join(", ")} /></Field>
        {note.workspace === "business" && <ClientProjectFields clients={clients} projects={projects} defaultClientId={note.clientId} defaultProjectId={note.projectId} />}
        <div className="flex flex-wrap gap-4 text-[14px]">
          <label className="flex items-center gap-2"><input type="checkbox" name="pinned" defaultChecked={note.pinned} className="size-4 accent-[var(--mango-deep)]" /> Pinned</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="isPrivate" defaultChecked={note.isPrivate} className="size-4 accent-[var(--mango-deep)]" /> Private (kept out of the assistant unless attached)</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="archived" defaultChecked={note.archived} className="size-4 accent-[var(--mango-deep)]" /> Archived</label>
        </div>
        <ActionMessage state={state} />
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton>Save note</SubmitButton>
          <button type="button" className="btn btn-secondary" onClick={() => setTaskOpen(true)}><CheckSquare className="size-4" /> Turn into task</button>
          <button type="button" className="btn btn-ghost btn-icon ml-auto" aria-label="Delete note" disabled={pending} onClick={() => { if (window.confirm("Delete this note?")) start(async () => { await deleteNoteAction(note.id); }); }}><Trash2 className="size-4" /></button>
        </div>
      </form>
      {linkedTasks.length > 0 && (
        <div className="mt-4 border-t border-rule pt-3 text-[14px]">
          <div className="label">Tasks from this note</div>
          <ul className="space-y-1">{linkedTasks.map((t) => <li key={t.id}><Link href={`/tasks?task=${t.id}`} className="hover:underline">{t.title}</Link> <Pill tone={t.status === "done" ? "ok" : "neutral"}>{t.status}</Pill></li>)}</ul>
        </div>
      )}
      <Sheet open={taskOpen} onClose={() => setTaskOpen(false)} title="Turn note into a task">
        <form action={tAction} className="space-y-3">
          <input type="hidden" name="id" value={note.id} />
          <Field label="Task title" htmlFor="nt-title"><input id="nt-title" name="title" className="input" defaultValue={note.title ?? note.body.slice(0, 80)} required /></Field>
          <Field label="Due date" htmlFor="nt-due"><input id="nt-due" name="dueDate" type="date" className="input" defaultValue={today} /></Field>
          <ActionMessage state={tState} />
          <SubmitButton>Create task</SubmitButton>
        </form>
      </Sheet>
    </div>
  );
}
