"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Paperclip, Send, Trash2, NotebookPen, Check, X } from "lucide-react";
import { ActionMessage, SheetButton, SubmitButton, type ActionState } from "@/components/forms";
import { Pill } from "@/components/ui";
import { askAction, applyChangeAction, rejectChangeAction, saveReplyAsNoteAction, attachNotesAction, deleteConversationAction } from "./actions";

const EXAMPLES = ["What should I focus on today?", "Who owes me money?", "Which projects are blocked?", "How much do I spend on subscriptions?", "What did I spend this month by category?"];

export function Composer({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [state, action, pending] = useActionState(async (p: ActionState, fd: FormData) => {
    const r = await askAction(p, fd);
    if (r?.ok && r.id) {
      if (inputRef.current) inputRef.current.value = "";
      if (r.id !== conversationId) router.replace(`/assistant?c=${r.id}`);
      else router.refresh();
    }
    return r;
  }, null);

  const ask = (q: string) => {
    if (!inputRef.current || !formRef.current) return;
    inputRef.current.value = q;
    formRef.current.requestSubmit();
  };

  return (
    <div className="border-t border-rule p-3 md:p-4">
      <div className="mb-2 flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Example questions">
        {EXAMPLES.map((q) => (
          <button key={q} type="button" role="listitem" className="btn btn-ghost btn-sm shrink-0" disabled={pending} onClick={() => ask(q)}>
            {q}
          </button>
        ))}
      </div>
      <form ref={formRef} action={action} className="flex items-end gap-2">
        <input type="hidden" name="conversationId" value={conversationId} />
        <label htmlFor="assistant-q" className="sr-only">Your question</label>
        <textarea
          ref={inputRef}
          id="assistant-q"
          name="question"
          rows={2}
          required
          maxLength={4000}
          placeholder="Ask about your money, clients, projects or tasks…"
          className="input min-h-[52px] flex-1 resize-y"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
        />
        <SubmitButton className="btn btn-primary h-[52px]" pendingText="Thinking…">
          <Send className="size-4" aria-hidden />
          <span className="sr-only md:not-sr-only">Send</span>
        </SubmitButton>
      </form>
      {pending && <p className="muted mt-2 text-[13px]" role="status">Looking through your records…</p>}
      <ActionMessage state={state?.error ? state : null} />
    </div>
  );
}

export function MessageActions({ messageId, defaultWorkspace, mode, sources }: { messageId: string; defaultWorkspace: "personal" | "business"; mode: "claude" | "rules"; sources: string[] }) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule pt-2 text-[12px]">
      <span className="muted">{mode === "claude" ? "AI answer" : "Rule-based answer"}{sources.length ? ` · from ${sources.map((s) => s.replace(/^get_|_/g, " ").trim()).join(", ")}` : ""}</span>
      {state?.ok && state.id ? (
        <Link href={`/notes/${state.id}`} className="btn btn-ghost btn-sm ml-auto">Saved — open note</Link>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm ml-auto" disabled={pending} onClick={() => start(async () => setState(await saveReplyAsNoteAction(messageId, defaultWorkspace)))}>
          <NotebookPen className="size-3.5" aria-hidden /> Save as note
        </button>
      )}
      {state?.error && <span className="text-danger">{state.error}</span>}
    </div>
  );
}

export function ProposalCard({ change }: { change: { id: string; summary: string; status: string; preview: { field: string; from: string | null; to: string | null }[] } }) {
  const router = useRouter();
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-3 rounded-xl border border-mango/40 bg-mango-wash p-3 text-[14px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Suggested change</span>
        <Pill tone={change.status === "applied" ? "ok" : change.status === "rejected" ? "neutral" : "mango"}>{change.status === "proposed" ? "Needs your approval" : change.status === "applied" ? "Applied" : "Dismissed"}</Pill>
      </div>
      <p className="mt-1">{change.summary}</p>
      <table className="mt-2 w-full text-[13px]">
        <caption className="sr-only">What would change</caption>
        <thead>
          <tr className="muted text-left"><th className="py-1 pr-2 font-medium">Field</th><th className="py-1 pr-2 font-medium">Now</th><th className="py-1 font-medium">After</th></tr>
        </thead>
        <tbody>
          {change.preview.map((p) => (
            <tr key={p.field} className="border-t border-rule align-top">
              <td className="py-1 pr-2">{p.field}</td>
              <td className="muted py-1 pr-2 break-words">{p.from ?? "—"}</td>
              <td className="py-1 font-medium break-words">{p.to ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {change.status === "proposed" && (
        <div className="mt-3 flex gap-2">
          <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => start(async () => { const r = await applyChangeAction(change.id); setState(r); router.refresh(); })}>
            <Check className="size-4" aria-hidden /> Apply
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { await rejectChangeAction(change.id); router.refresh(); })}>
            <X className="size-4" aria-hidden /> Dismiss
          </button>
        </div>
      )}
      {state?.error && <p className="mt-2 text-danger">{state.error}</p>}
    </div>
  );
}

type NoteOpt = { id: string; title: string; isPrivate: boolean; workspace: "personal" | "business" };

export function AttachNotes({ conversationId, attached, notes }: { conversationId: string; attached: string[]; notes: NoteOpt[] }) {
  const router = useRouter();
  return (
    <SheetButton label={<span className="sr-only md:not-sr-only">Notes{attached.length ? ` (${attached.length})` : ""}</span>} icon={<Paperclip className="size-4" aria-hidden />} title="Attach notes as context" className="btn btn-ghost btn-sm">
      {(close) => <AttachForm conversationId={conversationId} attached={attached} notes={notes} onDone={(id) => { close(); if (id && id !== conversationId) router.replace(`/assistant?c=${id}`); else router.refresh(); }} />}
    </SheetButton>
  );
}

function AttachForm({ conversationId, attached, notes, onDone }: { conversationId: string; attached: string[]; notes: NoteOpt[]; onDone: (id?: string) => void }) {
  const [state, action] = useActionState(async (p: ActionState, fd: FormData) => {
    const r = await attachNotesAction(p, fd);
    if (r?.ok) onDone(r.id);
    return r;
  }, null);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="conversationId" value={conversationId} />
      <p className="muted text-[14px]">Only notes you tick here are shared with the assistant. Private notes are never included otherwise.</p>
      {notes.length === 0 ? (
        <p className="muted">You have no notes yet.</p>
      ) : (
        <ul className="grid max-h-[50vh] gap-1 overflow-y-auto">
          {notes.map((n) => (
            <li key={n.id}>
              <label className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-surface-2/60">
                <input type="checkbox" name="noteIds" value={n.id} defaultChecked={attached.includes(n.id)} className="size-4" />
                <span className="min-w-0 flex-1 truncate">{n.title}</span>
                {n.isPrivate && <Pill>Private</Pill>}
                <Pill tone={n.workspace}>{n.workspace === "personal" ? "Personal" : "Business"}</Pill>
              </label>
            </li>
          ))}
        </ul>
      )}
      <ActionMessage state={state} />
      <SubmitButton>Save attachments</SubmitButton>
    </form>
  );
}

export function DeleteConversation({ id }: { id: string }) {
  return (
    <form action={deleteConversationAction.bind(null, id)}>
      <button
        type="submit"
        className="btn btn-ghost btn-sm"
        aria-label="Delete conversation"
        onClick={(e) => {
          if (!window.confirm("Delete this conversation? Applied changes stay in place.")) e.preventDefault();
        }}
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    </form>
  );
}
