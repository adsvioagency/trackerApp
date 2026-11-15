"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { ActionMessage, SubmitButton, useAfterSuccess, type ActionState } from "@/components/forms";
import { Field, cx } from "@/components/ui";
import { finishOnboardingAction, firstAccountAction, firstClientAction, firstPaydayAction, saveTimezoneAction } from "./actions";

const TIMEZONES = ["America/Santo_Domingo", "America/New_York", "America/Port-au-Prince", "America/Toronto", "America/Chicago", "America/Los_Angeles", "Europe/Paris", "Europe/Madrid", "UTC"];

function Step({ n, title, done, open, onToggle, children }: { n: number; title: string; done: boolean; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className={cx("flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold", done ? "bg-ok text-white" : "bg-surface-2 text-ink-soft")}>{done ? <Check className="size-4" /> : n}</span>
        <span className="flex-1 font-semibold">{title}</span>
        <span className="muted text-[12px]">{done ? "Done" : open ? "Hide" : "Open"}</span>
      </button>
      {open && <div className="border-t border-rule px-4 py-4">{children}</div>}
    </section>
  );
}

export function OnboardingSteps({ timezone, name, today, done, summary }: { timezone: string; name: string; today: string; done: { account: boolean; schedule: boolean; client: boolean; onboarded: boolean }; summary: { accounts: string[]; schedules: string[]; clients: string[] } }) {
  const firstOpen = !done.account ? 2 : !done.schedule ? 3 : !done.client ? 4 : 1;
  const [open, setOpen] = useState<number>(firstOpen);
  const [tzState, tzAction] = useActionState<ActionState, FormData>(saveTimezoneAction, null);
  const [accState, accAction] = useActionState<ActionState, FormData>(firstAccountAction, null);
  const [payState, payAction] = useActionState<ActionState, FormData>(firstPaydayAction, null);
  const [cliState, cliAction] = useActionState<ActionState, FormData>(firstClientAction, null);
  const [accType, setAccType] = useState("checking");
  const [payKind, setPayKind] = useState("payday");
  const [payFreq, setPayFreq] = useState("semimonthly");
  useAfterSuccess(tzState, () => setOpen(2));
  useAfterSuccess(accState, () => setOpen(3));
  useAfterSuccess(payState, () => setOpen(4));
  useAfterSuccess(cliState);
  const toggle = (n: number) => setOpen((o) => (o === n ? 0 : n));

  return (
    <div className="space-y-3">
      <Step n={1} title="Your timezone and name" done={true} open={open === 1} onToggle={() => toggle(1)}>
        <form action={tzAction} className="space-y-3">
          <Field label="Name (optional)" htmlFor="ob-name">
            <input id="ob-name" name="name" className="input" defaultValue={name} placeholder="How the assistant should address you" />
          </Field>
          <Field label="Timezone" htmlFor="ob-tz" hint="Dates, paydays and reminders use this timezone.">
            <input id="ob-tz" name="timezone" list="tz-list" className="input" defaultValue={timezone} required />
            <datalist id="tz-list">
              {TIMEZONES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
          <ActionMessage state={tzState} />
          <SubmitButton>Save and continue</SubmitButton>
        </form>
      </Step>

      <Step n={2} title="First account" done={done.account} open={open === 2} onToggle={() => toggle(2)}>
        {summary.accounts.length > 0 && <p className="muted mb-3 text-[13px]">Already added: {summary.accounts.join(", ")}.</p>}
        <form action={accAction} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Workspace" htmlFor="ob-ws">
              <select id="ob-ws" name="workspace" className="select" defaultValue="personal">
                <option value="personal">Personal</option>
                <option value="business">Business (Adsvio)</option>
              </select>
            </Field>
            <Field label="Type" htmlFor="ob-type">
              <select id="ob-type" name="type" className="select" value={accType} onChange={(e) => setAccType(e.target.value)}>
                <option value="checking">Checking</option>
                <option value="cash">Cash</option>
                <option value="savings">Savings</option>
                <option value="credit_card">Credit card</option>
              </select>
            </Field>
          </div>
          <Field label="Account name" htmlFor="ob-acc">
            <input id="ob-acc" name="name" className="input" placeholder="e.g. Banreservas checking" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency" htmlFor="ob-cur">
              <select id="ob-cur" name="currency" className="select" defaultValue="DOP">
                <option value="DOP">RD$ Dominican peso</option>
                <option value="USD">US$ US dollar</option>
              </select>
            </Field>
            <Field label={accType === "credit_card" ? "Amount owed today" : "Opening balance (optional)"} htmlFor="ob-open">
              <input id="ob-open" name="opening" className="input" inputMode="decimal" placeholder="0.00" />
            </Field>
          </div>
          <ActionMessage state={accState} />
          <div className="flex gap-2">
            <SubmitButton>Add account</SubmitButton>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(3)}>
              Skip
            </button>
          </div>
        </form>
      </Step>

      <Step n={3} title="First payday or bill" done={done.schedule} open={open === 3} onToggle={() => toggle(3)}>
        {summary.schedules.length > 0 && <p className="muted mb-3 text-[13px]">Already added: {summary.schedules.join(", ")}.</p>}
        <form action={payAction} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="What is it?" htmlFor="ob-kind">
              <select id="ob-kind" name="kind" className="select" value={payKind} onChange={(e) => setPayKind(e.target.value)}>
                <option value="payday">A payday (income)</option>
                <option value="bill">A recurring bill</option>
              </select>
            </Field>
            <Field label="Repeats" htmlFor="ob-freq">
              <select id="ob-freq" name="frequency" className="select" value={payFreq} onChange={(e) => setPayFreq(e.target.value)}>
                {payKind === "payday" && <option value="semimonthly">Twice a month</option>}
                <option value="monthly">Monthly</option>
                <option value="biweekly">Every two weeks</option>
                <option value="weekly">Weekly</option>
                {payKind === "bill" && <option value="yearly">Yearly</option>}
              </select>
            </Field>
          </div>
          <Field label="Name" htmlFor="ob-pname">
            <input id="ob-pname" name="name" className="input" placeholder={payKind === "payday" ? "e.g. Salary" : "e.g. Internet"} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" htmlFor="ob-pamt">
              <input id="ob-pamt" name="amount" className="input" inputMode="decimal" placeholder="0.00" required />
            </Field>
            <Field label="Currency" htmlFor="ob-pcur">
              <select id="ob-pcur" name="currency" className="select" defaultValue="DOP">
                <option value="DOP">RD$</option>
                <option value="USD">US$</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={payKind === "payday" ? "Next payday (full date)" : "Next due date"} htmlFor="ob-pdate" hint={payFreq === "monthly" ? "If the day does not exist in a shorter month, the last valid day is used." : undefined}>
              <input id="ob-pdate" name="date" type="date" className="input" defaultValue={today} required />
            </Field>
            {payKind === "payday" && payFreq === "semimonthly" && (
              <Field label="Second day of month" htmlFor="ob-second" hint="Use 31 for the last day of the month.">
                <input id="ob-second" name="secondDay" type="number" min={1} max={31} className="input" defaultValue={31} />
              </Field>
            )}
          </div>
          <ActionMessage state={payState} />
          <div className="flex gap-2">
            <SubmitButton>Add</SubmitButton>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(4)}>
              Skip
            </button>
          </div>
        </form>
      </Step>

      <Step n={4} title="First client or project (Adsvio)" done={done.client} open={open === 4} onToggle={() => toggle(4)}>
        {summary.clients.length > 0 && <p className="muted mb-3 text-[13px]">Already added: {summary.clients.join(", ")}.</p>}
        <form action={cliAction} className="space-y-3">
          <Field label="Company or client" htmlFor="ob-co">
            <input id="ob-co" name="company" className="input" required placeholder="e.g. Lakou Café" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact name" htmlFor="ob-contact">
              <input id="ob-contact" name="contactName" className="input" />
            </Field>
            <Field label="Email" htmlFor="ob-email">
              <input id="ob-email" name="email" type="email" className="input" />
            </Field>
          </div>
          <Field label="Project name (optional)" htmlFor="ob-proj" hint="Leave empty to add a prospect only.">
            <input id="ob-proj" name="projectName" className="input" placeholder="e.g. Website redesign" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Agreed value" htmlFor="ob-agreed">
              <input id="ob-agreed" name="agreed" className="input" inputMode="decimal" placeholder="0.00" />
            </Field>
            <Field label="Currency" htmlFor="ob-pc">
              <select id="ob-pc" name="currency" className="select" defaultValue="USD">
                <option value="USD">US$</option>
                <option value="DOP">RD$</option>
              </select>
            </Field>
          </div>
          <ActionMessage state={cliState} />
          <SubmitButton>Add</SubmitButton>
        </form>
      </Step>

      <form action={finishOnboardingAction} className="pt-2">
        <button type="submit" className="btn btn-primary w-full">
          {done.onboarded ? "Back to Today" : "Finish and open Today"}
        </button>
      </form>
    </div>
  );
}
