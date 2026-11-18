import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Plus, Target } from "lucide-react";
import { Card, EmptyState, PageHeader, Pill, ProgressBar, Segmented, WorkspaceBadge } from "@/components/ui";
import { getCtx } from "@/lib/current";
import { fmtDate } from "@/lib/dates";
import { listTrackedGoals } from "@/lib/goal-tracker";
import { PrintGoalsButton } from "./goal-forms";

export const metadata: Metadata = { title: "Goals" };

export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ year?: string; show?: string }> }) {
  const { user, view, today } = await getCtx();
  const { year: rawYear, show: rawFilter } = await searchParams;
  const currentYear = Number(today.slice(0, 4));
  const year = parsePlanningYear(rawYear, currentYear);
  const show = rawFilter === "archive" ? "archive" : "plan";
  const goals = await listTrackedGoals(user.id, view, { year });
  const plan = goals.filter((goal) => !goal.archivedAt);
  const visible = show === "archive" ? goals.filter((goal) => goal.archivedAt) : plan;
  const activeCount = plan.filter((goal) => !goal.completedAt).length;
  const workspace = { personal: "Personal", business: "Business", combined: "Combined" }[view];
  const newGoal = "/goals/new?year=" + year;
  const listHref = (selectedYear: number, filter: string = show) => "/goals?year=" + selectedYear + (filter === "archive" ? "&show=archive" : "");
  const sections = new Map<string, typeof visible>();
  for (const goal of visible) {
    const key = goal.area.toLocaleLowerCase("en-US");
    sections.set(key, [...(sections.get(key) ?? []), goal]);
  }

  return (
    <div className="goals-print-plan mx-auto max-w-[960px]">
      <PageHeader eyebrow={workspace + " · " + year} title="Goals" description="Plan your year, set a target date, and track the milestones that move you forward." actions={
        <div className="flex flex-wrap gap-2 print:hidden">
          {show === "plan" && plan.length > 0 && <PrintGoalsButton />}
          <Link href={newGoal} className="btn btn-primary"><Plus className="size-4" aria-hidden /> Add goal</Link>
        </div>
      } />
      <div className="mb-5 rounded-2xl border border-rule bg-paper-deep px-4 py-4 sm:px-5 print:hidden">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Annual plan</p>
            <h2 className="mt-1 font-display text-2xl font-extrabold">{year}</h2>
            <p className="muted text-sm">{activeCount} active · {plan.length - activeCount} completed</p>
          </div>
          <form action="/goals" className="flex items-end gap-2">
            {show === "archive" && <input type="hidden" name="show" value="archive" />}
            <label className="label mb-0">
              Year
              <input className="input mt-1 w-24" type="number" name="year" key={year} defaultValue={year} min={1900} max={9999} required />
            </label>
            <button className="btn btn-secondary" type="submit">Go</button>
            {year === currentYear && <Link href={listHref(currentYear + 1)} className="btn btn-ghost">{currentYear + 1} plan</Link>}
            {year !== currentYear && <Link href={listHref(currentYear)} className="btn btn-ghost">This year</Link>}
          </form>
        </div>
      </div>
      <div className="mb-4 print:hidden">
        <Segmented value={show} options={[{ value: "plan", label: "Plan" }, { value: "archive", label: "Archived" }]} hrefFor={(value) => listHref(year, value)} ariaLabel="Goal status" />
      </div>
      {!visible.length ? (
        <EmptyState title={show === "archive" ? "No archived goals" : "What would you like to achieve this year?"}
          body={show === "plan" ? "Add a resolution and give yourself a few small steps to start." : undefined}
          action={show === "plan" ? <Link href={newGoal} className="btn btn-primary">Add your first goal</Link> : undefined} />
      ) : (
        <div className="space-y-5">
          {[...sections.values()].map((items) => (
            <section key={items[0].area.toLowerCase()}>
              <h2 className="eyebrow mb-2 break-words">{items[0].area}</h2>
              <div className="grid gap-3 lg:grid-cols-2 print:block">
                {items.map((goal) => {
                  const done = goal.milestones.filter((step) => step.completedAt).length;
                  const count = goal.milestones.length;
                  const next = goal.milestones.find((step) => !step.completedAt);
                  return (
                    <Card as="article" key={goal.id} className="min-w-0 print:mb-3 print:break-inside-avoid">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        {view === "combined" && <WorkspaceBadge workspace={goal.workspace} />}
                        {goal.completedAt && <Pill tone="ok">Complete</Pill>}
                        {goal.dueDate && <span className="muted flex items-center gap-1 text-xs"><Target className="size-3.5" aria-hidden /> Target {fmtDate(goal.dueDate)}</span>}
                      </div>
                      <h3 className="break-words text-lg font-extrabold">
                        <Link href={"/goals/" + goal.id} className="hover:underline">
                          {goal.title}<ArrowUpRight className="ml-1 inline size-4 text-ink-muted print:hidden" aria-hidden />
                        </Link>
                      </h3>
                      {goal.outcome && <p className="muted mt-1 line-clamp-2 break-words text-sm print:line-clamp-none">{goal.outcome}</p>}
                      {count > 0 && <div className="mt-3">
                        <ProgressBar value={done} max={count} label={"Milestones for " + goal.title} tone="ok" />
                        <p className="muted mt-1 text-xs">{done} of {count} milestones complete</p>
                      </div>}
                      {!goal.completedAt && next && <p className="mt-2 break-words text-sm print:hidden"><span className="font-semibold">Next</span> · {next.title}</p>}
                      {count > 0 && <ul className="mt-2 hidden list-disc space-y-1 pl-5 text-sm print:block">
                        {goal.milestones.map((step) => <li key={step.id}>{step.completedAt ? "Done · " : ""}{step.title}{step.dueDate && " · " + fmtDate(step.dueDate)}</li>)}
                      </ul>}
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function parsePlanningYear(value: string | undefined, fallback: number) {
  return typeof value === "string" && /^\d{4}$/.test(value) && Number(value) >= 1900 ? Number(value) : fallback;
}
