import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { getCtx } from "@/lib/current";
import { getProposal, listServiceTemplates } from "@/lib/business/documents";
import { listClients } from "@/lib/business/clients";
import { getProject, listProjects } from "@/lib/business/projects";
import { Pill, Notice, Money, Card } from "@/components/ui";
import { DocEditor } from "@/components/doc-editor";
import { DocPreview } from "@/components/doc-preview";
import { ProposalActions } from "./actions-client";
import { fmtDate } from "@/lib/dates";
import { installmentAmounts } from "@/lib/business/doc-math";

export const metadata: Metadata = { title: "Proposal" };

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, today } = await getCtx();
  const p = await getProposal(user.id, id);
  if (!p) notFound();
  const [clients, projects, templates] = await Promise.all([listClients(user.id, { includeArchived: true }), listProjects(user.id, { status: "all", includeArchived: true }), listServiceTemplates(user.id)]);
  const isDraft = p.status === "draft";
  const snap = p.snapshot;
  const schedule = snap ? installmentAmounts(snap.totals.totalMinor, snap.installments ?? []) : [];
  const projectRecord = p.project ? await getProject(user.id, p.project.id) : null;
  const planned = (projectRecord?.installments ?? []).filter((i) => i.status === "planned");
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Link href="/documents" className="btn btn-ghost btn-sm -ml-2"><ArrowLeft className="size-4" /> Proposals &amp; Invoices</Link>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/pdf/proposal/${p.id}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm"><Printer className="size-4" /> Preview / Print PDF</a>
          <a href={`/api/pdf/proposal/${p.id}?download=1`} className="btn btn-secondary btn-sm"><Download className="size-4" /> Download PDF</a>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-[24px] font-extrabold">{p.number} · {p.title}</h1>
        <Pill tone={p.status === "approved" ? "ok" : p.status === "sent" ? "mango" : p.status === "declined" ? "danger" : "neutral"}>{p.status}</Pill>
        <span className="muted text-[13px]"><Link href={`/clients/${p.clientId}`} className="font-semibold hover:underline">{p.client.company}</Link>{p.project ? <> · <Link href={`/projects/${p.project.id}`} className="font-semibold hover:underline">{p.project.name}</Link></> : null} · {fmtDate(p.issueDate)}</span>
      </div>
      <ProposalActions proposal={{ id: p.id, status: p.status, number: p.number, totalMinor: (snap?.totals ?? p.totals).totalMinor, currency: p.currency, installments: (snap?.installments ?? p.installments).map((i) => ({ id: i.id, label: i.label, kind: i.kind })), schedule: schedule.map((a) => ({ id: a.installment.id, amountMinor: a.amountMinor })), invoices: p.invoices.map((i) => ({ id: i.id, number: i.number, status: i.status, totalMinor: i.totalMinor, installmentId: i.installmentId })), projectInstallments: planned.map((i) => ({ id: i.id, label: i.label, amountMinor: i.amountMinor })) }} today={today} />
      {isDraft ? (
        <DocEditor type="proposal" doc={{ id: p.id, number: p.number, status: p.status, clientId: p.clientId, projectId: p.projectId, title: p.title, subtitle: p.subtitle, intro: p.intro, issueDate: p.issueDate, validUntil: p.validUntil, dueDate: null, currency: p.currency, lines: p.lines, projectDiscountMinor: p.projectDiscountMinor, taxes: p.taxes, exclusions: p.exclusions, revisionLimit: p.revisionLimit, paymentTerms: p.paymentTerms, paymentInstructions: p.paymentInstructions, timingNotes: p.timingNotes, installments: p.installments, notes: p.notes }} refs={{ clients: clients.map((c) => ({ id: c.id, company: c.company, contactName: c.contactName, email: c.email, billingAddress: c.billingAddress })), projects: projects.map((x) => ({ id: x.id, name: x.name, clientId: x.clientId })), templates: templates.map((t) => ({ id: t.id, name: t.name, description: t.description, unitPriceMinor: t.unitPriceMinor, currency: t.currency, unit: t.unit })) }} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <Notice tone="neutral" className="mb-3">This proposal was {p.status === "approved" ? "approved" : "sent"} on {fmtDate((p.approvedAt ?? p.sentAt ?? p.createdAt).toISOString().slice(0, 10))}. The values below are frozen; later edits to the project do not change this document.</Notice>
            {snap && <DocPreview snap={snap} />}
          </div>
          <div className="space-y-4">
            <Card title="Summary">
              <dl className="space-y-1 text-[14px]">
                <div className="flex justify-between"><dt className="muted">Project total</dt><dd className="font-semibold tnum"><Money minor={(snap?.totals ?? p.totals).totalMinor} currency={p.currency} /></dd></div>
                {schedule.map((a) => <div key={a.installment.id} className="flex justify-between"><dt className="muted">{a.installment.label}</dt><dd className="tnum"><Money minor={a.amountMinor} currency={p.currency} /></dd></div>)}
              </dl>
            </Card>
            <Card title="Invoices from this proposal">
              {p.invoices.length === 0 ? <p className="muted text-[13px]">None yet. Use “Create invoice” above once approved.</p> : (
                <ul className="space-y-1 text-[14px]">
                  {p.invoices.map((i) => <li key={i.id} className="flex justify-between"><Link href={`/documents/invoices/${i.id}`} className="font-medium hover:underline">{i.number}</Link><span className="flex items-center gap-2"><Money minor={i.totalMinor} currency={i.currency} /><Pill tone={i.status === "paid" ? "ok" : i.status === "issued" ? "mango" : "neutral"}>{i.status}</Pill></span></li>)}
                </ul>
              )}
            </Card>
            {p.notes && <Card title="Private notes"><p className="whitespace-pre-wrap text-[14px]">{p.notes}</p></Card>}
          </div>
        </div>
      )}
    </div>
  );
}
