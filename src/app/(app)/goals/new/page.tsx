import Link from "next/link";
import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { getCtx } from "@/lib/current";
import { listTrackedGoals } from "@/lib/goal-tracker";
import { defaultWriteWorkspace } from "@/lib/workspace";
import { GoalForm } from "../goal-forms";

export const metadata: Metadata = { title: "Add goal" };

export default async function NewGoalPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { view, user, today } = await getCtx();
  const { year } = await searchParams;
  const selectedYear = typeof year === "string" && /^\d{4}$/.test(year) && Number(year) >= 1900 ? Number(year) : Number(today.slice(0, 4));
  const goals = await listTrackedGoals(user.id, "combined", { year: selectedYear });
  const areas = (workspace: "personal" | "business") => goals.filter((goal) => goal.workspace === workspace).map((goal) => goal.area);
  return (
    <div className="mx-auto max-w-[720px]">
      <Link href={"/goals?year=" + selectedYear} className="btn btn-ghost btn-sm mb-3">← Goals</Link>
      <PageHeader title="Add goal" description="Start with the result you want. You can add or revise your milestones as you go." />
      <Card><GoalForm defaultYear={selectedYear} defaultWorkspace={defaultWriteWorkspace(view)} customAreas={{ personal: areas("personal"), business: areas("business") }} /></Card>
    </div>
  );
}
