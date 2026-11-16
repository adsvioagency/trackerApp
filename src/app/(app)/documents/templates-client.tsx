"use client";

import { useActionState, useState } from "react";
import { Field, EmptyState } from "@/components/ui";
import { ActionMessage, SubmitButton, useAfterSuccess, type ActionState } from "@/components/forms";
import { serviceTemplateAction } from "./actions";
import { fmtMoney, majorInput } from "@/lib/money/format";

type T = { id: string; name: string; description: string | null; unitPriceMinor: number; currency: string; unit: string };

export function TemplatesClient({ templates }: { templates: T[] }) {
  const [state, action] = useActionState<ActionState, FormData>(serviceTemplateAction, null);
  const [editing, setEditing] = useState<T | null>(null);
  useAfterSuccess(state, () => setEditing(null));
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="card p-0">
        {templates.length === 0 ? <div className="p-4"><EmptyState title="No service templates yet" body="Save your usual scope lines with standard prices so proposals take a minute." /></div> : (
          <ul>
            {templates.map((t) => (
              <li key={t.id} className="flex items-center gap-3 border-b border-rule px-4 py-2.5 last:border-b-0">
                <div className="min-w-0 flex-1"><div className="font-medium">{t.name}</div>{t.description && <div className="muted truncate text-[12px]">{t.description}</div>}</div>
                <span className="tnum font-semibold">{fmtMoney(t.unitPriceMinor, t.currency)} <span className="muted text-[12px]">/ {t.unit}</span></span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(t)}>Edit</button>
                <form action={action}><input type="hidden" name="op" value="archive" /><input type="hidden" name="id" value={t.id} /><button type="submit" className="btn btn-ghost btn-sm">Archive</button></form>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form action={action} key={editing?.id ?? "new"} className="card space-y-3 p-4">
        <h2 className="text-[14px] font-bold">{editing ? `Edit ${editing.name}` : "New service template"}</h2>
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <Field label="Name" htmlFor="t-name"><input id="t-name" name="name" className="input" required defaultValue={editing?.name ?? ""} placeholder="e.g. Shopify website design & build" /></Field>
        <Field label="Description" htmlFor="t-desc"><textarea id="t-desc" name="description" className="textarea" rows={2} defaultValue={editing?.description ?? ""} /></Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Standard price" htmlFor="t-price" className="col-span-2"><input id="t-price" name="price" className="input" inputMode="decimal" required defaultValue={editing ? majorInput(editing.unitPriceMinor) : ""} /></Field>
          <Field label="Currency" htmlFor="t-cur"><select id="t-cur" name="currency" className="select" defaultValue={editing?.currency ?? "USD"}><option value="USD">US$</option><option value="DOP">RD$</option></select></Field>
        </div>
        <Field label="Unit" htmlFor="t-unit"><input id="t-unit" name="unit" className="input" defaultValue={editing?.unit ?? "project"} placeholder="project, hour, month" /></Field>
        <ActionMessage state={state} />
        <div className="flex gap-2"><SubmitButton>{editing ? "Save" : "Add template"}</SubmitButton>{editing && <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>}</div>
      </form>
    </div>
  );
}
