"use client";

import { useActionState, useId, useState, type FormEvent } from "react";
import { Check, Circle, Plus } from "lucide-react";
import { ActionMessage, SubmitButton, useResetKey } from "@/components/forms";
import { Field } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import type { GoalMilestone, TrackedGoal } from "@/lib/goal-tracker";
import type { Workspace } from "@/lib/settings";
import { changeGoalStatusAction, milestoneAction, saveGoalAction } from "./actions";

const areas: Record<Workspace, string[]> = {
  personal: ["Family", "Finances", "Health", "Learning", "Relationships", "Personal growth"],
  business: ["Client experience", "Marketing", "Operations", "Revenue", "Sales", "Team"],
};

export function GoalForm({ defaultYear, defaultWorkspace, goal, customAreas }: {
  defaultYear: number;
  defaultWorkspace: Workspace;
  goal?: TrackedGoal;
  customAreas: Record<Workspace, string[]>;
}) {
  const [state, action] = useActionState(saveGoalAction, null);
  const [workspace, setWorkspace] = useState(goal?.workspace ?? defaultWorkspace);
  const uid = useId();
  const field = (key: string) => uid + "-" + key;
  const suggestions = [...new Set([...areas[workspace], ...customAreas[workspace]])];

  return (
    <form action={action} className="space-y-4">
      {goal && <input type="hidden" name="id" value={goal.id} />}
      <Field label="What do you want to achieve?" htmlFor={field("title")}>
        <input className="input" id={field("title")} name="title" defaultValue={goal?.title} placeholder={workspace === "business" ? "Create a repeatable client onboarding process" : "Make more time for family"} maxLength={140} required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Workspace" htmlFor={field("workspace")}>
          <select className="input" id={field("workspace")} name="workspace" value={workspace} onChange={(event) => setWorkspace(event.target.value === "business" ? "business" : "personal")}>
            <option value="personal">Personal</option>
            <option value="business">Business</option>
          </select>
        </Field>
        <Field label="Area" htmlFor={field("area")} hint="Choose a suggestion or type your own.">
          <input className="input" id={field("area")} name="area" list={field("areas")} defaultValue={goal?.area} placeholder={workspace === "business" ? "Operations" : "Family"} maxLength={60} required />
          <datalist id={field("areas")}>{suggestions.map((area) => <option key={area} value={area} />)}</datalist>
        </Field>
        <Field label="Planning year" htmlFor={field("year")}>
          <input className="input" id={field("year")} name="year" type="number" defaultValue={goal?.year ?? defaultYear} min={1900} max={9999} required />
        </Field>
        <Field label="Target date (optional)" htmlFor={field("dueDate")} hint="Pick a date to aim for. You can change it later.">
          <input className="input" id={field("dueDate")} name="dueDate" type="date" defaultValue={goal?.dueDate ?? ""} />
        </Field>
      </div>
      <Field label="Why does it matter?" htmlFor={field("motivation")}>
        <textarea className="input" id={field("motivation")} name="motivation" defaultValue={goal?.motivation ?? ""} rows={2} maxLength={2000} />
      </Field>
      <Field label="How will you know you’ve achieved it?" htmlFor={field("outcome")}>
        <textarea className="input" id={field("outcome")} name="outcome" defaultValue={goal?.outcome ?? ""} rows={2} maxLength={2000} />
      </Field>
      {!goal && (
        <Field label="What are three steps you could take?" htmlFor={field("steps")} hint="Enter one step per line. You can add dates after saving.">
          <textarea className="input" id={field("steps")} name="steps" rows={3} maxLength={4000} />
        </Field>
      )}
      <ActionMessage state={state} />
      <SubmitButton>{goal ? "Save changes" : "Create goal"}</SubmitButton>
    </form>
  );
}

export function GoalStatusForm({ goal }: { goal: TrackedGoal }) {
  const [state, action, pending] = useActionState(changeGoalStatusAction.bind(null, goal.id), null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {goal.archivedAt ? (
        <button className="btn btn-secondary" name="change" value="restore" disabled={pending}>Restore goal</button>
      ) : (
        <>
          <button className="btn btn-secondary" name="change" value={goal.completedAt ? "reopen" : "complete"} disabled={pending}>{goal.completedAt ? "Reopen goal" : "Mark goal complete"}</button>
          <button className="btn btn-ghost" name="change" value="archive" disabled={pending}>Archive</button>
        </>
      )}
      <ActionMessage state={state} />
    </form>
  );
}

export function MilestoneForm({ goalId, milestone }: { goalId: string; milestone?: GoalMilestone }) {
  const [state, action] = useActionState(milestoneAction.bind(null, goalId), null);
  const key = useResetKey(state);
  const uid = useId();
  return (
    <form key={key} className="space-y-2" action={action}>
      <input type="hidden" name="command" value="save" />
      {milestone && <input type="hidden" name="milestoneId" value={milestone.id} />}
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.55fr)]">
        <Field label="Milestone" htmlFor={uid + "-title"}>
          <input className="input" id={uid + "-title"} name="title" required maxLength={180} defaultValue={milestone?.title} placeholder="What is the next step?" />
        </Field>
        <Field label="Target date (optional)" htmlFor={uid + "-date"}>
          <input className="input" id={uid + "-date"} name="dueDate" type="date" defaultValue={milestone?.dueDate ?? ""} />
        </Field>
      </div>
      <ActionMessage state={state} />
      <SubmitButton className="btn btn-secondary btn-sm">{milestone ? "Save milestone" : "Add milestone"}</SubmitButton>
    </form>
  );
}

export function MilestoneRow({ goalId, milestone, readOnly }: { goalId: string; milestone: GoalMilestone; readOnly: boolean }) {
  const [state, action, pending] = useActionState(milestoneAction.bind(null, goalId), null);
  const done = Boolean(milestone.completedAt);
  function confirmRemove(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm("Remove this milestone?")) event.preventDefault();
  }
  return (
    <li className="border-b border-rule py-3 last:border-b-0">
      <div className="flex min-w-0 items-center gap-2">
        {readOnly ? (
          <span className="flex size-10 shrink-0 items-center justify-center">{done ? <Check className="size-5 text-ok" aria-label="Complete" /> : <Circle className="size-5 text-ink-muted" aria-label="Open" />}</span>
        ) : (
          <form action={action}>
            <input type="hidden" name="milestoneId" value={milestone.id} />
            <input type="hidden" name="command" value="toggle" />
            <input type="hidden" name="done" value={String(!done)} />
            <button className="btn btn-ghost btn-icon" disabled={pending} aria-label={(done ? "Reopen " : "Complete ") + milestone.title} aria-pressed={done}>
              {done ? <Check className="size-5 text-ok" aria-hidden /> : <Circle className="size-5 text-ink-muted" aria-hidden />}
            </button>
          </form>
        )}
        <div className="min-w-0 flex-1">
          <p className={done ? "break-words font-medium text-ink-soft" : "break-words font-semibold"}>{milestone.title}</p>
          {milestone.dueDate && <p className="muted text-xs">Target {fmtDate(milestone.dueDate)}</p>}
        </div>
      </div>
      <ActionMessage state={state?.error ? state : null} />
      {!readOnly && (
        <details className="mt-1 pl-12">
          <summary className="btn btn-ghost btn-sm w-fit cursor-pointer">Edit milestone</summary>
          <div className="mt-2 rounded-xl border border-rule p-3">
            <MilestoneForm key={milestone.title + milestone.dueDate} goalId={goalId} milestone={milestone} />
            <form onSubmit={confirmRemove} action={action} className="mt-2">
              <input type="hidden" name="milestoneId" value={milestone.id} />
              <input type="hidden" name="command" value="remove" />
              <button className="btn btn-ghost btn-sm text-danger" disabled={pending}>Remove milestone</button>
            </form>
          </div>
        </details>
      )}
    </li>
  );
}

export function PrintGoalsButton() {
  return <button type="button" className="btn btn-secondary" onClick={() => window.print()}>Print plan</button>;
}

export function AddMilestone({ goalId }: { goalId: string }) {
  return (
    <details className="mt-3 rounded-xl border border-rule bg-surface-2/40 p-3">
      <summary className="cursor-pointer font-semibold"><Plus className="mr-1 inline size-4" aria-hidden /> Add a milestone</summary>
      <div className="mt-3"><MilestoneForm goalId={goalId} /></div>
    </details>
  );
}
