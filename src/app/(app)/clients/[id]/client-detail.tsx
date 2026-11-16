"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Field, Notice } from "@/components/ui";
import { Sheet, SubmitButton, ActionMessage, useAfterSuccess, useResetKey, type ActionState } from "@/components/forms";
import { addActivityAction, addContactAction, archiveClientAction, removeContactAction, updateClientAction } from "../actions";
import { majorInput } from "@/lib/money/format";

type Client = { id: string; company: string; contactName: string | null; email: string | null; phone: string | null; website: string | null; billingAddress: string | null; preferredContact: string | null; notes: string | null; status: string; pipelineStage: string; estimateMinor: number | null; estimateCurrency: string | null; followUpDate: string | null; archived: boolean };
type Contact = { id: string; name: string; role: string | null; email: string | null; phone: string | null };

export function ClientDetailClient({ client: c, contacts, today }: { client: Client; contacts: Contact[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(updateClientAction, null);
  const [cState, cAction] = useActionState<ActionState, FormData>(addContactAction, null);
  const [pending, start] = useTransition();
  const router = useRouter();
  useAfterSuccess(state, () => setOpen(false));
  useAfterSuccess(cState);
  const [status, setStatus] = useState(c.status);
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setContactsOpen(true)}>Contacts ({contacts.length})</button>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>Edit</button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Edit ${c.company}`}>
        <form action={action} className="space-y-3">
          <input type="hidden" name="id" value={c.id} />
          <Field label="Company" htmlFor="e-company"><input id="e-company" name="company" className="input" required defaultValue={c.company} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact name" htmlFor="e-contact"><input id="e-contact" name="contactName" className="input" defaultValue={c.contactName ?? ""} /></Field>
            <Field label="Preferred contact" htmlFor="e-pref"><select id="e-pref" name="preferredContact" className="select" defaultValue={c.preferredContact ?? "whatsapp"}><option value="whatsapp">WhatsApp</option><option value="phone">Phone</option><option value="email">Email</option><option value="other">Other</option></select></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email" htmlFor="e-email"><input id="e-email" name="email" type="email" className="input" defaultValue={c.email ?? ""} /></Field>
            <Field label="Phone" htmlFor="e-phone"><input id="e-phone" name="phone" type="tel" className="input" defaultValue={c.phone ?? ""} /></Field>
          </div>
          <Field label="Website" htmlFor="e-web"><input id="e-web" name="website" className="input" defaultValue={c.website ?? ""} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status" htmlFor="e-status"><select id="e-status" name="status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="prospect">Prospect</option><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
            <Field label="Pipeline stage" htmlFor="e-stage"><select id="e-stage" name="pipelineStage" className="select" defaultValue={c.pipelineStage}><option value="inquiry">Inquiry</option><option value="discussion">Discussion</option><option value="proposal_sent">Proposal sent</option><option value="won">Won</option><option value="lost">Lost</option></select></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Estimate (prospects)" htmlFor="e-est" className="col-span-2"><input id="e-est" name="estimate" className="input" inputMode="decimal" defaultValue={c.estimateMinor ? majorInput(c.estimateMinor) : ""} /></Field>
            <Field label="Currency" htmlFor="e-estc"><select id="e-estc" name="estimateCurrency" className="select" defaultValue={c.estimateCurrency ?? "USD"}><option value="USD">US$</option><option value="DOP">RD$</option></select></Field>
          </div>
          <Field label="Follow-up date" htmlFor="e-follow" hint="Shows on Today and the calendar."><input id="e-follow" name="followUpDate" type="date" className="input" defaultValue={c.followUpDate ?? ""} min={undefined} /></Field>
          <Field label="Billing address" htmlFor="e-addr"><textarea id="e-addr" name="billingAddress" className="textarea" rows={2} defaultValue={c.billingAddress ?? ""} /></Field>
          <Field label="Notes" htmlFor="e-notes"><textarea id="e-notes" name="notes" className="textarea" rows={3} defaultValue={c.notes ?? ""} /></Field>
          <ActionMessage state={state} />
          <div className="flex items-center gap-2">
            <SubmitButton>Save</SubmitButton>
            <button type="button" className="btn btn-ghost btn-sm ml-auto" disabled={pending} onClick={() => { if (window.confirm(c.archived ? "Restore this client?" : "Archive this client? History is kept.")) start(async () => { await archiveClientAction(c.id, !c.archived); router.refresh(); setOpen(false); }); }}>{c.archived ? "Restore" : "Archive"}</button>
          </div>
          <p className="muted text-[12px]">Today is {today}.</p>
        </form>
      </Sheet>
      <Sheet open={contactsOpen} onClose={() => setContactsOpen(false)} title="Additional contacts">
        <ul className="mb-4 space-y-2">
          {contacts.map((ct) => (
            <li key={ct.id} className="flex items-center gap-2 rounded-lg border border-rule p-2 text-[14px]">
              <div className="flex-1"><div className="font-medium">{ct.name}{ct.role ? <span className="muted"> · {ct.role}</span> : null}</div><div className="muted text-[12px]">{[ct.email, ct.phone].filter(Boolean).join(" · ")}</div></div>
              {ct.phone && <a href={`tel:${ct.phone}`} className="btn btn-ghost btn-sm">Call</a>}
              {ct.email && <a href={`mailto:${ct.email}`} className="btn btn-ghost btn-sm">Email</a>}
              <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Remove contact" disabled={pending} onClick={() => start(async () => { await removeContactAction(ct.id); router.refresh(); })}><Trash2 className="size-4" /></button>
            </li>
          ))}
          {contacts.length === 0 && <li className="muted text-[13px]">No additional contacts.</li>}
        </ul>
        <form action={cAction} className="space-y-2 border-t border-rule pt-3">
          <input type="hidden" name="clientId" value={c.id} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Name" htmlFor="ct-name"><input id="ct-name" name="name" className="input" required /></Field>
            <Field label="Role" htmlFor="ct-role"><input id="ct-role" name="role" className="input" placeholder="e.g. Accountant" /></Field>
            <Field label="Email" htmlFor="ct-email"><input id="ct-email" name="email" type="email" className="input" /></Field>
            <Field label="Phone" htmlFor="ct-phone"><input id="ct-phone" name="phone" type="tel" className="input" /></Field>
          </div>
          <ActionMessage state={cState} />
          <SubmitButton className="btn btn-secondary btn-sm">Add contact</SubmitButton>
        </form>
      </Sheet>
    </div>
  );
}

export function ActivityForm({ clientId }: { clientId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(addActivityAction, null);
  const resetKey = useResetKey(state);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end" key={resetKey}>
      <input type="hidden" name="clientId" value={clientId} />
      <Field label="Log" htmlFor="act-kind"><select id="act-kind" name="kind" className="select"><option value="note">Note</option><option value="call">Call</option><option value="email">Email</option><option value="meeting">Meeting</option></select></Field>
      <Field label="What happened" htmlFor="act-body" className="flex-1"><input id="act-body" name="body" className="input" placeholder="e.g. Called about the deposit; will pay Friday." required /></Field>
      <SubmitButton className="btn btn-secondary">Log</SubmitButton>
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
    </form>
  );
}
