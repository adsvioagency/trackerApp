"use client";

import { useActionState } from "react";
import { ActionMessage, SubmitButton, useAfterSuccess, type ActionState } from "@/components/forms";
import { Field } from "@/components/ui";
import type { ReminderSettings } from "@/lib/settings";
import { saveProfileAction, saveRemindersAction } from "./actions";

export function ProfileForm({ name, timezone, email }: { name: string; timezone: string; email: string }) {
  const [state, action] = useActionState<ActionState, FormData>(saveProfileAction, null);
  useAfterSuccess(state);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name" htmlFor="s-name">
          <input id="s-name" name="name" className="input" defaultValue={name} />
        </Field>
        <Field label="Email" htmlFor="s-email" hint="Your verified sign-in address. Change the owner allowlist in the environment to invite another address.">
          <input id="s-email" className="input" value={email} readOnly />
        </Field>
      </div>
      <Field label="Timezone" htmlFor="s-tz" hint="IANA name, e.g. America/Santo_Domingo.">
        <input id="s-tz" name="timezone" className="input" defaultValue={timezone} required />
      </Field>
      <ActionMessage state={state} />
      <SubmitButton>Save profile</SubmitButton>
    </form>
  );
}

export function RemindersForm({ settings }: { settings: ReminderSettings }) {
  const [state, action] = useActionState<ActionState, FormData>(saveRemindersAction, null);
  useAfterSuccess(state);
  return (
    <form action={action} className="space-y-4">
      <label className="flex items-center gap-3 rounded-xl border border-rule bg-surface-2/50 px-3 py-3">
        <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="size-5 accent-[var(--mango-deep)]" />
        <span>
          <span className="block font-semibold">Enable reminders</span>
          <span className="muted block text-[13px]">Sends a daily digest of due and overdue items to your account email.</span>
        </span>
      </label>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Send at (hour, your timezone)" htmlFor="r-hour">
          <input id="r-hour" name="sendHour" type="number" min={0} max={23} className="input" defaultValue={settings.sendHour} />
        </Field>
        <Field label="Repeat every (hours)" htmlFor="r-repeat">
          <input id="r-repeat" name="repeatHours" type="number" min={1} max={168} className="input" defaultValue={settings.repeatHours} />
        </Field>
        <Field label="Grouping" htmlFor="r-digest">
          <select id="r-digest" name="digest" className="select" defaultValue={settings.digest ? "on" : "off"}>
            <option value="on">One digest (recommended)</option>
            <option value="off">One email per item</option>
          </select>
        </Field>
      </div>
      <fieldset>
        <legend className="label">Include</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["incBills", "Bills due", settings.include.bills, "leadBills", settings.leadDays.bills],
              ["incTasks", "Tasks due", settings.include.tasks, "leadTasks", settings.leadDays.tasks],
              ["incInvoices", "Client invoices due or overdue", settings.include.invoices, "leadInvoices", settings.leadDays.invoices],
              ["incFollowUps", "Client and project follow-ups", settings.include.followUps, "leadFollowUps", settings.leadDays.followUps],
            ] as const
          ).map(([name, label, checked, leadName, lead]) => (
            <label key={name} className="flex items-center gap-3 rounded-lg border border-rule px-3 py-2">
              <input type="checkbox" name={name} defaultChecked={checked} className="size-4 accent-[var(--mango-deep)]" />
              <span className="flex-1 text-[14px]">{label}</span>
              <span className="muted flex items-center gap-1 text-[12px]">
                <input name={leadName} type="number" min={0} max={30} defaultValue={lead} className="input w-14 px-1 py-0.5 text-center" aria-label={`${label}: days before`} /> days before
              </span>
            </label>
          ))}
          <label className="flex items-center gap-3 rounded-lg border border-rule px-3 py-2">
            <input type="checkbox" name="incPaydays" defaultChecked={settings.include.paydays} className="size-4 accent-[var(--mango-deep)]" />
            <span className="flex-1 text-[14px]">Paydays (informational)</span>
          </label>
        </div>
      </fieldset>
      <ActionMessage state={state} />
      <SubmitButton>Save reminders</SubmitButton>
    </form>
  );
}
