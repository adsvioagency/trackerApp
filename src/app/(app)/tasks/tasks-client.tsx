"use client";

import Link from "next/link";
import { useActionState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Check, Repeat, Trash2 } from "lucide-react";
import type { TaskRow } from "@/lib/tasks";
import { Field, Pill, WorkspaceBadge, cx } from "@/components/ui";
import { Sheet, SubmitButton, ActionMessage, useAfterSuccess, type ActionState } from "@/components/forms";
import { cancelTaskAction, completeTaskAction, deleteTaskAction, reopenTaskAction, toggleChecklistAction, updateTaskAction } from "./actions";
import { fmtDate, relativeDay } from "@/lib/dates";
import { ClientProjectFields } from "@/components/quick-add/money-forms";

export function TaskList({ items, today, showWs }: { items: TaskRow[]; today: string; showWs: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <ul>
      {items.map((t) => {
        const done = t.status === "done";
        const overdue = !done && t.dueDate && t.dueDate < today;
        const checklistDone = t.checklist.filter((c) => c.done).length;
        return (
          <li key={t.id} className="flex items-center gap-3 border-b border-rule px-4 py-2.5 last:border-b-0">
            <button type="button" aria-label={done ? `Reopen ${t.title}` : `Complete ${t.title}`} disabled={pending} className={cx("flex size-6 shrink-0 items-center justify-center rounded-full border-2", done ? "border-ok bg-ok text-white" : "border-rule-strong hover:border-mango")} onClick={() => start(async () => { if (done) await reopenTaskAction(t.id); else await completeTaskAction(t.id); router.refresh(); })}>
              {done && <Check className="size-3.5" />}
            </button>
            <Link href={`/tasks?task=${t.id}`} className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cx("font-medium", done && "text-ink-muted line-through")}>{t.title}</span>
                {showWs && <WorkspaceBadge workspace={t.workspace} />}
                {t.priority === "high" && !done && <Pill tone="danger">High</Pill>}
                {t.priority === "low" && !done && <Pill>Low</Pill>}
                {t.recurrence && <Repeat className="size-3.5 text-ink-muted" aria-label="Repeats" />}
                {t.checklist.length > 0 && <Pill>{checklistDone}/{t.checklist.length}</Pill>}
              </div>
              <div className={cx("text-[12px]", overdue ? "font-semibold text-danger" : "muted")}>
                {t.dueDate ? `${fmtDate(t.dueDate, "weekday")}${t.dueTime ? ` ${t.dueTime}` : ""} · ${relativeDay(t.dueDate, today)}` : "No date"}
                {t.projectName ? ` · ${t.projectName}` : t.clientName ? ` · ${t.clientName}` : ""}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function TaskSheet({ task, clients, projects }: { task: TaskRow; clients: { id: string; name: string }[]; projects: { id: string; name: string; clientId: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const close = () => {
    const next = new URLSearchParams(sp.toString());
    next.delete("task");
    router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`);
  };
  const [state, action] = useActionState<ActionState, FormData>(updateTaskAction, null);
  const [pending, start] = useTransition();
  useAfterSuccess(state, close);
  const done = task.status === "done";
  return (
    <Sheet open onClose={close} title={done ? "Completed task" : "Task"}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="id" value={task.id} />
        <input type="hidden" name="checklistState" value={JSON.stringify(task.checklist)} />
        <Field label="Title" htmlFor="t-title"><input id="t-title" name="title" className="input" defaultValue={task.title} required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date" htmlFor="t-due"><input id="t-due" name="dueDate" type="date" className="input" defaultValue={task.dueDate ?? ""} /></Field>
          <Field label="Time" htmlFor="t-time"><input id="t-time" name="dueTime" type="time" className="input" defaultValue={task.dueTime ?? ""} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority" htmlFor="t-prio"><select id="t-prio" name="priority" className="select" defaultValue={task.priority}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></Field>
          <Field label="Repeats" htmlFor="t-rec"><select id="t-rec" name="recurrence" className="select" defaultValue={task.recurrence?.frequency ?? "none"}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></Field>
        </div>
        {task.checklist.length > 0 && (
          <div>
            <div className="label">Checklist</div>
            <ul className="space-y-1">
              {task.checklist.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-[14px]">
                  <button type="button" aria-label={c.done ? `Uncheck ${c.text}` : `Check ${c.text}`} disabled={pending} className={cx("flex size-5 items-center justify-center rounded border", c.done ? "border-ok bg-ok text-white" : "border-rule-strong")} onClick={() => start(async () => { await toggleChecklistAction(task.id, c.id, !c.done); router.refresh(); })}>{c.done && <Check className="size-3.5" />}</button>
                  <span className={c.done ? "text-ink-muted line-through" : ""}>{c.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Field label="Checklist items (one per line)" htmlFor="t-check"><textarea id="t-check" name="checklist" className="textarea" rows={3} defaultValue={task.checklist.map((c) => c.text).join("\n")} /></Field>
        {task.workspace === "business" && <ClientProjectFields clients={clients} projects={projects} defaultClientId={task.clientId} defaultProjectId={task.projectId} />}
        <Field label="Notes" htmlFor="t-notes"><textarea id="t-notes" name="notes" className="textarea" rows={3} defaultValue={task.notes ?? ""} /></Field>
        <div className="muted flex flex-wrap gap-2 text-[12px]">
          {task.projectName && <Link href={`/projects/${task.projectId}`} className="underline">Project: {task.projectName}</Link>}
          {task.clientName && <Link href={`/clients/${task.clientId}`} className="underline">Client: {task.clientName}</Link>}
          {task.noteId && <Link href={`/notes/${task.noteId}`} className="underline">From note</Link>}
          {task.invoiceId && <Link href={`/documents/invoices/${task.invoiceId}`} className="underline">Invoice</Link>}
          {task.billId && <Link href="/money/bills" className="underline">Bill</Link>}
        </div>
        <ActionMessage state={state} />
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton>Save</SubmitButton>
          {done ? (
            <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => start(async () => { await reopenTaskAction(task.id); router.refresh(); close(); })}>Reopen</button>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => start(async () => { await completeTaskAction(task.id); router.refresh(); close(); })}><Check className="size-4" /> Mark done</button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { await cancelTaskAction(task.id); router.refresh(); close(); })}>Cancel task</button>
            </>
          )}
          <button type="button" className="btn btn-ghost btn-icon ml-auto" aria-label="Delete task" disabled={pending} onClick={() => { if (window.confirm("Delete this task?")) start(async () => { await deleteTaskAction(task.id); router.refresh(); close(); }); }}><Trash2 className="size-4" /></button>
        </div>
      </form>
    </Sheet>
  );
}
