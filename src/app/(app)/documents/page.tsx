import type { Metadata } from "next";
import Link from "next/link";
import { getCtx } from "@/lib/current";
import { PageHeader, Card, Pill, EmptyState, Money, Segmented, RowLink } from "@/components/ui";
import { listInvoices, listProposals, listServiceTemplates } from "@/lib/business/documents";
import { fmtDate } from "@/lib/dates";
import { TemplatesClient } from "./templates-client";

export const metadata: Metadata = { title: "Proposals & Invoices" };

const PROPOSAL_TONE: Record<string, "neutral" | "mango" | "ok" | "danger" | "warn"> = { draft: "neutral", sent: "mango", approved: "ok", declined: "danger", expired: "warn" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string }> }) {
  const sp = await searchParams;
  const { user, today } = await getCtx();
  const tab = sp.tab === "invoices" ? "invoices" : sp.tab === "templates" ? "templates" : "proposals";
  const [proposals, invoices, templates] = await Promise.all([listProposals(user.id), listInvoices(user.id, { status: "all", today }), listServiceTemplates(user.id)]);
  const filteredInvoices = sp.status === "overdue" ? invoices.filter((i) => i.overdue) : sp.status ? invoices.filter((i) => i.status === sp.status) : invoices;
  const filteredProposals = sp.status ? proposals.filter((p) => p.status === sp.status) : proposals;
  return (
    <div>
      <PageHeader title="Proposals & Invoices" description="Enter client and project details once. Issued documents keep their exact values and branding as a snapshot." actions={<Link href="/documents/new" className="btn btn-primary">New document</Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={tab} options={[{ value: "proposals", label: `Proposals (${proposals.length})` }, { value: "invoices", label: `Invoices (${invoices.length})` }, { value: "templates", label: "Service templates" }]} hrefFor={(v) => `/documents?tab=${v}`} ariaLabel="Document type" />
        {tab === "invoices" && <Segmented value={sp.status ?? "all"} options={[{ value: "all", label: "All" }, { value: "draft", label: "Drafts" }, { value: "issued", label: "Open" }, { value: "overdue", label: "Overdue" }, { value: "paid", label: "Paid" }]} hrefFor={(v) => `/documents?tab=invoices${v === "all" ? "" : `&status=${v}`}`} ariaLabel="Invoice status" />}
        {tab === "proposals" && <Segmented value={sp.status ?? "all"} options={[{ value: "all", label: "All" }, { value: "draft", label: "Drafts" }, { value: "sent", label: "Sent" }, { value: "approved", label: "Approved" }]} hrefFor={(v) => `/documents?tab=proposals${v === "all" ? "" : `&status=${v}`}`} ariaLabel="Proposal status" />}
      </div>
      {tab === "proposals" && (
        <Card className="p-0">
          {filteredProposals.length === 0 ? <div className="p-4"><EmptyState title="No proposals yet" body="Create one from a client or project, or start blank." action={<Link href="/documents/new?type=proposal" className="btn btn-primary btn-sm">New proposal</Link>} /></div> : (
            <ul className="px-4">
              {filteredProposals.map((p) => (
                <li key={p.id}><RowLink href={`/documents/proposals/${p.id}`} title={`${p.number} · ${p.title}`} subtitle={`${p.clientName} · ${fmtDate(p.issueDate)}${p.validUntil ? ` · valid until ${fmtDate(p.validUntil)}` : ""}`} badge={<Pill tone={PROPOSAL_TONE[p.status]}>{p.status}</Pill>} right={<Money minor={p.totalMinor} currency={p.currency} className="font-semibold" />} /></li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {tab === "invoices" && (
        <Card className="p-0">
          {filteredInvoices.length === 0 ? <div className="p-4"><EmptyState title="No invoices here" action={<Link href="/documents/new?type=invoice" className="btn btn-primary btn-sm">New invoice</Link>} /></div> : (
            <ul className="px-4">
              {filteredInvoices.map((i) => (
                <li key={i.id}><RowLink href={`/documents/invoices/${i.id}`} title={`${i.number} · ${i.title}`} subtitle={`${i.clientName} · issued ${fmtDate(i.issueDate)}${i.dueDate ? ` · due ${fmtDate(i.dueDate)}` : ""}${i.paidMinor ? ` · received ${(i.paidMinor / 100).toFixed(2)}` : ""}`} badge={<Pill tone={i.overdue ? "danger" : i.status === "paid" ? "ok" : i.status === "issued" ? "mango" : i.status === "void" ? "neutral" : "neutral"}>{i.overdue ? "overdue" : i.status}</Pill>} right={<div><Money minor={i.status === "paid" ? i.totalMinor : i.balanceMinor} currency={i.currency} className="font-semibold" />{i.status !== "paid" && i.paidMinor > 0 && <div className="muted text-[11px]">of {(i.totalMinor / 100).toFixed(2)}</div>}</div>} /></li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {tab === "templates" && <TemplatesClient templates={templates.map((t) => ({ id: t.id, name: t.name, description: t.description, unitPriceMinor: t.unitPriceMinor, currency: t.currency, unit: t.unit }))} />}
    </div>
  );
}
