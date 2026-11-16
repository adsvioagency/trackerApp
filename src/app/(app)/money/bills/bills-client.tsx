"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, Money, Pill, WorkspaceBadge, EmptyState, cx, Notice } from "@/components/ui";
import { Sheet, SubmitButton, ActionMessage, useAfterSuccess, type ActionState } from "@/components/forms";
import { AccountSelect, CategorySelect, type AccountOption } from "@/components/pickers";
import type { CategoryTree } from "@/lib/money/categories";
import { billAction, payBillAction, receivePaydayAction, rescheduleOccurrenceAction, scheduleAction, skipBillAction } from "@/app/(app)/money/actions";
import { fmtDate, relativeDay } from "@/lib/dates";
import { majorInput } from "@/lib/money/format";

type Bill = { id: string; name: string; workspace: "personal" | "business"; amountMinor: number; currency: string; categoryId: string | null; accountId: string | null; frequency: string; interval: number; anchorDate: string; endDate: string | null; isSubscription: boolean; autopay: boolean; notes: string | null; active: boolean };
type Schedule = { id: string; name: string; workspace: "personal" | "business"; amountMinor: number; currency: string; accountId: string | null; categoryId: string | null; frequency: string; daysOfMonth: number[] | null; anchorDate: string; active: boolean };
type Occ = { id: string; billId: string; name: string; workspace: "personal" | "business"; dueDate: string; clamped: boolean; amountMinor: number; currency: string; status: "unpaid" | "paid" | "skipped"; accountId: string | null; isSubscription: boolean; paidTransactionId: string | null };
type Payday = { id: string; name: string; workspace: "personal" | "business"; date: string; clamped: boolean; amountMinor: number; currency: string; status: "expected" | "received" | "skipped"; accountId: string | null };

export function BillsClient(p: { today: string; workspace: "personal" | "business"; showWs: boolean; bills: Bill[]; schedules: Schedule[]; occurrences: Occ[]; paydays: Payday[]; accounts: AccountOption[]; tree: CategoryTree; focusOccurrenceId: string | null; focusPaydayId: string | null }) {
  const [tab, setTab] = useState<"upcoming" | "bills" | "paydays">("upcoming");
  const [payOcc, setPayOcc] = useState<Occ | null>(p.occurrences.find((o) => o.id === p.focusOccurrenceId) ?? null);
  const [recvPayday, setRecvPayday] = useState<Payday | null>(p.paydays.find((x) => x.id === p.focusPaydayId) ?? null);
  const [editBill, setEditBill] = useState<Bill | null | "new">(null);
  const [editSched, setEditSched] = useState<Schedule | null | "new">(null);
  const [moveOcc, setMoveOcc] = useState<Occ | null>(null);
  const router = useRouter();
  const [pending, start] = useTransition();

  const upcoming = [...p.occurrences.filter((o) => o.status !== "skipped" && (o.status === "unpaid" || o.dueDate >= p.today)).map((o) => ({ kind: "bill" as const, date: o.dueDate, o })), ...p.paydays.filter((x) => x.status !== "skipped" && x.date >= p.today).map((x) => ({ kind: "payday" as const, date: x.date, x }))].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" className="inline-flex rounded-[10px] border border-rule bg-surface p-0.5">
          {(["upcoming", "bills", "paydays"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} className={cx("rounded-lg px-3 py-1.5 text-[13px] font-medium capitalize", tab === t ? "bg-ink text-paper" : "text-ink-soft hover:bg-surface-2")}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditSched("new")}>Add payday</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditBill("new")}>Add bill</button>
        </div>
      </div>

      {tab === "upcoming" && (
        <div className="card p-0">
          {upcoming.length === 0 ? (
            <div className="p-4"><EmptyState title="Nothing due or expected" body="Add a bill or payday to see it here and on Today." /></div>
          ) : (
            <ul>
              {upcoming.map((u) => (
                <li key={u.kind === "bill" ? u.o.id : u.x.id} className="flex items-center gap-3 border-b border-rule px-4 py-2.5 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium">{u.kind === "bill" ? u.o.name : u.x.name}</span>
                      {p.showWs && <WorkspaceBadge workspace={u.kind === "bill" ? u.o.workspace : u.x.workspace} />}
                      {u.kind === "payday" ? <Pill tone="ok">Payday</Pill> : u.o.isSubscription ? <Pill>Subscription</Pill> : <Pill tone="mango">Bill</Pill>}
                      {u.kind === "bill" && u.o.status === "unpaid" && u.o.dueDate < p.today && <Pill tone="danger">Overdue</Pill>}
                      {u.kind === "bill" && u.o.status === "paid" && <Pill tone="ok">Paid</Pill>}
                      {(u.kind === "bill" ? u.o.clamped : u.x.clamped) && <Pill tone="warn" className="font-normal">Moved to month end</Pill>}
                    </div>
                    <div className="muted text-[12px]">{fmtDate(u.date, "weekday")} · {relativeDay(u.date, p.today)}</div>
                  </div>
                  <Money minor={u.kind === "bill" ? u.o.amountMinor : u.x.amountMinor} currency={u.kind === "bill" ? u.o.currency : u.x.currency} className="font-semibold" />
                  {u.kind === "bill" ? (
                    u.o.status === "unpaid" ? (
                      <div className="flex gap-1">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPayOcc(u.o)}>Mark paid</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMoveOcc(u.o)}>Move</button>
                        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { await skipBillAction(u.o.id, true); router.refresh(); })}>Skip</button>
                      </div>
                    ) : (
                      <a href={`/money/transactions/${u.o.paidTransactionId}`} className="btn btn-ghost btn-sm">View</a>
                    )
                  ) : u.x.status === "expected" ? (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRecvPayday(u.x)}>Received</button>
                  ) : (
                    <Pill tone="ok">Received</Pill>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "bills" && (
        <div className="card p-0">
          {p.bills.length === 0 ? <div className="p-4"><EmptyState title="No bills yet" action={<button type="button" className="btn btn-primary btn-sm" onClick={() => setEditBill("new")}>Add bill</button>} /></div> : (
            <ul>
              {p.bills.map((b) => (
                <li key={b.id} className="flex items-center gap-3 border-b border-rule px-4 py-2.5 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{b.name}</span>{p.showWs && <WorkspaceBadge workspace={b.workspace} />}{b.isSubscription && <Pill>Subscription</Pill>}{!b.active && <Pill tone="neutral">Inactive</Pill>}{b.autopay && <Pill tone="teal">Autopay</Pill>}</div>
                    <div className="muted text-[12px]">{b.frequency}{b.interval > 1 ? ` ×${b.interval}` : ""} · anchored {fmtDate(b.anchorDate)}{b.endDate ? ` · ends ${fmtDate(b.endDate)}` : ""}</div>
                  </div>
                  <Money minor={b.amountMinor} currency={b.currency} className="font-semibold" />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditBill(b)}>Edit</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "paydays" && (
        <div className="space-y-4">
          <div className="card p-0">
            {p.schedules.length === 0 ? <div className="p-4"><EmptyState title="No payday schedule yet" body="Paydays define your paycheck budget windows." action={<button type="button" className="btn btn-primary btn-sm" onClick={() => setEditSched("new")}>Add payday</button>} /></div> : (
              <ul>
                {p.schedules.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 border-b border-rule px-4 py-2.5 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><span className="font-medium">{s.name}</span>{p.showWs && <WorkspaceBadge workspace={s.workspace} />}{!s.active && <Pill>Inactive</Pill>}</div>
                      <div className="muted text-[12px]">{s.frequency === "semimonthly" ? `Twice a month (days ${(s.daysOfMonth ?? []).join(" and ")})` : s.frequency} · from {fmtDate(s.anchorDate)}</div>
                    </div>
                    <Money minor={s.amountMinor} currency={s.currency} className="font-semibold" />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditSched(s)}>Edit</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {p.paydays.length > 0 && (
            <div className="card p-0">
              <div className="px-4 pt-3 text-[12px] font-bold uppercase tracking-wide text-ink-soft">Recent and upcoming paydays</div>
              <ul>
                {p.paydays.map((x) => (
                  <li key={x.id} className="flex items-center gap-3 border-b border-rule px-4 py-2 last:border-b-0 text-[14px]">
                    <span className="flex-1">{fmtDate(x.date, "weekday")} · {x.name}{x.clamped ? " (moved to month end)" : ""}</span>
                    <Money minor={x.amountMinor} currency={x.currency} />
                    {x.status === "expected" ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRecvPayday(x)}>Mark received</button> : <Pill tone={x.status === "received" ? "ok" : "neutral"}>{x.status}</Pill>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <PaySheet key={"paysheet-" + (payOcc?.id ?? "none")} occ={payOcc} onClose={() => setPayOcc(null)} accounts={p.accounts} today={p.today} />
      <ReceiveSheet key={"receivesheet-" + (recvPayday?.id ?? "none")} payday={recvPayday} onClose={() => setRecvPayday(null)} accounts={p.accounts} today={p.today} />
      <MoveSheet occ={moveOcc} onClose={() => setMoveOcc(null)} />
      <BillSheet key={"billsheet-" + (editBill === "new" ? "new" : editBill?.id ?? "none")} bill={editBill} onClose={() => setEditBill(null)} accounts={p.accounts} tree={p.tree} workspace={p.workspace} today={p.today} />
      <ScheduleSheet key={"schedulesheet-" + (editSched === "new" ? "new" : editSched?.id ?? "none")} schedule={editSched} onClose={() => setEditSched(null)} accounts={p.accounts} tree={p.tree} workspace={p.workspace} today={p.today} />
    </div>
  );
}

function PaySheet({ occ, onClose, accounts, today }: { occ: Occ | null; onClose: () => void; accounts: AccountOption[]; today: string }) {
  const [state, action] = useActionState<ActionState, FormData>(payBillAction, null);
  useAfterSuccess(state, onClose);
  const [accountId, setAccountId] = useState(occ?.accountId ?? accounts[0]?.id ?? "");
  const acc = accounts.find((a) => a.id === accountId);
  const list = accounts.filter((a) => a.workspace === occ?.workspace);
  return (
    <Sheet open={!!occ} onClose={onClose} title={occ ? `Mark ${occ.name} paid` : ""}>
      {occ && (
        <form action={action} className="space-y-3">
          <input type="hidden" name="occurrenceId" value={occ.id} />
          <Notice tone="neutral">Due {fmtDate(occ.dueDate)} · creates one expense and marks this occurrence paid. Safe to retry.</Notice>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount paid" htmlFor="pay-amount"><input id="pay-amount" name="amount" className="input" inputMode="decimal" defaultValue={majorInput(occ.amountMinor)} /></Field>
            <Field label="Paid on" htmlFor="pay-date"><input id="pay-date" name="date" type="date" className="input" defaultValue={today} /></Field>
          </div>
          <Field label="Paid from" htmlFor="pay-account"><AccountSelect accounts={list.length ? list : accounts} id="pay-account" value={accountId} onChange={(e) => setAccountId(e.target.value)} /></Field>
          {acc && acc.currency !== "DOP" && <Field label="DOP equivalent (optional)" htmlFor="pay-dop"><input id="pay-dop" name="dopEquivalent" className="input" inputMode="decimal" /></Field>}
          <Field label="Note (optional)" htmlFor="pay-note"><input id="pay-note" name="note" className="input" /></Field>
          <ActionMessage state={state} />
          <SubmitButton>Record payment</SubmitButton>
        </form>
      )}
    </Sheet>
  );
}

function ReceiveSheet({ payday, onClose, accounts, today }: { payday: Payday | null; onClose: () => void; accounts: AccountOption[]; today: string }) {
  const [state, action] = useActionState<ActionState, FormData>(receivePaydayAction, null);
  useAfterSuccess(state, onClose);
  const list = accounts.filter((a) => a.workspace === payday?.workspace);
  return (
    <Sheet open={!!payday} onClose={onClose} title={payday ? `Received ${payday.name}` : ""}>
      {payday && (
        <form action={action} className="space-y-3">
          <input type="hidden" name="occurrenceId" value={payday.id} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount received" htmlFor="rc-amount"><input id="rc-amount" name="amount" className="input" inputMode="decimal" defaultValue={majorInput(payday.amountMinor)} /></Field>
            <Field label="Date" htmlFor="rc-date"><input id="rc-date" name="date" type="date" className="input" defaultValue={today} /></Field>
          </div>
          <Field label="Deposited to" htmlFor="rc-account"><AccountSelect accounts={list.length ? list : accounts} id="rc-account" defaultValue={payday.accountId ?? undefined} /></Field>
          {payday.currency !== "DOP" && <Field label="DOP equivalent (optional)" htmlFor="rc-dop"><input id="rc-dop" name="dopEquivalent" className="input" inputMode="decimal" /></Field>}
          <ActionMessage state={state} />
          <SubmitButton>Record income</SubmitButton>
        </form>
      )}
    </Sheet>
  );
}

function MoveSheet({ occ, onClose }: { occ: Occ | null; onClose: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(rescheduleOccurrenceAction, null);
  useAfterSuccess(state, onClose);
  return (
    <Sheet open={!!occ} onClose={onClose} title="Move this occurrence">
      {occ && (
        <form action={action} className="space-y-3">
          <input type="hidden" name="occurrenceId" value={occ.id} />
          <Field label="New due date" htmlFor="mv-date" hint="Only this occurrence moves. The series keeps its schedule."><input id="mv-date" name="dueDate" type="date" className="input" defaultValue={occ.dueDate} /></Field>
          <ActionMessage state={state} />
          <SubmitButton>Move</SubmitButton>
        </form>
      )}
    </Sheet>
  );
}

function BillSheet({ bill, onClose, accounts, tree, workspace, today }: { bill: Bill | null | "new"; onClose: () => void; accounts: AccountOption[]; tree: CategoryTree; workspace: "personal" | "business"; today: string }) {
  const [state, action] = useActionState<ActionState, FormData>(billAction, null);
  useAfterSuccess(state, onClose);
  const b = bill === "new" ? null : bill;
  const ws = b?.workspace ?? workspace;
  return (
    <Sheet open={!!bill} onClose={onClose} title={b ? `Edit ${b.name}` : "Add bill"}>
      <form action={action} className="space-y-3" key={b?.id ?? "new"}>
        {b && <input type="hidden" name="id" value={b.id} />}
        <input type="hidden" name="workspace" value={ws} />
        <Field label="Name" htmlFor="b-name"><input id="b-name" name="name" className="input" required defaultValue={b?.name ?? ""} placeholder="e.g. Internet" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Amount" htmlFor="b-amount" className="col-span-2"><input id="b-amount" name="amount" className="input" inputMode="decimal" required defaultValue={b ? majorInput(b.amountMinor) : ""} /></Field>
          <Field label="Currency" htmlFor="b-cur"><select id="b-cur" name="currency" className="select" defaultValue={b?.currency ?? "DOP"} disabled={!!b}><option value="DOP">RD$</option><option value="USD">US$</option></select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Repeats" htmlFor="b-freq"><select id="b-freq" name="frequency" className="select" defaultValue={b?.frequency ?? "monthly"}><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="yearly">Yearly</option><option value="once">Once</option></select></Field>
          <Field label="Every (interval)" htmlFor="b-int"><input id="b-int" name="interval" type="number" min={1} className="input" defaultValue={b?.interval ?? 1} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Next due date" htmlFor="b-anchor" hint="Day missing in a short month → last valid day."><input id="b-anchor" name="anchorDate" type="date" className="input" required defaultValue={b?.anchorDate ?? today} /></Field>
          <Field label="End date (optional)" htmlFor="b-end"><input id="b-end" name="endDate" type="date" className="input" defaultValue={b?.endDate ?? ""} /></Field>
        </div>
        <Field label="Category" htmlFor="b-cat"><CategorySelect tree={tree} kinds={["bills", "expenses", "debt", "savings"]} id="b-cat" defaultValue={b?.categoryId} /></Field>
        <Field label="Usually paid from" htmlFor="b-acc"><AccountSelect accounts={accounts.filter((a) => a.workspace === ws)} id="b-acc" defaultValue={b?.accountId} allowEmpty required={false} /></Field>
        <div className="flex flex-wrap gap-4 text-[14px]">
          <label className="flex items-center gap-2"><input type="checkbox" name="isSubscription" defaultChecked={b?.isSubscription} className="size-4 accent-[var(--mango-deep)]" /> Subscription</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="autopay" defaultChecked={b?.autopay} className="size-4 accent-[var(--mango-deep)]" /> Autopay</label>
          {b && <label className="flex items-center gap-2"><input type="checkbox" name="inactive" defaultChecked={!b.active} className="size-4 accent-[var(--mango-deep)]" /> Inactive</label>}
        </div>
        <Field label="Notes" htmlFor="b-notes"><input id="b-notes" name="notes" className="input" defaultValue={b?.notes ?? ""} /></Field>
        <ActionMessage state={state} />
        <SubmitButton>{b ? "Save bill" : "Add bill"}</SubmitButton>
      </form>
    </Sheet>
  );
}

function ScheduleSheet({ schedule, onClose, accounts, tree, workspace, today }: { schedule: Schedule | null | "new"; onClose: () => void; accounts: AccountOption[]; tree: CategoryTree; workspace: "personal" | "business"; today: string }) {
  const [state, action] = useActionState<ActionState, FormData>(scheduleAction, null);
  useAfterSuccess(state, onClose);
  const s = schedule === "new" ? null : schedule;
  const [freq, setFreq] = useState(s?.frequency ?? "semimonthly");
  const ws = s?.workspace ?? workspace;
  return (
    <Sheet open={!!schedule} onClose={onClose} title={s ? `Edit ${s.name}` : "Add payday"}>
      <form action={action} className="space-y-3" key={s?.id ?? "new"}>
        {s && <input type="hidden" name="id" value={s.id} />}
        <input type="hidden" name="workspace" value={ws} />
        <Field label="Name" htmlFor="s-name"><input id="s-name" name="name" className="input" required defaultValue={s?.name ?? ""} placeholder="e.g. Salary" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Amount" htmlFor="s-amount" className="col-span-2"><input id="s-amount" name="amount" className="input" inputMode="decimal" required defaultValue={s ? majorInput(s.amountMinor) : ""} /></Field>
          <Field label="Currency" htmlFor="s-cur"><select id="s-cur" name="currency" className="select" defaultValue={s?.currency ?? "DOP"} disabled={!!s}><option value="DOP">RD$</option><option value="USD">US$</option></select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Repeats" htmlFor="s-freq"><select id="s-freq" name="frequency" className="select" value={freq} onChange={(e) => setFreq(e.target.value)}><option value="semimonthly">Twice a month</option><option value="monthly">Monthly</option><option value="biweekly">Every two weeks</option><option value="weekly">Weekly</option></select></Field>
          <Field label="Next payday (full date)" htmlFor="s-anchor"><input id="s-anchor" name="anchorDate" type="date" className="input" required defaultValue={s?.anchorDate ?? today} /></Field>
        </div>
        {freq === "semimonthly" && <Field label="Second day of month" htmlFor="s-second" hint="31 means the last day of the month."><input id="s-second" name="secondDay" type="number" min={1} max={31} className="input" defaultValue={s?.daysOfMonth?.[1] ?? 31} /></Field>}
        <Field label="Deposited to" htmlFor="s-acc"><AccountSelect accounts={accounts.filter((a) => a.workspace === ws)} id="s-acc" defaultValue={s?.accountId} allowEmpty required={false} /></Field>
        <Field label="Income category" htmlFor="s-cat"><CategorySelect tree={tree} kinds={["income"]} id="s-cat" defaultValue={s?.categoryId} /></Field>
        {s && <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="inactive" defaultChecked={!s.active} className="size-4 accent-[var(--mango-deep)]" /> Inactive</label>}
        <ActionMessage state={state} />
        <SubmitButton>{s ? "Save payday" : "Add payday"}</SubmitButton>
      </form>
    </Sheet>
  );
}
