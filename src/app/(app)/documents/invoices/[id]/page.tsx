import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { getCtx } from "@/lib/current";
import { getInvoice, listServiceTemplates } from "@/lib/business/documents";
import { listClients } from "@/lib/business/clients";
import { listProjects } from "@/lib/business/projects";
import { Pill, Notice, Money, Card } from "@/components/ui";
import { DocEditor } from "@/components/doc-editor";
import { DocPreview } from "@/components/doc-preview";
import { InvoiceActions } from "./actions-client";
import { fmtDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, today } = await getCtx();
  const inv = await getInvoice(user.id, id);
  if (!inv) notFound();
  const [clients, projects, templates] = await Promise.all([listClients(user.id, { includeArchived: true }), listProjects(user.id, { status: "all", includeArchived: true }), listServiceTemplates(user.id)]);
  const isDraft = inv.status === "draft";
  const overdue = inv.status === "issued" && inv.balanceMinor > 0 && inv.dueDate && inv.dueDate < today;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Link href="/documents?tab=invoices" className="btn btn-ghost btn-sm -ml-2"><ArrowLeft className="size-4" /> Invoices</Link>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/pdf/invoice/${inv.id}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm"><Printer className="size-4" /> Preview / Print PDF</a>
          <a href={`/api/pdf/invoice/${inv.id}?download=1`} className="btn btn-secondary btn-sm"><Download className="size-4" /> Download PDF</a>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-[24px] font-extrabold">{inv.number} · {inv.title}</h1>
        <Pill tone={overdue ? "danger" : inv.status === "paid" ? "ok" : inv.status === "issued" ? "mango" : "neutral"}>{overdue ? "overdue" : inv.status}</Pill>
        <span className="muted text-[13px]"><Link href={`/clients/${inv.clientId}`} className="font-semibold hover:underline">{inv.client.company}</Link>{inv.project ? <> · <Link href={`/projects/${inv.project.id}`} className="font-semibold hover:underline">{inv.project.name}</Link></> : null} · issued {fmtDate(inv.issueDate)}{inv.dueDate ? ` · due ${fmtDate(inv.dueDate)}` : ""}</span>
      </div>
      <InvoiceActions invoice={{ id: inv.id, status: inv.status, balanceMinor: inv.balanceMinor, paidMinor: inv.paidMinor, totalMinor: inv.effectiveTotalMinor, currency: inv.currency, hasPayments: inv.payments.length > 0 }} />
      {isDraft ? (
        <DocEditor type="invoice" doc={{ id: inv.id, number: inv.number, status: inv.status, clientId: inv.clientId, projectId: inv.projectId, title: inv.title, subtitle: null, intro: null, issueDate: inv.issueDate, validUntil: null, dueDate: inv.dueDate, currency: inv.currency, lines: inv.lines, projectDiscountMinor: inv.projectDiscountMinor, taxes: inv.taxes, exclusions: null, revisionLimit: null, paymentTerms: inv.paymentTerms, paymentInstructions: inv.paymentInstructions, timingNotes: null, installments: [], notes: inv.notes }} refs={{ clients: clients.map((c) => ({ id: c.id, company: c.company, contactName: c.contactName, email: c.email, billingAddress: c.billingAddress })), projects: projects.map((x) => ({ id: x.id, name: x.name, clientId: x.clientId })), templates: templates.map((t) => ({ id: t.id, name: t.name, description: t.description, unitPriceMinor: t.unitPriceMinor, currency: t.currency, unit: t.unit })) }} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <Notice tone="neutral" className="mb-3">Issued on {fmtDate((inv.issuedAt ?? inv.createdAt).toISOString().slice(0, 10))}. Values and branding are frozen in this document.</Notice>
            {inv.snapshot && <DocPreview snap={inv.snapshot} />}
          </div>
          <div className="space-y-4">
            <Card title="Balance">
              <dl className="space-y-1 text-[14px]">
                <div className="flex justify-between"><dt className="muted">Requested</dt><dd className="tnum font-semibold"><Money minor={inv.effectiveTotalMinor} currency={inv.currency} /></dd></div>
                <div className="flex justify-between"><dt className="muted">Received</dt><dd className="tnum text-ok"><Money minor={inv.paidMinor} currency={inv.currency} /></dd></div>
                <div className="flex justify-between border-t border-rule pt-1"><dt className="font-semibold">Left on this invoice</dt><dd className={`tnum font-display text-[18px] font-extrabold ${inv.balanceMinor > 0 ? "" : "text-ok"}`}><Money minor={inv.balanceMinor} currency={inv.currency} /></dd></div>
              </dl>
            </Card>
            <Card title="Payments">
              {inv.payments.length === 0 ? <p className="muted text-[13px]">No payments recorded yet.</p> : (
                <ul className="space-y-1 text-[14px]">
                  {inv.payments.map((p) => <li key={p.id} className="flex justify-between"><span>{fmtDate(p.date)}{p.method ? ` · ${p.method}` : ""}</span><span className="tnum"><Money minor={p.amountMinor} currency={p.currency} />{p.dopEquivalentMinor != null && <span className="muted text-[12px]"> ≈ {(p.dopEquivalentMinor / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} RD$</span>}{p.transactionId && <Link href={`/money/transactions/${p.transactionId}`} className="ml-2 text-mango-deep hover:underline">ledger</Link>}</span></li>)}
                </ul>
              )}
            </Card>
            {inv.notes && <Card title="Private notes"><p className="whitespace-pre-wrap text-[14px]">{inv.notes}</p></Card>}
          </div>
        </div>
      )}
    </div>
  );
}
