import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone, MessageCircle, Globe } from "lucide-react";
import { getCtx } from "@/lib/current";
import { getClient, CLIENT_STATUS_LABEL } from "@/lib/business/clients";
import { listProjects, PROJECT_STATUS_LABEL } from "@/lib/business/projects";
import { listInvoices, listProposals } from "@/lib/business/documents";
import { listTasks } from "@/lib/tasks";
import { listNotes } from "@/lib/notes";
import { listPayments } from "@/lib/business/payments";
import { Card, Pill, Money, RowLink, EmptyState, SectionTitle, Notice } from "@/components/ui";
import { ClientDetailClient, ActivityForm } from "./client-detail";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { fmtMoney } from "@/lib/money/format";

export const metadata: Metadata = { title: "Client" };

function waLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}`;
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, today, tz } = await getCtx();
  const c = await getClient(user.id, id);
  if (!c) notFound();
  const [projects, invoices, proposals, tasks, notes, payments] = await Promise.all([listProjects(user.id, { clientId: id, status: "all", includeArchived: true }), listInvoices(user.id, { clientId: id, status: "all", today }), listProposals(user.id, { clientId: id }), listTasks(user.id, { clientId: id, status: "open" }), listNotes(user.id, { clientId: id }), listPayments(user.id, { clientId: id, limit: 20 })]);
  const open = invoices.filter((i) => i.status === "issued");
  const outstanding: Record<string, number> = {};
  for (const i of open) outstanding[i.currency] = (outstanding[i.currency] ?? 0) + i.balanceMinor;
  const received: Record<string, number> = {};
  for (const p of payments) received[p.currency] = (received[p.currency] ?? 0) + p.amountMinor;
  return (
    <div>
      <Link href="/clients" className="btn btn-ghost btn-sm -ml-2 mb-2"><ArrowLeft className="size-4" /> Clients</Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[28px] font-extrabold">{c.company}</h1>
            <Pill tone={c.status === "active" ? "ok" : c.status === "prospect" ? "mango" : "neutral"}>{CLIENT_STATUS_LABEL[c.status]}</Pill>
            {c.status === "prospect" && <Pill>{c.pipelineStage.replace("_", " ")}</Pill>}
            {c.archivedAt && <Pill>Archived</Pill>}
          </div>
          <div className="muted mt-1 text-[14px]">{c.contactName ?? "No contact name"}{c.preferredContact ? ` · prefers ${c.preferredContact}` : ""}{c.followUpDate ? ` · follow up ${fmtDate(c.followUpDate)}` : ""}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {c.phone && <a href={`tel:${c.phone}`} className="btn btn-secondary btn-sm"><Phone className="size-4" /> Call</a>}
            {c.phone && <a href={waLink(c.phone)} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm"><MessageCircle className="size-4" /> WhatsApp</a>}
            {c.email && <a href={`mailto:${c.email}`} className="btn btn-secondary btn-sm"><Mail className="size-4" /> Email</a>}
            {c.website && <a href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm"><Globe className="size-4" /> Website</a>}
          </div>
        </div>
        <ClientDetailClient client={{ id: c.id, company: c.company, contactName: c.contactName, email: c.email, phone: c.phone, website: c.website, billingAddress: c.billingAddress, preferredContact: c.preferredContact, notes: c.notes, status: c.status, pipelineStage: c.pipelineStage, estimateMinor: c.estimateMinor, estimateCurrency: c.estimateCurrency, followUpDate: c.followUpDate, archived: !!c.archivedAt }} contacts={c.contacts} today={today} />
      </div>

      {c.status === "prospect" && c.estimateMinor ? <Notice tone="neutral" className="mb-4">Prospect estimate {fmtMoney(c.estimateMinor, c.estimateCurrency ?? "USD")} is not part of receivables until a proposal is approved and invoiced.</Notice> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-3.5"><div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">Outstanding</div><div className="mt-1 font-display text-[20px] font-extrabold">{Object.keys(outstanding).length ? Object.entries(outstanding).map(([k, v]) => <div key={k}><Money minor={v} currency={k} /></div>) : "—"}</div><div className="muted text-[12px]">{open.length} open invoice(s){open.some((i) => i.overdue) ? " · overdue" : ""}</div></div>
        <div className="card p-3.5"><div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">Received</div><div className="mt-1 font-display text-[20px] font-extrabold">{Object.keys(received).length ? Object.entries(received).map(([k, v]) => <div key={k}><Money minor={v} currency={k} /></div>) : "—"}</div><div className="muted text-[12px]">{payments.length} payment(s)</div></div>
        <div className="card p-3.5"><div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">Projects</div><div className="mt-1 font-display text-[20px] font-extrabold">{projects.length}</div><div className="muted text-[12px]">{projects.filter((p) => !["completed", "cancelled"].includes(p.status)).length} open</div></div>
        <div className="card p-3.5"><div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">Open tasks</div><div className="mt-1 font-display text-[20px] font-extrabold">{tasks.length}</div><div className="muted text-[12px]">{tasks.filter((t) => t.dueDate && t.dueDate < today).length} overdue</div></div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <section>
            <SectionTitle action={<Link href={`/add/project?client=${c.id}&back=/clients/${c.id}`} className="btn btn-ghost btn-sm">New project</Link>}>Projects</SectionTitle>
            <Card className="p-0">{projects.length ? <ul className="px-4">{projects.map((p) => <li key={p.id}><RowLink href={`/projects/${p.id}`} title={p.name} subtitle={`${PROJECT_STATUS_LABEL[p.status]}${p.currentPhase ? ` · ${p.currentPhase.name}` : ""}${p.targetDate ? ` · target ${fmtDate(p.targetDate)}` : ""}`} right={<Money minor={p.agreedValueMinor} currency={p.currency} />} /></li>)}</ul> : <div className="p-4"><EmptyState title="No projects yet" /></div>}</Card>
          </section>
          <section>
            <SectionTitle action={<Link href={`/documents/new?client=${c.id}`} className="btn btn-ghost btn-sm">New document</Link>}>Proposals &amp; invoices</SectionTitle>
            <Card className="p-0">
              {proposals.length + invoices.length === 0 ? <div className="p-4"><EmptyState title="No documents yet" /></div> : (
                <ul className="px-4">
                  {proposals.map((p) => <li key={p.id}><RowLink href={`/documents/proposals/${p.id}`} title={`${p.number} · ${p.title}`} subtitle={`Proposal · ${fmtDate(p.issueDate)}`} badge={<Pill tone={p.status === "approved" ? "ok" : p.status === "sent" ? "mango" : "neutral"}>{p.status}</Pill>} right={<Money minor={p.totalMinor} currency={p.currency} />} /></li>)}
                  {invoices.map((i) => <li key={i.id}><RowLink href={`/documents/invoices/${i.id}`} title={`${i.number} · ${i.title}`} subtitle={`Invoice · ${fmtDate(i.issueDate)}${i.dueDate ? ` · due ${fmtDate(i.dueDate)}` : ""}`} badge={<Pill tone={i.overdue ? "danger" : i.status === "paid" ? "ok" : i.status === "issued" ? "mango" : "neutral"}>{i.overdue ? "overdue" : i.status}</Pill>} right={<Money minor={i.status === "paid" ? i.totalMinor : i.balanceMinor} currency={i.currency} />} /></li>)}
                </ul>
              )}
            </Card>
          </section>
          <section>
            <SectionTitle action={<Link href={`/add/task?ws=business&clientId=${c.id}&back=/clients/${c.id}`} className="btn btn-ghost btn-sm">Add task</Link>}>Open tasks</SectionTitle>
            <Card className="p-0">{tasks.length ? <ul className="px-4">{tasks.map((t) => <li key={t.id}><RowLink href={`/tasks?task=${t.id}`} title={t.title} subtitle={t.dueDate ? `Due ${fmtDate(t.dueDate)}` : "No due date"} /></li>)}</ul> : <div className="p-4"><EmptyState title="No open tasks" /></div>}</Card>
          </section>
        </div>
        <div className="space-y-5">
          <section>
            <SectionTitle>Activity history</SectionTitle>
            <Card>
              <ActivityForm clientId={c.id} />
              <ul className="mt-3 space-y-2 border-t border-rule pt-3 text-[14px]">
                {c.activities.map((a) => <li key={a.id}><div className="muted text-[12px]">{fmtDateTime(a.occurredAt, tz)} · {a.kind}</div><div className="whitespace-pre-wrap">{a.body}</div></li>)}
                {c.activities.length === 0 && <li className="muted">Nothing logged yet.</li>}
              </ul>
            </Card>
          </section>
          <section>
            <SectionTitle action={<Link href={`/add/note?ws=business&clientId=${c.id}&back=/clients/${c.id}`} className="btn btn-ghost btn-sm">Add note</Link>}>Notes</SectionTitle>
            <Card className="p-0">{notes.length ? <ul className="px-4">{notes.map((n) => <li key={n.id}><RowLink href={`/notes/${n.id}`} title={n.title ?? n.body.slice(0, 60)} subtitle={fmtDate(n.updatedAt.toISOString().slice(0, 10))} /></li>)}</ul> : <div className="p-4"><EmptyState title="No notes" /></div>}</Card>
          </section>
          {c.notes && <section><SectionTitle>Client notes</SectionTitle><Card><p className="whitespace-pre-wrap text-[14px]">{c.notes}</p></Card></section>}
          {c.billingAddress && <section><SectionTitle>Billing address</SectionTitle><Card><p className="whitespace-pre-wrap text-[14px]">{c.billingAddress}</p></Card></section>}
        </div>
      </div>
    </div>
  );
}
