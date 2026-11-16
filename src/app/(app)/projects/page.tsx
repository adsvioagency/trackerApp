import type { Metadata } from "next";
import Link from "next/link";
import { getCtx } from "@/lib/current";
import { PageHeader, Card, Pill, EmptyState, RowLink, Segmented, Money, ProgressBar } from "@/components/ui";
import { listProjects, PROJECT_STATUS_LABEL, projectFinance } from "@/lib/business/projects";
import { fmtDate } from "@/lib/dates";
import { PhaseBoard } from "./board";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ view?: string; status?: string; q?: string }> }) {
  const sp = await searchParams;
  const { user, today } = await getCtx();
  const view = sp.view === "board" ? "board" : "list";
  const status = (sp.status as "open" | "all" | "completed" | undefined) ?? "open";
  const projects = await listProjects(user.id, { status: status === "all" ? "all" : status === "completed" ? "completed" : "open", search: sp.q });
  const finances = await Promise.all(projects.map((p) => projectFinance(user.id, p.id)));
  const rows = projects.map((p, i) => ({ p, f: finances[i] }));
  return (
    <div>
      <PageHeader title="Projects" description="Delivery progress and payment status, tracked separately." actions={<Link href="/add/project?back=/projects" className="btn btn-primary">New project</Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={view} options={[{ value: "list", label: "List" }, { value: "board", label: "Phase board" }]} hrefFor={(v) => `/projects?view=${v}&status=${status}`} ariaLabel="View" />
        <Segmented value={status} options={[{ value: "open", label: "Open" }, { value: "completed", label: "Completed" }, { value: "all", label: "All" }]} hrefFor={(v) => `/projects?view=${view}&status=${v}`} ariaLabel="Status" />
      </div>
      {projects.length === 0 ? (
        <Card><EmptyState title="No projects here" body="Create a project for a client to track phases, payments and tasks." action={<Link href="/add/project" className="btn btn-primary btn-sm">New project</Link>} /></Card>
      ) : view === "board" ? (
        <PhaseBoard projects={rows.map(({ p }) => ({ id: p.id, name: p.name, clientName: p.clientName, status: p.status, waitingOnClient: p.waitingOnClient, targetDate: p.targetDate, phases: p.phases.map((ph) => ({ id: ph.id, name: ph.name, sort: ph.sort })), currentPhaseId: p.currentPhase?.id ?? null, nextAction: p.nextAction }))} today={today} />
      ) : (
        <Card className="p-0">
          <ul className="px-4">
            {rows.map(({ p, f }) => (
              <li key={p.id}>
                <RowLink
                  href={`/projects/${p.id}`}
                  title={p.name}
                  subtitle={
                    <span className="flex flex-col gap-1">
                      <span>{p.clientName} · {p.currentPhase?.name ?? PROJECT_STATUS_LABEL[p.status]}{p.targetDate ? ` · target ${fmtDate(p.targetDate)}${p.targetDate < today && p.status !== "completed" ? " (past)" : ""}` : ""}{p.nextAction ? ` · next: ${p.nextAction}` : ""}</span>
                      <span className="block w-40"><ProgressBar value={p.progressPct} max={100} tone="ok" label={`${p.name} delivery progress ${p.progressPct}%`} /></span>
                    </span>
                  }
                  badge={<>{(p.waitingOnClient || p.status === "waiting_client") && <Pill tone="warn">Waiting on client</Pill>}{p.status === "on_hold" && <Pill>On hold</Pill>}{p.status === "completed" && <Pill tone="ok">Completed</Pill>}{f.overdueMinor > 0 && <Pill tone="danger">Overdue payment</Pill>}</>}
                  right={<div className="text-[12px]"><div className="font-semibold tnum"><Money minor={f.receivedMinor} currency={f.currency} /> <span className="muted">of</span> <Money minor={f.agreedMinor} currency={f.currency} /></div><div className="muted">{f.outstandingMinor ? `outstanding ${(f.outstandingMinor / 100).toLocaleString("en-US")}` : f.scheduledToInvoiceMinor ? `to invoice ${(f.scheduledToInvoiceMinor / 100).toLocaleString("en-US")}` : "received"}</div></div>}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
