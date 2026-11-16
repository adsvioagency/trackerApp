"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
import { Field, Notice } from "@/components/ui";
import { ActionMessage, SubmitButton, useAfterSuccess, type ActionState } from "@/components/forms";
import { AccountSelect, CategorySelect, type AccountOption } from "@/components/pickers";
import type { CategoryTree } from "@/lib/money/categories";
import { deleteTransactionAction, updateTransactionAction } from "@/app/(app)/money/actions";
import { majorInput } from "@/lib/money/format";
import { ClientProjectFields, type Ref } from "@/components/quick-add/money-forms";

type Tx = {
  id: string;
  kind: string;
  date: string;
  amountMinor: number;
  currency: string;
  dopEquivalentMinor: number | null;
  categoryId: string | null;
  merchant: string | null;
  note: string | null;
  accountId: string;
  clientId: string | null;
  projectId: string | null;
  workspace: "personal" | "business";
  splits: { id: string; categoryId: string | null; amountMinor: number; note: string | null }[];
};

export function EditTransactionForm({ tx, accounts, tree, clients, projects, receipt }: { tx: Tx; accounts: AccountOption[]; tree: CategoryTree; clients: Ref[]; projects: Ref[]; receipt: { id: string; filename: string; mime: string } | null }) {
  const [state, action] = useActionState<ActionState, FormData>(updateTransactionAction, null);
  const router = useRouter();
  const [pending, start] = useTransition();
  useAfterSuccess(state);
  const isTransferLeg = tx.kind === "transfer_in" || tx.kind === "transfer_out";
  const isDebt = tx.kind === "debt_payment";
  const [splits, setSplits] = useState(tx.splits.map((s, i) => ({ id: i + 1, categoryId: s.categoryId ?? "", amount: majorInput(s.amountMinor), note: s.note ?? "" })));
  const [useSplits, setUseSplits] = useState(tx.splits.length > 0);
  const kinds = tx.kind === "income" || tx.kind === "owner_contribution" ? ["income"] : ["expenses", "bills", "debt", "savings"];
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={tx.id} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" htmlFor="amount">
          <input id="amount" name="amount" className="input" inputMode="decimal" defaultValue={majorInput(tx.amountMinor)} disabled={isDebt} />
        </Field>
        <Field label="Date" htmlFor="date">
          <input id="date" name="date" type="date" className="input" defaultValue={tx.date} />
        </Field>
      </div>
      <Field label="Account" htmlFor="accountId" hint="Only accounts in the same currency.">
        <AccountSelect accounts={accounts} id="accountId" defaultValue={tx.accountId} />
      </Field>
      {tx.currency !== "DOP" && (
        <Field label="DOP equivalent you calculated" htmlFor="dopEquivalent" hint="Reports use this. Leave empty to keep it flagged.">
          <input id="dopEquivalent" name="dopEquivalent" className="input" inputMode="decimal" defaultValue={majorInput(tx.dopEquivalentMinor)} />
        </Field>
      )}
      {!isTransferLeg && !useSplits && (
        <Field label="Category" htmlFor="categoryId">
          <CategorySelect tree={tree} kinds={kinds} id="categoryId" defaultValue={tx.categoryId} />
        </Field>
      )}
      {tx.kind === "expense" && (
        <div className="rounded-xl border border-rule p-3">
          <label className="flex items-center gap-2 text-[14px] font-medium">
            <input type="checkbox" checked={useSplits} onChange={(e) => setUseSplits(e.target.checked)} className="size-4 accent-[var(--mango-deep)]" /> Split across categories
          </label>
          {useSplits ? (
            <div className="mt-3 space-y-2">
              <input type="hidden" name="splits" value={JSON.stringify(splits.filter((s) => s.amount))} />
              {splits.map((l, i) => (
                <div key={l.id} className="grid grid-cols-[1fr_110px_36px] gap-2">
                  <CategorySelect tree={tree} kinds={kinds} name={`sc${i}`} value={l.categoryId} onChange={(e) => setSplits(splits.map((x) => (x.id === l.id ? { ...x, categoryId: e.target.value } : x)))} />
                  <input aria-label={`Split ${i + 1} amount`} className="input" inputMode="decimal" value={l.amount} onChange={(e) => setSplits(splits.map((x) => (x.id === l.id ? { ...x, amount: e.target.value } : x)))} />
                  <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove" onClick={() => setSplits(splits.filter((x) => x.id !== l.id))}><Trash2 className="size-4" /></button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSplits([...splits, { id: Date.now(), categoryId: "", amount: "", note: "" }])}><Plus className="size-4" /> Add line</button>
            </div>
          ) : (
            tx.splits.length > 0 && <input type="hidden" name="clearSplits" value="1" />
          )}
        </div>
      )}
      {!isTransferLeg && (
        <Field label={tx.kind === "income" ? "Source" : "Merchant"} htmlFor="merchant">
          <input id="merchant" name="merchant" className="input" defaultValue={tx.merchant ?? ""} />
        </Field>
      )}
      {tx.workspace === "business" && !isTransferLeg && <ClientProjectFields clients={clients} projects={projects} defaultClientId={tx.clientId} defaultProjectId={tx.projectId} />}
      <Field label="Note" htmlFor="note">
        <input id="note" name="note" className="input" defaultValue={tx.note ?? ""} />
      </Field>
      <Field label="Receipt" htmlFor="receipt">
        {receipt && (
          <div className="mb-2 flex items-center gap-3 text-[13px]">
            <a href={`/api/files/${receipt.id}`} target="_blank" rel="noreferrer" className="font-semibold text-mango-deep underline">{receipt.filename}</a>
            <label className="flex items-center gap-1.5"><input type="checkbox" name="removeReceipt" value="1" className="size-4" /> Remove</label>
          </div>
        )}
        <input id="receipt" name="receipt" type="file" accept="image/*,application/pdf" className="input" />
      </Field>
      {isTransferLeg && <Notice tone="neutral">Transfers never count as income or spending. To change accounts, delete and re-enter the transfer.</Notice>}
      <ActionMessage state={state} />
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton>Save changes</SubmitButton>
        <button
          type="button"
          className="btn btn-danger ml-auto"
          disabled={pending}
          onClick={() => {
            if (!window.confirm("Delete this transaction? Linked bill or payment status will be reset. This cannot be undone.")) return;
            start(async () => {
              await deleteTransactionAction(tx.id);
              router.push("/money/transactions");
            });
          }}
        >
          <Trash2 className="size-4" /> Delete
        </button>
      </div>
    </form>
  );
}
