import type { Metadata } from "next";
import Link from "next/link";
import { getCtx } from "@/lib/current";
import { PageHeader, Card, EmptyState, Segmented } from "@/components/ui";
import { listTasks, getTask } from "@/lib/tasks";
import { listClients } from "@/lib/business/clients";
import { listProjects } from "@/lib/business/projects";
import { addDaysISO } from "@/lib/dates";
import { TaskList, TaskSheet } from "./tasks-client";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ task?: string; show?: string; project?: string }> }) {
  const sp = await searchParams;
  const { user, view, today } = await getCtx();
  const show = sp.show === "done" ? "done" : "open";
  const tasks = await listTasks(user.id, { workspace: view, status: show === "done" ? "done" : "open", projectId: sp.project, limit: 500 });
  const focus = sp.task ? await getTask(user.id, sp.task) : null;
  const [clients, projects] = await Promise.all([listClients(user.id), listProjects(user.id, { status: "open" })]);
  const groups = [
    { key: "overdue", title: "Overdue", items: tasks.filter((t) => t.dueDate && t.dueDate < today) },
    { key: "today", title: "Today", items: tasks.filter((t) => t.dueDate === today) },
    { key: "week", title: "Next 7 days", items: tasks.filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= addDaysISO(today, 7)) },
    { key: "later", title: "Later", items: tasks.filter((t) => t.dueDate && t.dueDate > addDaysISO(today, 7)) },
    { key: "someday", title: "No date", items: tasks.filter((t) => !t.dueDate) },
  ].filter((g) => g.items.length);
  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader title="Tasks" description="Completing a task here updates Today, the calendar, projects and clients." actions={<Link href={`/add/task?ws=${view === "business" ? "business" : "personal"}&back=/tasks`} className="btn btn-primary">Add task</Link>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Segmented value={show} options={[{ value: "open", label: "Open" }, { value: "done", label: "Done" }]} hrefFor={(v) => `/tasks?show=${v}`} ariaLabel="Status" />
      </div>
      {tasks.length === 0 ? (
        <Card><EmptyState title={show === "done" ? "Nothing completed yet" : "No open tasks"} body={show === "done" ? undefined : "Add a task with a due date to see it on Today and in the calendar."} action={show === "open" ? <Link href="/add/task" className="btn btn-primary btn-sm">Add task</Link> : undefined} /></Card>
      ) : show === "done" ? (
        <Card className="p-0"><TaskList items={tasks} today={today} showWs={view === "combined"} /></Card>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.08em] text-ink-soft">{g.title} · {g.items.length}</h2>
              <Card className="p-0"><TaskList items={g.items} today={today} showWs={view === "combined"} /></Card>
            </section>
          ))}
        </div>
      )}
      {focus && <TaskSheet task={{ ...focus, checklist: focus.checklist, recurrence: focus.recurrence }} clients={clients.map((c) => ({ id: c.id, name: c.company }))} projects={projects.map((p) => ({ id: p.id, name: p.name, clientId: p.clientId }))} />}
    </div>
  );
}
