"use client";

import { useActionState, useState } from "react";
import { Field, Money, Pill, WorkspaceBadge, EmptyState, ProgressBar, Notice, SectionTitle } from "@/components/ui";
import { Sheet, SubmitButton, ActionMessage, useAfterSuccess, type ActionState } from "@/components/forms";
import { AccountSelect, type AccountOption } from "@/components/pickers";
import { debtAction, debtPaymentAction, goalAction, goalContributionAction } from "@/app/(app)/money/actions";
import { fmtDate } from "@/lib/dates";
import { fmtMoney, majorInput } from "@/lib/money/format";

type Goal = { id: string; name: string; workspace: "personal" | "business"; targetMinor: number; currency: string; accountId: string | null; accountName: string | null; startingMinor: number; targetDate: string | null; notes: string | null; archived: boolean; savedMinor: number; pct: number; contributions: number };
type Debt = { id: string; name: string; workspace: "personal" | "business"; kind: string; accountId: string; accountName: string; currency: string; owedMinor: number; aprBasisPoints: number | null; minimumPaymentMinor: number | null; dueDay: number | null; notes: string | null; archived: boolean; principalPaidMinor: number; interestPaidMinor: number; paymentsCount: number };

export function GoalsClient(p: { today: string; workspace: "personal" | "business"; showWs: boolean; goals: Goal[]; debts: Debt[]; accounts: AccountOption[] }) {
  const [goalSheet, setGoalSheet] = useState<Goal | "new" | null>(null);
  const [debtSheet, setDebtSheet] = useState<Debt | "new" | null>(null);
  const [contrib, setContrib] = useState<Goal | null>(null);
  const [payDebt, setPayDebt] = useState<Debt | null>(null);
  const idem = () => (typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now()));
  return (
    <div className="space-y-6">
      <section>
        <SectionTitle action={<button type="button" className="btn btn-primary btn-sm" onClick={() => setGoalSheet("new")}>Add goal</button>}>Savings goals</SectionTitle>
        {p.goals.filter((g) => !g.archived).length === 0 ? (
          <div className="card p-4"><EmptyState title="No savings goals" body="Create a goal and fund it with transfers into a savings account." /></div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {p.goals.filter((g) => !g.archived).map((g) => (
              <div key={g.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 font-semibold">{g.name}{p.showWs && <WorkspaceBadge workspace={g.workspace} />}</div>
                    <div className="muted text-[12px]">{g.accountName ? `In ${g.accountName}` : "No linked account"}{g.targetDate ? ` · by ${fmtDate(g.targetDate)}` : ""} · {g.contributions} contribution(s)</div>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setGoalSheet(g)}>Edit</button>
                </div>
                <div className="mt-3 flex items-baseline justify-between"><span className="font-display text-[22px] font-extrabold"><Money minor={g.savedMinor} currency={g.currency} /></span><span className="muted text-[13px]">of {fmtMoney(g.targetMinor, g.currency)} · {g.pct}%</span></div>
                <ProgressBar value={g.savedMinor} max={g.targetMinor} tone="ok" label={`${g.name} progress`} />
                <div className="mt-3"><button type="button" className="btn btn-secondary btn-sm" onClick={() => setContrib(g)}>Add contribution</button></div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle action={<button type="button" className="btn btn-primary btn-sm" onClick={() => setDebtSheet("new")}>Add debt</button>}>Debts</SectionTitle>
        {p.debts.filter((d) => !d.archived).length === 0 ? (
          <div className="card p-4"><EmptyState title="No debts tracked" body="Credit cards and loans live here with their own liability account." /></div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {p.debts.filter((d) => !d.archived).map((d) => (
              <div key={d.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 font-semibold">{d.name}{p.showWs && <WorkspaceBadge workspace={d.workspace} />}<Pill>{d.kind.replace("_", " ")}</Pill></div>
                    <div className="muted text-[12px]">{d.accountName}{d.aprBasisPoints ? ` · ${(d.aprBasisPoints / 100).toFixed(2)}% APR` : ""}{d.dueDay ? ` · due day ${d.dueDay}` : ""}</div>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDebtSheet(d)}>Edit</button>
                </div>
                <div className="mt-3 font-display text-[22px] font-extrabold text-danger"><Money minor={d.owedMinor} currency={d.currency} /> <span className="text-[13px] font-medium text-ink-soft">owed</span></div>
                <div className="muted text-[12px]">Paid so far: principal {fmtMoney(d.principalPaidMinor, d.currency)} · interest &amp; fees {fmtMoney(d.interestPaidMinor, d.currency)} · {d.paymentsCount} payment(s){d.minimumPaymentMinor ? ` · minimum ${fmtMoney(d.minimumPaymentMinor, d.currency)}` : ""}</div>
                <div className="mt-3 flex gap-2">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPayDebt(d)}>{d.kind === "credit_card" ? "Record payment (principal + interest)" : "Record payment"}</button>
                  {d.kind === "credit_card" && <a href={`/add/transfer?ws=${d.workspace}&back=/money/goals`} className="btn btn-ghost btn-sm">Pay card by transfer</a>}
                </div>
              </div>
            ))}
          </div>
        )}
        <Notice tone="neutral" className="mt-3">Credit card purchases are spending when they happen. Paying the card is a transfer that lowers cash and the balance owed, without counting the purchases again. Use “Record payment” when part of the payment is interest or fees.</Notice>
      </section>

      <GoalSheet key={"goalsheet-" + (goalSheet === "new" ? "new" : goalSheet?.id ?? "none")} goal={goalSheet} onClose={() => setGoalSheet(null)} accounts={p.accounts} workspace={p.workspace} />
      <DebtSheet key={"debtsheet-" + (debtSheet === "new" ? "new" : debtSheet?.id ?? "none")} debt={debtSheet} onClose={() => setDebtSheet(null)} accounts={p.accounts} workspace={p.workspace} today={p.today} />
      <ContributionSheet goal={contrib} onClose={() => setContrib(null)} accounts={p.accounts} today={p.today} idem={idem} />
      <DebtPaymentSheet debt={payDebt} onClose={() => setPayDebt(null)} accounts={p.accounts} today={p.today} idem={idem} />
    </div>
  );
}

function GoalSheet({ goal, onClose, accounts, workspace }: { goal: Goal | "new" | null; onClose: () => void; accounts: AccountOption[]; workspace: "personal" | "business" }) {
  const [state, action] = useActionState<ActionState, FormData>(goalAction, null);
  useAfterSuccess(state, onClose);
  const g = goal === "new" ? null : goal;
  const ws = g?.workspace ?? workspace;
  return (
    <Sheet open={!!goal} onClose={onClose} title={g ? `Edit ${g.name}` : "Add savings goal"}>
      <form action={action} className="space-y-3" key={g?.id ?? "new"}>
        {g && <input type="hidden" name="id" value={g.id} />}
        <input type="hidden" name="workspace" value={ws} />
        <Field label="Name" htmlFor="g-name"><input id="g-name" name="name" className="input" required defaultValue={g?.name ?? ""} placeholder="e.g. Emergency fund" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Target" htmlFor="g-target" className="col-span-2"><input id="g-target" name="target" className="input" inputMode="decimal" required defaultValue={g ? majorInput(g.targetMinor) : ""} /></Field>
          <Field label="Currency" htmlFor="g-cur"><select id="g-cur" name="currency" className="select" defaultValue={g?.currency ?? "DOP"} disabled={!!g}><option value="DOP">RD$</option><option value="USD">US$</option></select></Field>
        </div>
        <Field label="Where the money sits" htmlFor="g-acc" hint="If this is a spending account, the saved amount is treated as reserved."><AccountSelect accounts={accounts.filter((a) => a.workspace === ws && a.type !== "credit_card" && a.type !== "loan")} id="g-acc" defaultValue={g?.accountId} allowEmpty required={false} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Already saved (starting amount)" htmlFor="g-start"><input id="g-start" name="starting" className="input" inputMode="decimal" defaultValue={g ? majorInput(g.startingMinor) : ""} /></Field>
          <Field label="Target date" htmlFor="g-date"><input id="g-date" name="targetDate" type="date" className="input" defaultValue={g?.targetDate ?? ""} /></Field>
        </div>
        <Field label="Notes" htmlFor="g-notes"><input id="g-notes" name="notes" className="input" defaultValue={g?.notes ?? ""} /></Field>
        {g && <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="archived" defaultChecked={g.archived} className="size-4 accent-[var(--mango-deep)]" /> Archive (keeps history)</label>}
        <ActionMessage state={state} />
        <SubmitButton>{g ? "Save goal" : "Add goal"}</SubmitButton>
      </form>
    </Sheet>
  );
}

function DebtSheet({ debt, onClose, accounts, workspace, today }: { debt: Debt | "new" | null; onClose: () => void; accounts: AccountOption[]; workspace: "personal" | "business"; today: string }) {
  const [state, action] = useActionState<ActionState, FormData>(debtAction, null);
  useAfterSuccess(state, onClose);
  const d = debt === "new" ? null : debt;
  const ws = d?.workspace ?? workspace;
  const liabilities = accounts.filter((a) => a.workspace === ws && (a.type === "credit_card" || a.type === "loan"));
  return (
    <Sheet open={!!debt} onClose={onClose} title={d ? `Edit ${d.name}` : "Add debt"}>
      <form action={action} className="space-y-3" key={d?.id ?? "new"}>
        {d && <input type="hidden" name="id" value={d.id} />}
        <input type="hidden" name="workspace" value={ws} />
        <Field label="Name" htmlFor="d-name"><input id="d-name" name="name" className="input" required defaultValue={d?.name ?? ""} placeholder="e.g. Car loan" /></Field>
        {!d && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type" htmlFor="d-kind"><select id="d-kind" name="kind" className="select" defaultValue="loan"><option value="loan">Loan</option><option value="credit_card">Credit card</option><option value="other">Other</option></select></Field>
              <Field label="Currency" htmlFor="d-cur"><select id="d-cur" name="currency" className="select" defaultValue="DOP"><option value="DOP">RD$</option><option value="USD">US$</option></select></Field>
            </div>
            <Field label="Use an existing liability account (optional)" htmlFor="d-acc" hint="Leave empty to create one named after the debt."><AccountSelect accounts={liabilities} id="d-acc" allowEmpty required={false} defaultValue="" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount owed today" htmlFor="d-owed"><input id="d-owed" name="owed" className="input" inputMode="decimal" /></Field>
              <Field label="As of" htmlFor="d-date"><input id="d-date" name="openingDate" type="date" className="input" defaultValue={today} /></Field>
            </div>
          </>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Field label="APR %" htmlFor="d-apr"><input id="d-apr" name="apr" className="input" inputMode="decimal" defaultValue={d?.aprBasisPoints ? (d.aprBasisPoints / 100).toString() : ""} /></Field>
          <Field label="Minimum payment" htmlFor="d-min"><input id="d-min" name="minimum" className="input" inputMode="decimal" defaultValue={d?.minimumPaymentMinor ? majorInput(d.minimumPaymentMinor) : ""} /></Field>
          <Field label="Due day" htmlFor="d-day"><input id="d-day" name="dueDay" type="number" min={1} max={31} className="input" defaultValue={d?.dueDay ?? ""} /></Field>
        </div>
        <Field label="Notes" htmlFor="d-notes"><input id="d-notes" name="notes" className="input" defaultValue={d?.notes ?? ""} /></Field>
        {d && <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="archived" defaultChecked={d.archived} className="size-4 accent-[var(--mango-deep)]" /> Archive</label>}
        <ActionMessage state={state} />
        <SubmitButton>{d ? "Save debt" : "Add debt"}</SubmitButton>
      </form>
    </Sheet>
  );
}

function ContributionSheet({ goal, onClose, accounts, today, idem }: { goal: Goal | null; onClose: () => void; accounts: AccountOption[]; today: string; idem: () => string }) {
  const [state, action] = useActionState<ActionState, FormData>(goalContributionAction, null);
  useAfterSuccess(state, onClose);
  const from = accounts.filter((a) => a.workspace === goal?.workspace && a.type !== "credit_card" && a.type !== "loan" && a.id !== goal?.accountId);
  return (
    <Sheet open={!!goal} onClose={onClose} title={goal ? `Contribute to ${goal.name}` : ""}>
      {goal && (
        <form action={action} className="space-y-3" key={goal.id}>
          <input type="hidden" name="goalId" value={goal.id} />
          <input type="hidden" name="idempotencyKey" value={idem()} />
          {!goal.accountId && <Notice tone="warn">Link the goal to an account first (Edit) so the transfer has a destination.</Notice>}
          <input type="hidden" name="toAccountId" value={goal.accountId ?? ""} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" htmlFor="c-amount"><input id="c-amount" name="amount" className="input" inputMode="decimal" required /></Field>
            <Field label="Date" htmlFor="c-date"><input id="c-date" name="date" type="date" className="input" defaultValue={today} /></Field>
          </div>
          <Field label="From account" htmlFor="c-from"><AccountSelect accounts={from} id="c-from" name="fromAccountId" /></Field>
          <Field label="Note" htmlFor="c-note"><input id="c-note" name="note" className="input" defaultValue="Savings contribution" /></Field>
          <ActionMessage state={state} />
          <SubmitButton disabled={!goal.accountId}>Record transfer</SubmitButton>
        </form>
      )}
    </Sheet>
  );
}

function DebtPaymentSheet({ debt, onClose, accounts, today, idem }: { debt: Debt | null; onClose: () => void; accounts: AccountOption[]; today: string; idem: () => string }) {
  const [state, action] = useActionState<ActionState, FormData>(debtPaymentAction, null);
  useAfterSuccess(state, onClose);
  const from = accounts.filter((a) => a.type !== "credit_card" && a.type !== "loan");
  return (
    <Sheet open={!!debt} onClose={onClose} title={debt ? `Payment toward ${debt.name}` : ""}>
      {debt && (
        <form action={action} className="space-y-3" key={debt.id}>
          <input type="hidden" name="debtId" value={debt.id} />
          <input type="hidden" name="idempotencyKey" value={idem()} />
          <div className="grid grid-cols-3 gap-3">
            <Field label="Principal" htmlFor="dp-p"><input id="dp-p" name="principal" className="input" inputMode="decimal" required /></Field>
            <Field label="Interest" htmlFor="dp-i"><input id="dp-i" name="interest" className="input" inputMode="decimal" defaultValue="0" /></Field>
            <Field label="Fees" htmlFor="dp-f"><input id="dp-f" name="fees" className="input" inputMode="decimal" defaultValue="0" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Paid from" htmlFor="dp-from"><AccountSelect accounts={from} id="dp-from" name="fromAccountId" /></Field>
            <Field label="Date" htmlFor="dp-date"><input id="dp-date" name="date" type="date" className="input" defaultValue={today} /></Field>
          </div>
          <Field label="Note" htmlFor="dp-note"><input id="dp-note" name="note" className="input" /></Field>
          <Notice tone="neutral">Cash drops by the total. The balance owed drops by the principal. Interest and fees count as spending in “Interest &amp; fees”.</Notice>
          <ActionMessage state={state} />
          <SubmitButton>Record payment</SubmitButton>
        </form>
      )}
    </Sheet>
  );
}
