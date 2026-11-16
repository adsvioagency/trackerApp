import type { Metadata } from "next";
import Link from "next/link";
import { getCtx } from "@/lib/current";
import { PageHeader, Card, EmptyState, Pill, RowLink, Money } from "@/components/ui";
import { listClients } from "@/lib/business/clients";
import { listProjects } from "@/lib/business/projects";
import { listTasks } from "@/lib/tasks";
import { listNotes } from "@/lib/notes";
import { listTransactions, TX_KIND_LABEL } from "@/lib/money/transactions";
import { listInvoices, listProposals } from "@/lib/business/documents";
import { SearchBox } from "./search-box";
import { fmtDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { user, today } = await getCtx();
  const query = q.trim();
  const lower = query.toLowerCase();
  const results = query
    ? await Promise.all([
        listClients(user.id, { search: query, includeArchived: true }),
        listProjects(user.id, { status: "all", includeArchived: true, search: query }),
        listTasks(user.id, { status: "all", search: query, limit: 50 }),
        listNotes(user.id, { search: query, includeArchived: true, limit: 50 }),
        listTransactions(user.id, { search: query, limit: 50 }),
        listInvoices(user.id, { status: "all", today }).then((r) => r.filter((i) => `${i.number} ${i.title} ${i.clientName}`.toLowerCase().includes(lower)).slice(0, 30)),
        listProposals(user.id).then((r) => r.filter((p) => `${p.number} ${p.title} ${p.clientName}`.toLowerCase().includes(lower)).slice(0, 30)),
      ])
    : null;
  const total = results ? results.reduce((s, r) => s + r.length, 0) : 0;
  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader title="Search" description="Clients, projects, tasks, notes, transactions, proposals and invoices." />
      <SearchBox initial={query} />
      {!query ? null : total === 0 ? (
        <Card className="mt-4"><EmptyState title={`Nothing found for “${query}”`} /></Card>
      ) : (
        <div className="mt-4 space-y-4">
          {results![0].length > 0 && <Section title="Clients">{results![0].map((c) => <RowLink key={c.id} href={`/clients/${c.id}`} title={c.company} subtitle={[c.contactName, c.email].filter(Boolean).join(" · ")} badge={<Pill>{c.status}</Pill>} />)}</Section>}
          {results![1].length > 0 && <Section title="Projects">{results![1].map((p) => <RowLink key={p.id} href={`/projects/${p.id}`} title={p.name} subtitle={p.clientName} badge={<Pill>{p.status}</Pill>} />)}</Section>}
          {results![2].length > 0 && <Section title="Tasks">{results![2].map((t) => <RowLink key={t.id} href={`/tasks?task=${t.id}`} title={t.title} subtitle={t.dueDate ? `Due ${fmtDate(t.dueDate)}` : "No date"} badge={<Pill tone={t.status === "done" ? "ok" : "neutral"}>{t.status}</Pill>} />)}</Section>}
          {results![3].length > 0 && <Section title="Notes">{results![3].map((n) => <RowLink key={n.id} href={`/notes/${n.id}`} title={n.title ?? n.body.slice(0, 60)} subtitle={n.body.slice(0, 100)} />)}</Section>}
          {results![4].length > 0 && <Section title="Transactions">{results![4].map((t) => <RowLink key={t.id} href={`/money/transactions/${t.id}`} title={t.merchant ?? TX_KIND_LABEL[t.kind]} subtitle={`${fmtDate(t.date)} · ${t.accountName}`} right={<Money minor={t.amountMinor} currency={t.currency} />} />)}</Section>}
          {results![6].length > 0 && <Section title="Proposals">{results![6].map((p) => <RowLink key={p.id} href={`/documents/proposals/${p.id}`} title={`${p.number} · ${p.title}`} subtitle={p.clientName} badge={<Pill>{p.status}</Pill>} />)}</Section>}
          {results![5].length > 0 && <Section title="Invoices">{results![5].map((i) => <RowLink key={i.id} href={`/documents/invoices/${i.id}`} title={`${i.number} · ${i.title}`} subtitle={i.clientName} badge={<Pill>{i.status}</Pill>} right={<Money minor={i.balanceMinor} currency={i.currency} />} />)}</Section>}
        </div>
      )}
      {!query && <p className="muted mt-4 text-[13px]">Tip: on desktop, press <kbd className="rounded border border-rule px-1">/</kbd> anywhere to jump here.</p>}
      <Link href="/today" className="sr-only">Back to Today</Link>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 text-[13px] font-bold uppercase tracking-[0.08em] text-ink-soft">{title}</h2>
      <Card className="p-0"><ul className="px-4">{children}</ul></Card>
    </section>
  );
}
