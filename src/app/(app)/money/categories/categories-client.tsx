"use client";

import { useActionState, useState } from "react";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import type { CategoryTree } from "@/lib/money/categories";
import { Field, Pill } from "@/components/ui";
import { ActionMessage, SubmitButton, useAfterSuccess, type ActionState } from "@/components/forms";
import { categoryAction } from "@/app/(app)/money/actions";

export function CategoriesClient({ tree, workspace }: { tree: CategoryTree; workspace: "personal" | "business" }) {
  const [state, action] = useActionState<ActionState, FormData>(categoryAction, null);
  const [editing, setEditing] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  useAfterSuccess(state, () => setEditing(null));
  return (
    <div className="space-y-4">
      <ActionMessage state={state} />
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="size-4 accent-[var(--mango-deep)]" /> Show archived</label>
      {tree.filter((g) => showArchived || !g.archived).map((g) => (
        <section key={g.id} className="card p-0">
          <header className="flex items-center justify-between gap-2 border-b border-rule bg-surface-2/50 px-4 py-2">
            {editing === `g:${g.id}` ? (
              <form action={action} className="flex flex-1 items-center gap-2">
                <input type="hidden" name="op" value="renameGroup" />
                <input type="hidden" name="id" value={g.id} />
                <input name="name" className="input py-1" defaultValue={g.name} autoFocus aria-label="Group name" />
                <SubmitButton className="btn btn-primary btn-sm">Save</SubmitButton>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
              </form>
            ) : (
              <>
                <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide">{g.name} <Pill>{g.kind}</Pill>{g.archived && <Pill tone="neutral">archived</Pill>}</h2>
                <div className="flex items-center gap-1">
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Rename ${g.name}`} onClick={() => setEditing(`g:${g.id}`)}><Pencil className="size-4" /></button>
                  <form action={action}><input type="hidden" name="op" value="archiveGroup" /><input type="hidden" name="id" value={g.id} /><input type="hidden" name="archived" value={g.archived ? "0" : "1"} /><button type="submit" className="btn btn-ghost btn-icon btn-sm" aria-label={g.archived ? "Restore group" : "Archive group"}>{g.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}</button></form>
                </div>
              </>
            )}
          </header>
          <ul>
            {g.categories.filter((c) => showArchived || !c.archived).map((c) => (
              <li key={c.id} className="flex items-center gap-2 border-b border-rule px-4 py-2 last:border-b-0">
                {editing === `c:${c.id}` ? (
                  <form action={action} className="flex flex-1 items-center gap-2">
                    <input type="hidden" name="op" value="rename" />
                    <input type="hidden" name="id" value={c.id} />
                    <input name="name" className="input py-1" defaultValue={c.name} autoFocus aria-label="Category name" />
                    <SubmitButton className="btn btn-primary btn-sm">Save</SubmitButton>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                  </form>
                ) : (
                  <>
                    <span className={`flex-1 text-[14px] ${c.parentId ? "pl-4" : ""} ${c.archived ? "text-ink-muted line-through" : ""}`}>{c.name}</span>
                    <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Rename ${c.name}`} onClick={() => setEditing(`c:${c.id}`)}><Pencil className="size-4" /></button>
                    <form action={action}><input type="hidden" name="op" value="archive" /><input type="hidden" name="id" value={c.id} /><input type="hidden" name="archived" value={c.archived ? "0" : "1"} /><button type="submit" className="btn btn-ghost btn-icon btn-sm" aria-label={c.archived ? "Restore" : "Archive"}>{c.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}</button></form>
                  </>
                )}
              </li>
            ))}
            <li className="px-4 py-2">
              <form action={action} className="flex items-end gap-2">
                <input type="hidden" name="op" value="create" />
                <input type="hidden" name="groupId" value={g.id} />
                <Field label="New category" htmlFor={`new-${g.id}`} className="flex-1"><input id={`new-${g.id}`} name="name" className="input py-1" placeholder="Name" required /></Field>
                <Field label="Under (subcategory of)" htmlFor={`par-${g.id}`}><select id={`par-${g.id}`} name="parentId" className="select py-1"><option value="">—</option>{g.categories.filter((c) => !c.parentId && !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
                <SubmitButton className="btn btn-secondary btn-sm"><Plus className="size-4" /> Add</SubmitButton>
              </form>
            </li>
          </ul>
        </section>
      ))}
      <form action={action} className="card flex flex-wrap items-end gap-2 p-4">
        <input type="hidden" name="op" value="createGroup" />
        <input type="hidden" name="workspace" value={workspace} />
        <Field label="New group" htmlFor="ng-name" className="flex-1"><input id="ng-name" name="name" className="input" placeholder="e.g. Kids" required /></Field>
        <Field label="Kind" htmlFor="ng-kind"><select id="ng-kind" name="kind" className="select"><option value="expenses">Expenses</option><option value="bills">Bills</option><option value="income">Income</option><option value="savings">Savings</option><option value="debt">Debt</option></select></Field>
        <SubmitButton className="btn btn-primary">Add group</SubmitButton>
      </form>
    </div>
  );
}
