import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCtx } from "@/lib/current";
import { getProject, projectFinance, PROJECT_STATUS_LABEL } from "@/lib/business/projects";
import { listInvoices, listProposals } from "@/lib/business/documents";
import { listPayments } from "@/lib/business/payments";
import { listTasks } from "@/lib/tasks";
import { listNotes } from "@/lib/notes";
import { listTransactions } from "@/lib/money/transactions";
import { Card, Pill, Money, RowLink, EmptyState, SectionTitle, Notice } from "@/components/ui";
import { ProjectHeader, ProjectPhases, ProjectDeliverables, ProjectDependencies, ProjectInstallments, ProjectFiles } from "./project-detail";
import { fmtDate } from "@/lib/dates";
import { fmtMoney } from "@/lib/money/format";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, today } = await getCtx();
  const p = await getProject(user.id, id);
  if (!p) notFound();
  const [f, invoices, proposals, payments, tasks, notes, costs] = await Promise.all([projectFinance(user.id, id), listInvoices(user.id, { projectId: id, status: "all", today }), listProposals(user.id, { projectId: id }), listPayments(user.id, { projectId: id }), listTasks(user.id, { projectId: id, status: "open" }), listNotes(user.id, { projectId: id }), listTransactions(user.id, { projectId: id, kind: "spending", limit: 50 })]);
  const waiting = p.waitingOnClient || p.status === "waiting_client";
  return (
    <div>
      <Link href="/projects" className="btn btn-ghost btn-sm -ml-2 mb-2"><ArrowLeft className="size-4" /> Projects</Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[28px] font-extrabold">{p.name}</h1>
            <Pill tone={p.status === "completed" ? "ok" : waiting ? "warn" : "mango"}>{waiting ? "Waiting on client" : PROJECT_STATUS_LABEL[p.status]}</Pill>
            {p.currentPhase && <Pill tone="teal">{p.currentPhase.name}</Pill>}
            {p.archivedAt && <Pill>Archived</Pill>}
          </div>
          <div className="muted mt-1 text-[14px]"><Link href={`/clients/${p.clientId}`} className="font-semibold text-ink hover:underline">{p.client.company}</Link>{p.startDate ? ` · started ${fmtDate(p.startDate)}` : ""}{p.targetDate ? ` · target ${fmtDate(p.targetDate)}${p.targetDate < today && p.status !== "completed" ? " (past)" : ""}` : ""}</div>
          {p.nextAction && <div className="mt-1 text-[14px]"><span className="font-semibold">Next action:</span> {p.nextAction}</div>}
          {waiting && <Notice tone="warn" className="mt-2">Waiting on the client{p.waitingSince ? ` since ${fmtDate(p.waitingSince)}` : ""}{p.waitingNote ? `: ${p.waitingNote}` : "."}{p.followUpDate ? ` Follow up ${fmtDate(p.followUpDate)}.` : ""}</Notice>}
        </div>
        <ProjectHeader project={{ id: p.id, name: p.name, brief: p.brief, scope: p.scope, status: p.status, startDate: p.startDate, targetDate: p.targetDate, agreedValueMinor: p.agreedValueMinor, currency: p.currency, nextAction: p.nextAction, notes: p.notes, waitingOnClient: waiting, waitingNote: p.waitingNote, followUpDate: p.followUpDate, archived: !!p.archivedAt }} today={today} />
      </div>

      <section id="money">
        <SectionTitle>Money · {p.currency}</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {[
            ["Agreed value", f.agreedMinor, ""],
            ["Invoiced & outstanding", f.outstandingMinor, `${fmtMoney(f.invoicedMinor, f.currency)} invoiced`],
            ["Overdue", f.overdueMinor, f.overdueMinor ? "past due date" : "none"],
            ["Scheduled, to invoice", f.scheduledToInvoiceMinor, "planned installments"],
            ["Received", f.receivedMinor, f.receivedDopMinor ? `≈ ${fmtMoney(f.receivedDopMinor)}${f.receivedMissingDop ? ` (+${f.receivedMissingDop} need RD$)` : ""}` : ""],
            ["Left to collect", Math.max(0, f.agreedMinor - f.receivedMinor), `${fmtMoney(f.uninvoicedMinor, f.currency)} not yet scheduled`],
          ].map(([label, v, hint]) => (
            <div key={label as string} className="card p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{label as string}</div>
              <div className={`mt-1 font-display text-[18px] font-extrabold ${label === "Overdue" && (v as number) > 0 ? "text-danger" : ""}`}><Money minor={v as number} currency={f.currency} /></div>
              {hint ? <div className="muted text-[11px]">{hint as string}</div> : null}
            </div>
          ))}
        </div>
        <p className="muted mt-2 text-[12px]">Project costs recorded: {Object.entries(f.costsByCurrency).map(([c, v]) => fmtMoney(v, c)).join(", ") || "none"} · Collected income, costs and owner movements are reported separately in Business Money.</p>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <section id="phases">
            <SectionTitle>Phases &amp; delivery</SectionTitle>
            <Card>
              <ProjectPhases projectId={p.id} phases={p.phases.map((ph) => ({ id: ph.id, name: ph.name, sort: ph.sort, completed: !!ph.completedAt, targetDate: ph.targetDate }))} currentPhaseId={p.currentPhase?.id ?? null} />
            </Card>
          </section>
          <section>
            <SectionTitle>Deliverables</SectionTitle>
            <Card><ProjectDeliverables projectId={p.id} items={p.deliverables} /></Card>
          </section>
          <section>
            <SectionTitle>Client dependencies</SectionTitle>
            <Card><ProjectDependencies projectId={p.id} items={p.dependencies} today={today} /></Card>
          </section>
          {(p.brief || p.scope) && (
            <section>
              <SectionTitle>Brief &amp; scope</SectionTitle>
              <Card className="space-y-2 text-[14px]">{p.brief && <p className="whitespace-pre-wrap">{p.brief}</p>}{p.scope && <p className="muted whitespace-pre-wrap">{p.scope}</p>}</Card>
            </section>
          )}
        </div>
        <div className="space-y-5">
          <section id="payments">
            <SectionTitle action={<Link href={`/add/payment?project=${p.id}&back=/projects/${p.id}`} className="btn btn-primary btn-sm">Record payment</Link>}>Payment schedule</SectionTitle>
            <Card>
              <ProjectInstallments projectId={p.id} currency={p.currency} items={p.installments.map((i) => ({ id: i.id, label: i.label, amountMinor: i.amountMinor, dueDate: i.dueDate, status: i.status, invoiceId: i.invoiceId }))} invoices={invoices.map((i) => ({ id: i.id, number: i.number, status: i.status, balanceMinor: i.balanceMinor, totalMinor: i.totalMinor, dueDate: i.dueDate, overdue: i.overdue }))} today={today} />
            </Card>
          </section>
          <section>
            <SectionTitle action={<Link href={`/documents/new?project=${p.id}`} className="btn btn-ghost btn-sm">New document</Link>}>Documents</SectionTitle>
            <Card className="p-0">
              {proposals.length + invoices.length === 0 ? <div className="p-4"><EmptyState title="No proposal or invoice yet" /></div> : (
                <ul className="px-4">
                  {proposals.map((d) => <li key={d.id}><RowLink href={`/documents/proposals/${d.id}`} title={`${d.number} · ${d.title}`} subtitle={`Proposal · ${fmtDate(d.issueDate)}`} badge={<Pill tone={d.status === "approved" ? "ok" : d.status === "sent" ? "mango" : "neutral"}>{d.status}</Pill>} right={<Money minor={d.totalMinor} currency={d.currency} />} /></li>)}
                  {invoices.map((i) => <li key={i.id}><RowLink href={`/documents/invoices/${i.id}`} title={`${i.number} · ${i.title}`} subtitle={`Invoice · ${fmtDate(i.issueDate)}${i.dueDate ? ` · due ${fmtDate(i.dueDate)}` : ""}`} badge={<Pill tone={i.overdue ? "danger" : i.status === "paid" ? "ok" : i.status === "issued" ? "mango" : "neutral"}>{i.overdue ? "overdue" : i.status}</Pill>} right={<Money minor={i.status === "paid" ? i.totalMinor : i.balanceMinor} currency={i.currency} />} /></li>)}
                </ul>
              )}
            </Card>
          </section>
          <section>
            <SectionTitle>Payments received</SectionTitle>
            <Card className="p-0">
              {payments.length === 0 ? <div className="p-4"><EmptyState title="No payments yet" /></div> : (
                <ul className="px-4">{payments.map((pay) => <li key={pay.id}><RowLink href={pay.transactionId ? `/money/transactions/${pay.transactionId}` : "#"} title={`${fmtDate(pay.date)}${pay.invoiceNumber ? ` · ${pay.invoiceNumber}` : ""}`} subtitle={`${pay.method ?? "payment"}${pay.dopEquivalentMinor != null ? ` · ≈ ${fmtMoney(pay.dopEquivalentMinor)}` : pay.currency !== "DOP" ? " · needs RD$ equivalent" : ""}`} right={<Money minor={pay.amountMinor} currency={pay.currency} className="font-semibold text-ok" />} /></li>)}</ul>
              )}
            </Card>
          </section>
          <section>
            <SectionTitle action={<Link href={`/add/task?ws=business&projectId=${p.id}&clientId=${p.clientId}&back=/projects/${p.id}`} className="btn btn-ghost btn-sm">Add task</Link>}>Open tasks</SectionTitle>
            <Card className="p-0">{tasks.length ? <ul className="px-4">{tasks.map((t) => <li key={t.id}><RowLink href={`/tasks?task=${t.id}`} title={t.title} subtitle={t.dueDate ? `Due ${fmtDate(t.dueDate)}${t.dueDate < today ? " · overdue" : ""}` : "No due date"} /></li>)}</ul> : <div className="p-4"><EmptyState title="No open tasks" /></div>}</Card>
          </section>
          <section>
            <SectionTitle action={<Link href={`/add/note?ws=business&projectId=${p.id}&clientId=${p.clientId}&back=/projects/${p.id}`} className="btn btn-ghost btn-sm">Add note</Link>}>Notes &amp; files</SectionTitle>
            <Card>
              {notes.length > 0 && <ul className="mb-3 space-y-1 text-[14px]">{notes.map((n) => <li key={n.id}><Link href={`/notes/${n.id}`} className="font-medium hover:underline">{n.title ?? n.body.slice(0, 60)}</Link></li>)}</ul>}
              <ProjectFiles projectId={p.id} files={p.files.map((fl) => ({ id: fl.id, filename: fl.filename, label: fl.label, mime: fl.mime }))} />
            </Card>
          </section>
          {costs.length > 0 && (
            <section>
              <SectionTitle>Project costs</SectionTitle>
              <Card className="p-0"><ul className="px-4">{costs.map((t) => <li key={t.id}><RowLink href={`/money/transactions/${t.id}`} title={t.merchant ?? t.categoryName ?? "Expense"} subtitle={fmtDate(t.date)} right={<Money minor={t.kind === "refund" ? t.amountMinor : -t.amountMinor} currency={t.currency} signed />} /></li>)}</ul></Card>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
