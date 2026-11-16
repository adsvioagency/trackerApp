import type { Metadata } from "next";
import Link from "next/link";
import { getCtx } from "@/lib/current";
import { PageHeader, Card, Pill, EmptyState, RowLink, Segmented, Money } from "@/components/ui";
import { listClients, PIPELINE_STAGES, CLIENT_STATUS_LABEL } from "@/lib/business/clients";
import { fmtDate } from "@/lib/dates";
import { ClientSearch, PipelineBoard } from "./clients-client";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; view?: string; status?: string }> }) {
  const sp = await searchParams;
  const { user, today } = await getCtx();
  const view = sp.view === "pipeline" ? "pipeline" : "directory";
  const status = (sp.status as "all" | "prospect" | "active" | "inactive" | "archived" | undefined) ?? "all";
  const clients = await listClients(user.id, { search: sp.q, status, includeArchived: status === "archived" || status === "all" ? false : false });
  const prospects = (await listClients(user.id, { status: "prospect" })).filter((c) => c.pipelineStage !== "won");
  return (
    <div>
      <PageHeader title="Clients" description="Directory, prospect pipeline and activity history. Tap to call or email." actions={<Link href="/add/client?back=/clients" className="btn btn-primary">Add client</Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={view} options={[{ value: "directory", label: "Directory" }, { value: "pipeline", label: `Pipeline (${prospects.length})` }]} hrefFor={(v) => `/clients?view=${v}`} ariaLabel="View" />
        {view === "directory" && <Segmented value={status} options={[{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "prospect", label: "Prospects" }, { value: "inactive", label: "Inactive" }, { value: "archived", label: "Archived" }]} hrefFor={(v) => `/clients?status=${v}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`} ariaLabel="Status" />}
        {view === "directory" && <ClientSearch />}
      </div>
      {view === "pipeline" ? (
        <PipelineBoard stages={PIPELINE_STAGES.filter((s) => s.value !== "won" && s.value !== "lost")} clients={prospects.map((c) => ({ id: c.id, company: c.company, contactName: c.contactName, pipelineStage: c.pipelineStage, estimateMinor: c.estimateMinor, estimateCurrency: c.estimateCurrency, followUpDate: c.followUpDate }))} today={today} />
      ) : (
        <Card className="p-0">
          {clients.length === 0 ? <div className="p-4"><EmptyState title="No clients match" body="Add your first client or prospect." action={<Link href="/add/client" className="btn btn-primary btn-sm">Add client</Link>} /></div> : (
            <ul className="px-4">
              {clients.map((c) => (
                <li key={c.id}>
                  <RowLink
                    href={`/clients/${c.id}`}
                    title={c.company}
                    subtitle={[c.contactName, c.email, c.phone].filter(Boolean).join(" · ") || "No contact details yet"}
                    badge={<><Pill tone={c.status === "active" ? "ok" : c.status === "prospect" ? "mango" : "neutral"}>{CLIENT_STATUS_LABEL[c.status]}</Pill>{c.status === "prospect" && <Pill>{c.pipelineStage.replace("_", " ")}</Pill>}{c.followUpDate && c.followUpDate <= today && <Pill tone="warn">Follow up {fmtDate(c.followUpDate, "short")}</Pill>}</>}
                    right={<div className="muted text-[12px]">{c.projectCount} project(s){c.status === "prospect" && c.estimateMinor ? <div className="tnum">est. <Money minor={c.estimateMinor} currency={c.estimateCurrency ?? "USD"} /></div> : null}</div>}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
