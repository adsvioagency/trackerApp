import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCtx } from "@/lib/current";
import { listAccounts } from "@/lib/money/accounts";
import { getCategoryTree } from "@/lib/money/categories";
import { recentAccountIds } from "@/lib/money/accounts";
import { recentMerchants } from "@/lib/money/transactions";
import { listClients } from "@/lib/business/clients";
import { listProjects } from "@/lib/business/projects";
import { listInvoices } from "@/lib/business/documents";
import { listGoals } from "@/lib/money/goals";
import { ExpenseForm, IncomeForm, TransferForm, type MoneyFormData } from "@/components/quick-add/money-forms";
import { TaskForm, NoteForm, EventForm, type WorkFormData } from "@/components/quick-add/work-forms";
import { PaymentForm, ClientForm, ProjectForm } from "@/components/quick-add/business-forms";

export const metadata: Metadata = { title: "Add" };

const KINDS = ["expense", "refund", "income", "owner-draw", "owner-contribution", "transfer", "task", "note", "event", "payment", "client", "project"] as const;

export default async function AddPage({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { kind } = await params;
  const sp = await searchParams;
  if (!(KINDS as readonly string[]).includes(kind)) notFound();
  const ctx = await getCtx();
  const { user, today } = ctx;
  const businessOnly = ["payment", "client", "project", "owner-draw", "owner-contribution"].includes(kind);
  const workspace: "personal" | "business" = businessOnly ? "business" : sp.ws === "business" ? "business" : sp.ws === "personal" ? "personal" : ctx.view === "business" ? "business" : "personal";
  const backHref = sp.back && sp.back.startsWith("/") ? sp.back : "/today";

  if (["expense", "refund", "income", "owner-draw", "owner-contribution", "transfer"].includes(kind)) {
    const [accounts, allAccounts, tree, recents, merchants, clients, projects, goals] = await Promise.all([
      listAccounts(user.id, workspace),
      listAccounts(user.id, "combined"),
      getCategoryTree(user.id, workspace),
      recentAccountIds(user.id, workspace),
      recentMerchants(user.id, workspace),
      workspace === "business" ? listClients(user.id) : Promise.resolve([]),
      workspace === "business" ? listProjects(user.id, { status: "open" }) : Promise.resolve([]),
      listGoals(user.id, workspace),
    ]);
    const data: MoneyFormData = {
      workspace,
      accounts: accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency, type: a.type, workspace: a.workspace, balanceMinor: a.balanceMinor })),
      tree,
      today,
      recentAccountIds: recents,
      recentMerchants: merchants,
      clients: clients.map((c) => ({ id: c.id, name: c.company })),
      projects: projects.map((p) => ({ id: p.id, name: p.name, clientId: p.clientId })),
      goals: goals.map((g) => ({ id: g.id, name: g.name, accountId: g.accountId })),
      backHref,
    };
    if (kind === "expense") return <ExpenseForm data={data} />;
    if (kind === "refund") return <ExpenseForm data={data} kind="refund" />;
    if (kind === "owner-draw") return <ExpenseForm data={data} kind="owner_draw" />;
    if (kind === "income") return <IncomeForm data={data} />;
    if (kind === "owner-contribution") return <IncomeForm data={data} kind="owner_contribution" />;
    return <TransferForm data={data} allAccounts={allAccounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency, type: a.type, workspace: a.workspace, balanceMinor: a.balanceMinor }))} />;
  }

  if (["task", "note", "event"].includes(kind)) {
    const [clients, projects] = await Promise.all([workspace === "business" ? listClients(user.id) : Promise.resolve([]), workspace === "business" ? listProjects(user.id, { status: "open" }) : Promise.resolve([])]);
    const data: WorkFormData = { workspace, today, clients: clients.map((c) => ({ id: c.id, name: c.company })), projects: projects.map((p) => ({ id: p.id, name: p.name, clientId: p.clientId })), backHref, defaults: sp };
    if (kind === "task") return <TaskForm data={data} />;
    if (kind === "note") return <NoteForm data={data} />;
    return <EventForm data={data} />;
  }

  if (kind === "payment") {
    const [accounts, clients, projects, invoices] = await Promise.all([listAccounts(user.id, "business"), listClients(user.id), listProjects(user.id, { status: "all" }), listInvoices(user.id, { status: "open", today })]);
    return (
      <PaymentForm
        data={{
          accounts: accounts.filter((a) => a.type !== "credit_card" && a.type !== "loan").map((a) => ({ id: a.id, name: a.name, currency: a.currency, type: a.type, workspace: a.workspace, balanceMinor: a.balanceMinor })),
          clients: clients.map((c) => ({ id: c.id, name: c.company })),
          projects: projects.map((p) => ({ id: p.id, name: p.name, clientId: p.clientId, currency: p.currency })),
          invoices: invoices.map((i) => ({ id: i.id, number: i.number, title: i.title, clientId: i.clientId, projectId: i.projectId, currency: i.currency, balanceMinor: i.balanceMinor, dueDate: i.dueDate })),
          today,
          backHref,
          defaults: { invoiceId: sp.invoice, projectId: sp.project, clientId: sp.client },
        }}
      />
    );
  }
  if (kind === "client") return <ClientForm backHref={backHref} today={today} />;
  const clients = await listClients(user.id);
  return <ProjectForm clients={clients.map((c) => ({ id: c.id, name: c.company }))} backHref={backHref} today={today} defaultClientId={sp.client} />;
}
