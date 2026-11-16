"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Field, Money, Pill, WorkspaceBadge, EmptyState, Notice } from "@/components/ui";
import { Sheet, SubmitButton, ActionMessage, useAfterSuccess, type ActionState } from "@/components/forms";
import { accountAction, archiveAccountAction } from "@/app/(app)/money/actions";
import { ACCOUNT_TYPE_LABEL, type AccountType } from "@/lib/money/account-types";
import { fmtDate } from "@/lib/dates";
import { fmtMoney, majorInput } from "@/lib/money/format";

type Acc = { id: string; name: string; type: AccountType; currency: string; workspace: "personal" | "business"; balanceMinor: number; owedMinor: number; isSpending: boolean; archived: boolean; openingBalanceMinor: number; openingDate: string; manualDopValuationMinor: number | null; manualDopValuationDate: string | null; creditLimitMinor: number | null; lastActivity: string | null; txCount: number };

export function AccountsClient(p: { today: string; workspace: "personal" | "business"; showWs: boolean; accounts: Acc[] }) {
  const [sheet, setSheet] = useState<Acc | "new" | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const active = p.accounts.filter((a) => !a.archived);
  const archived = p.accounts.filter((a) => a.archived);
  const spendingDop = active.filter((a) => a.isSpending).reduce((s, a) => s + (a.currency === "DOP" ? a.balanceMinor : a.manualDopValuationMinor ?? 0), 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[14px]"><span className="muted">Recorded spending cash (DOP-valued):</span> <span className="font-display text-[18px] font-extrabold tnum">{fmtMoney(spendingDop)}</span></div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setSheet("new")}>Add account</button>
      </div>
      {active.length === 0 ? (
        <div className="card p-4"><EmptyState title="No accounts yet" body="Add your checking, cash, savings and cards." action={<button type="button" className="btn btn-primary btn-sm" onClick={() => setSheet("new")}>Add account</button>} /></div>
      ) : (
        <div className="card p-0">
          <ul>
            {active.map((a) => (
              <li key={a.id} className="flex items-center gap-3 border-b border-rule px-4 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><Link href={`/money/transactions?account=${a.id}&all=1`} className="font-semibold hover:underline">{a.name}</Link>{p.showWs && <WorkspaceBadge workspace={a.workspace} />}<Pill>{ACCOUNT_TYPE_LABEL[a.type]}</Pill>{a.isSpending && <Pill tone="teal">Spending cash</Pill>}</div>
                  <div className="muted text-[12px]">{a.txCount} entries{a.lastActivity ? ` · last ${fmtDate(a.lastActivity)}` : ""} · opened {fmtDate(a.openingDate)} with {fmtMoney(Math.abs(a.openingBalanceMinor), a.currency)}{a.currency !== "DOP" ? (a.manualDopValuationMinor != null ? ` · manual DOP valuation ${fmtMoney(a.manualDopValuationMinor)} (${a.manualDopValuationDate})` : " · no DOP valuation") : ""}</div>
                </div>
                <div className="text-right">
                  {a.owedMinor > 0 || a.type === "credit_card" || a.type === "loan" ? <div className="font-semibold text-danger tnum">{fmtMoney(a.owedMinor, a.currency)} owed</div> : <Money minor={a.balanceMinor} currency={a.currency} className="font-semibold" />}
                  {a.creditLimitMinor ? <div className="muted text-[11px]">limit {fmtMoney(a.creditLimitMinor, a.currency)}</div> : null}
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSheet(a)}>Edit</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {archived.length > 0 && (
        <details className="card p-4">
          <summary className="cursor-pointer text-[14px] font-semibold">Archived ({archived.length})</summary>
          <ul className="mt-2 space-y-1 text-[14px]">
            {archived.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2"><span>{a.name} · {fmtMoney(a.balanceMinor, a.currency)}</span><button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { await archiveAccountAction(a.id, false); router.refresh(); })}>Restore</button></li>
            ))}
          </ul>
        </details>
      )}
      <AccountSheet key={sheet === "new" ? "new" : sheet?.id ?? "none"} acc={sheet} onClose={() => setSheet(null)} workspace={p.workspace} today={p.today} />
    </div>
  );
}

function AccountSheet({ acc, onClose, workspace, today }: { acc: Acc | "new" | null; onClose: () => void; workspace: "personal" | "business"; today: string }) {
  const [state, action] = useActionState<ActionState, FormData>(accountAction, null);
  useAfterSuccess(state, onClose);
  const [pending, start] = useTransition();
  const router = useRouter();
  const a = acc === "new" ? null : acc;
  const [type, setType] = useState<string>(a?.type ?? "checking");
  const [currency, setCurrency] = useState(a?.currency ?? "DOP");
  const liability = type === "credit_card" || type === "loan";
  return (
    <Sheet open={!!acc} onClose={onClose} title={a ? `Edit ${a.name}` : "Add account"}>
      <form action={action} className="space-y-3" key={a?.id ?? "new"}>
        {a && <input type="hidden" name="id" value={a.id} />}
        <Field label="Name" htmlFor="a-name"><input id="a-name" name="name" className="input" required defaultValue={a?.name ?? ""} placeholder="e.g. Banreservas checking" /></Field>
        {!a && (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Workspace" htmlFor="a-ws"><select id="a-ws" name="workspace" className="select" defaultValue={workspace}><option value="personal">Personal</option><option value="business">Business</option></select></Field>
            <Field label="Type" htmlFor="a-type"><select id="a-type" name="type" className="select" value={type} onChange={(e) => setType(e.target.value)}>{(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>)}</select></Field>
            <Field label="Currency" htmlFor="a-cur"><select id="a-cur" name="currency" className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}><option value="DOP">RD$</option><option value="USD">US$</option></select></Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={liability ? "Amount owed at opening" : "Opening balance"} htmlFor="a-open"><input id="a-open" name="opening" className="input" inputMode="decimal" defaultValue={a ? majorInput(Math.abs(a.openingBalanceMinor)) : ""} placeholder="0.00" /></Field>
          {!a && <Field label="As of" htmlFor="a-odate"><input id="a-odate" name="openingDate" type="date" className="input" defaultValue={today} /></Field>}
          {liability && <Field label="Credit limit (optional)" htmlFor="a-limit"><input id="a-limit" name="creditLimit" className="input" inputMode="decimal" defaultValue={a?.creditLimitMinor ? majorInput(a.creditLimitMinor) : ""} /></Field>}
        </div>
        {!liability && (
          <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="isSpending" defaultChecked={a ? a.isSpending : type !== "savings"} className="size-4 accent-[var(--mango-deep)]" /> Counts as spending cash (used for “available after commitments”)</label>
        )}
        {(a?.currency ?? currency) !== "DOP" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Manual DOP valuation (optional)" htmlFor="a-dop" hint="Whole-account value in pesos for DOP totals. No live FX."><input id="a-dop" name="manualDop" className="input" inputMode="decimal" defaultValue={a?.manualDopValuationMinor ? majorInput(a.manualDopValuationMinor) : ""} /></Field>
            <Field label="Valued on" htmlFor="a-dopd"><input id="a-dopd" name="manualDopDate" type="date" className="input" defaultValue={a?.manualDopValuationDate ?? today} /></Field>
          </div>
        )}
        <ActionMessage state={state} />
        <div className="flex items-center gap-2">
          <SubmitButton>{a ? "Save account" : "Add account"}</SubmitButton>
          {a && <button type="button" className="btn btn-ghost btn-sm ml-auto" disabled={pending} onClick={() => { if (window.confirm("Archive this account? Its history stays and it is hidden from pickers.")) start(async () => { await archiveAccountAction(a.id, true); router.refresh(); onClose(); }); }}>Archive</button>}
        </div>
        {a && a.txCount > 0 && <Notice tone="neutral">Changing the opening balance shifts the current balance by the same amount; transactions are untouched.</Notice>}
      </form>
    </Sheet>
  );
}
