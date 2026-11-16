"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Trash2, Paperclip } from "lucide-react";
import { Field, Notice, Pill, Money, cx } from "@/components/ui";
import { Sheet, SubmitButton, ActionMessage, useAfterSuccess, useResetKey, type ActionState } from "@/components/forms";
import { archiveProjectAction, deliverableAction, dependencyAction, installmentAction, phasesAction, setPhaseAction, updateProjectAction, uploadProjectFileAction, waitingAction } from "../actions";
import { invoiceFromInstallmentAction } from "@/app/(app)/documents/actions";
import { fmtMoney, majorInput } from "@/lib/money/format";
import { fmtDate, addDaysISO } from "@/lib/dates";

type Project = { id: string; name: string; brief: string | null; scope: string | null; status: string; startDate: string | null; targetDate: string | null; agreedValueMinor: number; currency: string; nextAction: string | null; notes: string | null; waitingOnClient: boolean; waitingNote: string | null; followUpDate: string | null; archived: boolean };

export function ProjectHeader({ project: p, today }: { project: Project; today: string }) {
  const [open, setOpen] = useState(false);
  const [waitOpen, setWaitOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(updateProjectAction, null);
  const [wState, wAction] = useActionState<ActionState, FormData>(waitingAction, null);
  const [pending, start] = useTransition();
  const router = useRouter();
  useAfterSuccess(state, () => setOpen(false));
  useAfterSuccess(wState, () => setWaitOpen(false));
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={cx("btn btn-sm", p.waitingOnClient ? "btn-secondary" : "btn-secondary")} onClick={() => setWaitOpen(true)}>{p.waitingOnClient ? "Update waiting status" : "Flag: waiting on client"}</button>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>Edit</button>
      <Sheet open={waitOpen} onClose={() => setWaitOpen(false)} title="Waiting on the client?">
        <form action={wAction} className="space-y-3">
          <input type="hidden" name="id" value={p.id} />
          <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="waiting" defaultChecked={p.waitingOnClient} className="size-4 accent-[var(--mango-deep)]" /> Yes, this project is blocked by the client</label>
          <Field label="What are you waiting for?" htmlFor="w-note"><input id="w-note" name="waitingNote" className="input" defaultValue={p.waitingNote ?? ""} placeholder="e.g. product photos and descriptions" /></Field>
          <Field label="Follow up on" htmlFor="w-follow" hint="Shows on Today and the calendar until cleared."><input id="w-follow" name="followUpDate" type="date" className="input" defaultValue={p.followUpDate ?? addDaysISO(today, 3)} /></Field>
          <ActionMessage state={wState} />
          <SubmitButton>Save</SubmitButton>
        </form>
      </Sheet>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Edit ${p.name}`}>
        <form action={action} className="space-y-3">
          <input type="hidden" name="id" value={p.id} />
          <Field label="Name" htmlFor="p-name"><input id="p-name" name="name" className="input" required defaultValue={p.name} /></Field>
          <Field label="Brief" htmlFor="p-brief"><textarea id="p-brief" name="brief" className="textarea" rows={2} defaultValue={p.brief ?? ""} /></Field>
          <Field label="Scope" htmlFor="p-scope"><textarea id="p-scope" name="scope" className="textarea" rows={3} defaultValue={p.scope ?? ""} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status" htmlFor="p-status"><select id="p-status" name="status" className="select" defaultValue={p.status}><option value="planning">Planning</option><option value="active">Active</option><option value="waiting_client">Waiting on client</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></Field>
            <Field label="Follow-up date" htmlFor="p-follow"><input id="p-follow" name="followUpDate" type="date" className="input" defaultValue={p.followUpDate ?? ""} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date" htmlFor="p-start"><input id="p-start" name="startDate" type="date" className="input" defaultValue={p.startDate ?? ""} /></Field>
            <Field label="Target date" htmlFor="p-target"><input id="p-target" name="targetDate" type="date" className="input" defaultValue={p.targetDate ?? ""} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Agreed value" htmlFor="p-agreed" className="col-span-2"><input id="p-agreed" name="agreed" className="input" inputMode="decimal" defaultValue={majorInput(p.agreedValueMinor)} /></Field>
            <Field label="Currency" htmlFor="p-cur"><select id="p-cur" name="currency" className="select" defaultValue={p.currency}><option value="USD">US$</option><option value="DOP">RD$</option></select></Field>
          </div>
          <Field label="Next action" htmlFor="p-next"><input id="p-next" name="nextAction" className="input" defaultValue={p.nextAction ?? ""} /></Field>
          <Field label="Notes" htmlFor="p-notes"><textarea id="p-notes" name="notes" className="textarea" rows={3} defaultValue={p.notes ?? ""} /></Field>
          <ActionMessage state={state} />
          <div className="flex items-center gap-2">
            <SubmitButton>Save project</SubmitButton>
            <button type="button" className="btn btn-ghost btn-sm ml-auto" disabled={pending} onClick={() => { if (window.confirm(p.archived ? "Restore this project?" : "Archive this project? Its history, documents and payments stay.")) start(async () => { await archiveProjectAction(p.id, !p.archived); router.refresh(); setOpen(false); }); }}>{p.archived ? "Restore" : "Archive"}</button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}

export function ProjectPhases({ projectId, phases, currentPhaseId }: { projectId: string; phases: { id: string; name: string; sort: number; completed: boolean; targetDate: string | null }[]; currentPhaseId: string | null }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(phasesAction, null);
  useAfterSuccess(state, () => setEditing(false));
  const idx = phases.findIndex((p) => p.id === currentPhaseId);
  const go = (phaseId: string) => start(async () => { await setPhaseAction(projectId, phaseId); router.refresh(); });
  return (
    <div>
      <ol className="flex flex-wrap gap-1.5" aria-label="Phases">
        {phases.map((ph, i) => {
          const current = ph.id === currentPhaseId;
          return (
            <li key={ph.id}>
              <button type="button" disabled={pending} onClick={() => go(ph.id)} aria-current={current ? "step" : undefined} className={cx("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium", current ? "border-mango bg-mango-wash text-mango-deep" : ph.completed ? "border-ok/40 bg-ok-wash text-ok" : "border-rule text-ink-soft hover:bg-surface-2")}>
                {ph.completed ? <Check className="size-3.5" /> : <span className="text-[11px]">{i + 1}</span>}
                {ph.name}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-secondary btn-sm" disabled={pending || idx <= 0} onClick={() => go(phases[idx - 1].id)}><ChevronLeft className="size-4" /> Previous phase</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={pending || idx < 0 || idx >= phases.length - 1} onClick={() => go(phases[idx + 1].id)}>Advance to {phases[idx + 1]?.name ?? "—"} <ChevronRight className="size-4" /></button>
        <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={() => setEditing((e) => !e)}>Customize phases</button>
      </div>
      <p className="muted mt-2 text-[12px]">Tap a phase or use the buttons (keyboard friendly). Phases before the current one count as done; delivery progress is {phases.length ? Math.round((phases.filter((p) => p.completed).length / phases.length) * 100) : 0}%.</p>
      {editing && (
        <form action={action} className="mt-3 space-y-2 border-t border-rule pt-3">
          <input type="hidden" name="projectId" value={projectId} />
          <Field label="Phases, one per line (in order)" htmlFor="ph-list" hint="Phases that keep their name keep their history."><textarea id="ph-list" name="phases" className="textarea" rows={7} defaultValue={phases.map((p) => p.name).join("\n")} /></Field>
          <ActionMessage state={state} />
          <div className="flex gap-2"><SubmitButton className="btn btn-secondary btn-sm">Save phases</SubmitButton><button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button></div>
        </form>
      )}
    </div>
  );
}

export function ProjectDeliverables({ projectId, items }: { projectId: string; items: { id: string; title: string; done: boolean }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(deliverableAction, null);
  const resetKey = useResetKey(state);
  const done = items.filter((i) => i.done).length;
  return (
    <div>
      <ul className="space-y-1">
        {items.map((d) => (
          <li key={d.id} className="flex items-center gap-2 text-[14px]">
            <form action={action} className="flex flex-1 items-center gap-2">
              <input type="hidden" name="op" value="toggle" /><input type="hidden" name="id" value={d.id} /><input type="hidden" name="done" value={d.done ? "0" : "1"} />
              <button type="submit" className={cx("flex size-5 items-center justify-center rounded border", d.done ? "border-ok bg-ok text-white" : "border-rule-strong")} aria-label={d.done ? `Mark ${d.title} not done` : `Mark ${d.title} done`}>{d.done && <Check className="size-3.5" />}</button>
              <span className={cx("flex-1", d.done && "text-ink-muted line-through")}>{d.title}</span>
            </form>
            <form action={action}><input type="hidden" name="op" value="remove" /><input type="hidden" name="id" value={d.id} /><button type="submit" className="btn btn-ghost btn-icon btn-sm" aria-label="Remove"><Trash2 className="size-4" /></button></form>
          </li>
        ))}
        {items.length === 0 && <li className="muted text-[13px]">No deliverables listed yet.</li>}
      </ul>
      <form action={action} className="mt-3 flex gap-2" key={resetKey}>
        <input type="hidden" name="op" value="add" /><input type="hidden" name="projectId" value={projectId} />
        <input name="title" aria-label="New deliverable" className="input py-1.5" placeholder="Add a deliverable" required />
        <SubmitButton className="btn btn-secondary btn-sm">Add</SubmitButton>
      </form>
      {items.length > 0 && <p className="muted mt-2 text-[12px]">{done} of {items.length} done.</p>}
    </div>
  );
}

export function ProjectDependencies({ projectId, items, today }: { projectId: string; items: { id: string; title: string; status: string; dueDate: string | null; requestedOn: string | null; receivedOn: string | null }[]; today: string }) {
  const [state, action] = useActionState<ActionState, FormData>(dependencyAction, null);
  const resetKey = useResetKey(state);
  return (
    <div>
      <ul className="space-y-1.5">
        {items.map((d) => (
          <li key={d.id} className="flex items-center gap-2 text-[14px]">
            <div className="flex-1">
              <span className={d.status === "received" ? "text-ink-muted line-through" : ""}>{d.title}</span>
              <div className="muted text-[12px]">{d.status === "received" ? `Received ${d.receivedOn ? fmtDate(d.receivedOn) : ""}` : `${d.requestedOn ? `Requested ${fmtDate(d.requestedOn)}` : "Pending"}${d.dueDate ? ` · needed by ${fmtDate(d.dueDate)}${d.dueDate < today ? " (late)" : ""}` : ""}`}</div>
            </div>
            {d.status === "received" ? <Pill tone="ok">Received</Pill> : <Pill tone="warn">Pending</Pill>}
            <form action={action}><input type="hidden" name="op" value={d.status === "received" ? "pending" : "received"} /><input type="hidden" name="id" value={d.id} /><button type="submit" className="btn btn-ghost btn-sm">{d.status === "received" ? "Undo" : "Received"}</button></form>
            <form action={action}><input type="hidden" name="op" value="remove" /><input type="hidden" name="id" value={d.id} /><button type="submit" className="btn btn-ghost btn-icon btn-sm" aria-label="Remove"><Trash2 className="size-4" /></button></form>
          </li>
        ))}
        {items.length === 0 && <li className="muted text-[13px]">Nothing requested from the client yet.</li>}
      </ul>
      <form action={action} className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2" key={resetKey}>
        <input type="hidden" name="op" value="add" /><input type="hidden" name="projectId" value={projectId} />
        <input name="title" aria-label="What the client must provide" className="input py-1.5" placeholder="e.g. Product photos" required />
        <input name="dueDate" type="date" aria-label="Needed by" className="input py-1.5" />
        <SubmitButton className="btn btn-secondary btn-sm">Add</SubmitButton>
      </form>
    </div>
  );
}

export function ProjectInstallments({ projectId, currency, items, invoices, today }: { projectId: string; currency: string; items: { id: string; label: string; amountMinor: number; dueDate: string | null; status: string; invoiceId: string | null }[]; invoices: { id: string; number: string; status: string; balanceMinor: number; totalMinor: number; dueDate: string | null; overdue: boolean }[]; today: string }) {
  const [state, action] = useActionState<ActionState, FormData>(installmentAction, null);
  const [iState, iAction] = useActionState<ActionState, FormData>(invoiceFromInstallmentAction, null);
  const router = useRouter();
  const resetKey = useResetKey(state);
  useAfterSuccess(iState, () => { if (iState?.id) router.push(`/documents/invoices/${iState.id}`); });
  const total = items.reduce((s, i) => s + i.amountMinor, 0);
  return (
    <div>
      <table className="table">
        <thead><tr><th>Installment</th><th>When</th><th>Status</th><th className="num">Amount</th><th /></tr></thead>
        <tbody>
          {items.map((i) => {
            const inv = invoices.find((x) => x.id === i.invoiceId);
            return (
              <tr key={i.id}>
                <td className="font-medium">{i.label}</td>
                <td className="muted">{inv?.dueDate ? `due ${fmtDate(inv.dueDate)}` : i.dueDate ? fmtDate(i.dueDate) : "—"}</td>
                <td>{i.status === "paid" ? <Pill tone="ok">Paid</Pill> : i.status === "invoiced" ? <Pill tone={inv?.overdue ? "danger" : "mango"}>{inv?.overdue ? "Overdue" : "Invoiced"}{inv && inv.balanceMinor < inv.totalMinor ? ` · ${fmtMoney(inv.balanceMinor, currency)} left` : ""}</Pill> : <Pill>Planned</Pill>}</td>
                <td className="num tnum"><Money minor={i.amountMinor} currency={currency} /></td>
                <td className="text-right">
                  {i.status === "planned" ? (
                    <div className="flex justify-end gap-1">
                      <form action={iAction}><input type="hidden" name="installmentId" value={i.id} /><input type="hidden" name="issueDate" value={today} /><input type="hidden" name="dueDate" value={i.dueDate ?? addDaysISO(today, 7)} /><button type="submit" className="btn btn-secondary btn-sm">Create invoice</button></form>
                      <form action={action}><input type="hidden" name="op" value="remove" /><input type="hidden" name="id" value={i.id} /><button type="submit" className="btn btn-ghost btn-icon btn-sm" aria-label="Remove"><Trash2 className="size-4" /></button></form>
                    </div>
                  ) : inv ? (
                    <Link href={`/documents/invoices/${inv.id}`} className="btn btn-ghost btn-sm">{inv.number}</Link>
                  ) : null}
                </td>
              </tr>
            );
          })}
          {items.length === 0 && <tr><td colSpan={5} className="muted text-center">No installments planned. Add a deposit, milestones and a final balance, or approve a proposal to sync its schedule.</td></tr>}
        </tbody>
        {items.length > 0 && <tfoot><tr><td colSpan={3} className="font-semibold">Scheduled total</td><td className="num tnum font-semibold">{fmtMoney(total, currency)}</td><td /></tr></tfoot>}
      </table>
      <form action={action} className="mt-3 grid grid-cols-[1fr_120px_140px_auto] gap-2" key={resetKey}>
        <input type="hidden" name="op" value="add" /><input type="hidden" name="projectId" value={projectId} />
        <input name="label" aria-label="Installment label" className="input py-1.5" placeholder="e.g. 50% to begin" required />
        <input name="amount" aria-label="Amount" className="input py-1.5" inputMode="decimal" placeholder="0.00" required />
        <input name="dueDate" type="date" aria-label="Due date" className="input py-1.5" />
        <SubmitButton className="btn btn-secondary btn-sm">Add</SubmitButton>
      </form>
      <ActionMessage state={state} />
      <ActionMessage state={iState} />
      <Notice tone="neutral" className="mt-3">Each installment appears once: planned here, then as an invoice due date on the calendar, then paid. Invoices without a planned installment also count toward “invoiced”.</Notice>
    </div>
  );
}

export function ProjectFiles({ projectId, files }: { projectId: string; files: { id: string; filename: string; label: string | null; mime: string }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(uploadProjectFileAction, null);
  const resetKey = useResetKey(state);
  return (
    <div>
      <ul className="space-y-1 text-[14px]">
        {files.map((f) => <li key={f.id} className="flex items-center gap-2"><Paperclip className="size-4 text-ink-muted" /><a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="font-medium text-mango-deep hover:underline">{f.label ?? f.filename}</a><span className="muted text-[12px]">{f.mime}</span></li>)}
        {files.length === 0 && <li className="muted text-[13px]">No files attached.</li>}
      </ul>
      <form action={action} className="mt-3 flex flex-wrap items-end gap-2" key={resetKey}>
        <input type="hidden" name="projectId" value={projectId} />
        <Field label="Attach a file (private)" htmlFor="pf-file" className="flex-1"><input id="pf-file" name="file" type="file" className="input" required /></Field>
        <Field label="Label" htmlFor="pf-label"><input id="pf-label" name="label" className="input" placeholder="e.g. Signed proposal" /></Field>
        <SubmitButton className="btn btn-secondary btn-sm">Upload</SubmitButton>
      </form>
      <ActionMessage state={state} />
    </div>
  );
}

