"use client";

import { useActionState, useState } from "react";
import { Field } from "@/components/ui";
import { ActionMessage, SubmitButton, type ActionState } from "@/components/forms";
import { createDocumentAction } from "../actions";

export function NewDocumentForm({ clients, projects, defaults }: { clients: { id: string; name: string }[]; projects: { id: string; name: string; clientId: string; currency: string }[]; defaults: { type: "proposal" | "invoice"; clientId?: string; projectId?: string } }) {
  const [state, action] = useActionState<ActionState, FormData>(createDocumentAction, null);
  const [clientId, setClientId] = useState(defaults.clientId ?? clients[0]?.id ?? "");
  const [type, setType] = useState(defaults.type);
  const list = projects.filter((p) => p.clientId === clientId);
  return (
    <form action={action} className="card space-y-4 p-5">
      <div role="radiogroup" aria-label="Document type" className="grid grid-cols-2 gap-2">
        {(["proposal", "invoice"] as const).map((t) => (
          <label key={t} className={`cursor-pointer rounded-xl border p-3 ${type === t ? "border-mango bg-mango-wash/40" : "border-rule"}`}>
            <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />
            <div className="font-semibold capitalize">{t}</div>
            <div className="muted text-[12px]">{t === "proposal" ? "Describes the offer: scope, prices, discounts, payment schedule, approval." : "Requests a specific amount with a due date and payment instructions."}</div>
          </label>
        ))}
      </div>
      <Field label="Client" htmlFor="n-client"><select id="n-client" name="clientId" className="select" value={clientId} onChange={(e) => setClientId(e.target.value)}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Project (optional)" htmlFor="n-project"><select id="n-project" name="projectId" className="select" defaultValue={defaults.projectId ?? ""}><option value="">None</option>{list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Title" htmlFor="n-title" className="col-span-2"><input id="n-title" name="title" className="input" placeholder={type === "proposal" ? "e.g. Shopify website & event invitation" : "e.g. Deposit for website project"} /></Field>
        <Field label="Currency" htmlFor="n-cur"><select id="n-cur" name="currency" className="select" defaultValue={list.find((p) => p.id === defaults.projectId)?.currency ?? "USD"}><option value="USD">US$</option><option value="DOP">RD$</option></select></Field>
      </div>
      <ActionMessage state={state} />
      <SubmitButton>Create draft</SubmitButton>
    </form>
  );
}
