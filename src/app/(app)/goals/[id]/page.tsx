import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, PageHeader, Pill, ProgressBar, WorkspaceBadge } from "@/components/ui";
import { getCtx } from "@/lib/current";
import { fmtDate } from "@/lib/dates";
import { getTrackedGoal } from "@/lib/goal-tracker";
import { AddMilestone, GoalForm, GoalStatusForm, MilestoneRow } from "../goal-forms";

export const metadata: Metadata = { title: "Goal details" };

export default async function GoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await getCtx();
  const goal = await getTrackedGoal(user.id, id);
  if (!goal) notFound();
  const count = goal.milestones.length;
  const done = goal.milestones.filter((step) => step.completedAt).length;
  const archived = Boolean(goal.archivedAt);
  return (
    <div className="mx-auto max-w-[800px] [overflow-wrap:anywhere]">
      <Link href={"/goals?year=" + goal.year + (archived ? "&show=archive" : "")} className="btn btn-ghost btn-sm mb-3">← Goals</Link>
      <PageHeader eyebrow={goal.year + " · " + goal.area} title={goal.title} actions={<GoalStatusForm goal={goal} />}>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <WorkspaceBadge workspace={goal.workspace} />
          {goal.completedAt && <Pill tone="ok">Complete</Pill>}
          {archived && <Pill>Archived</Pill>}
          <span className="muted text-sm">{goal.dueDate ? "Target " + fmtDate(goal.dueDate) : "No target date"}</span>
        </div>
      </PageHeader>
      {(goal.motivation || goal.outcome) && <Card className="mb-4 grid gap-4 sm:grid-cols-2">
        {goal.motivation && <div><h2 className="eyebrow mb-1">Why it matters</h2><p className="whitespace-pre-wrap text-sm">{goal.motivation}</p></div>}
        {goal.outcome && <div><h2 className="eyebrow mb-1">What success looks like</h2><p className="whitespace-pre-wrap text-sm">{goal.outcome}</p></div>}
      </Card>}
      <Card title="Milestones">
        {count === 0 ? <p className="muted text-sm">What’s one step you could take to get started?</p> : (
          <>
            <ProgressBar value={done} max={count} label="Milestone progress" tone="ok" />
            <p className="muted mt-1 text-sm">{done} of {count} complete</p>
            <ul className="mt-1">{goal.milestones.map((milestone) => <MilestoneRow key={milestone.id} milestone={milestone} goalId={id} readOnly={archived} />)}</ul>
          </>
        )}
        {!archived && <AddMilestone goalId={id} />}
      </Card>
      {!archived && <details className="card mt-4 p-4 md:p-5">
        <summary className="cursor-pointer font-semibold">Edit goal details</summary>
        <div className="mt-4"><GoalForm key={JSON.stringify([goal.title, goal.area, goal.year, goal.workspace, goal.dueDate, goal.motivation, goal.outcome])} goal={goal} defaultYear={goal.year} defaultWorkspace={goal.workspace} customAreas={{ personal: [], business: [] }} /></div>
      </details>}
    </div>
  );
}
