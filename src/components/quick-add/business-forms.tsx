"use client";

import { useMemo, useState } from "react";
import { Field, Notice, Money } from "@/components/ui";
import { AccountSelect, type AccountOption } from "@/components/pickers";
import { QuickForm } from "./frame";
import { addClientAction, addPaymentAction, addProjectAction } from "@/app/(app)/add/actions";
import { DEFAULT_PHASES } from "@/lib/business/phases";

export type InvoiceRef = { id: string; number: string; title: string; clientId: string; projectId: string | null; currency: string; balanceMinor: number; dueDate: string | null };
export type ProjectRef = { id: string; name: string; clientId: string; currency: string };
export type ClientRef = { id: string; name: string };

export function PaymentForm({ data }: { data: { accounts: AccountOption[]; clients: ClientRef[]; projects: ProjectRef[]; invoices: InvoiceRef[]; today: string; backHref: string; defaults?: { invoiceId?: string; projectId?: string; clientId?: string } } }) {
  const d = data.defaults ?? {};
  const initialInvoice = data.invoices.find((i) => i.id === d.invoiceId);
  const [clientId, setClientId] = useState(initialInvoice?.clientId ?? d.clientId ?? data.projects.find((p) => p.id === d.projectId)?.clientId ?? data.clients[0]?.id ?? "");
  const [invoiceId, setInvoiceId] = useState(initialInvoice?.id ?? "");
  const [projectId, setProjectId] = useState(initialInvoice?.projectId ?? d.projectId ?? "");
  const invoices = data.invoices.filter((i) => i.clientId === clientId);
  const projects = data.projects.filter((p) => p.clientId === clientId);
  const invoice = data.invoices.find((i) => i.id === invoiceId);
  const [currency, setCurrency] = useState(invoice?.currency ?? projects.find((p) => p.id === projectId)?.currency ?? "USD");
  const effectiveCurrency = invoice?.currency ?? currency;
  const [accountId, setAccountId] = useState(data.accounts.find((a) => a.currency === effectiveCurrency)?.id ?? data.accounts[0]?.id ?? "");
  const account = useMemo(() => data.accounts.find((a) => a.id === accountId), [data.accounts, accountId]);
  const needsDop = effectiveCurrency !== "DOP";
  const dopRequired = needsDop && account?.currency === "DOP";

  if (!data.accounts.length) {
    return (
      <QuickForm action={addPaymentAction} title="Record client payment" workspace="business" backHref={data.backHref}>
        {() => <Notice tone="warn">Add a Business account first (Money → Accounts) so the payment has somewhere to land.</Notice>}
      </QuickForm>
    );
  }
  if (!data.clients.length) {
    return (
      <QuickForm action={addPaymentAction} title="Record client payment" workspace="business" backHref={data.backHref}>
        {() => <Notice tone="warn">Add a client first.</Notice>}
      </QuickForm>
    );
  }
  return (
    <QuickForm action={addPaymentAction} title="Record client payment" workspace="business" backHref={data.backHref} doneHref={invoiceId ? `/documents/invoices/${invoiceId}` : projectId ? `/projects/${projectId}` : "/money/transactions"} submitLabel="Record payment" hiddenFields={{ currency: effectiveCurrency }}>
      {() => (
        <>
          <Field label="Client" htmlFor="clientId">
            <select id="clientId" name="clientId" className="select" value={clientId} onChange={(e) => { setClientId(e.target.value); setInvoiceId(""); setProjectId(""); }} required>
              {data.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Invoice (optional)" htmlFor="invoiceId">
              <select id="invoiceId" name="invoiceId" className="select" value={invoiceId} onChange={(e) => { const inv = data.invoices.find((i) => i.id === e.target.value); setInvoiceId(e.target.value); if (inv) { setProjectId(inv.projectId ?? ""); setCurrency(inv.currency); } }}>
                <option value="">No invoice (project or general)</option>
                {invoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.number} · {i.title} · {i.balanceMinor / 100} {i.currency} left
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Project (optional)" htmlFor="projectId">
              <select id="projectId" name="projectId" className="select" value={projectId} onChange={(e) => { setProjectId(e.target.value); const p = projects.find((x) => x.id === e.target.value); if (p && !invoice) setCurrency(p.currency); }} disabled={!!invoice}>
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {invoice && (
            <Notice tone="neutral">
              {invoice.number}: <Money minor={invoice.balanceMinor} currency={invoice.currency} /> still due{invoice.dueDate ? ` by ${invoice.dueDate}` : ""}. Partial payments are fine.
            </Notice>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Amount received" htmlFor="amount" className="col-span-2">
              <input id="amount" name="amount" className="input text-[20px] font-bold" inputMode="decimal" placeholder="0.00" required autoFocus defaultValue={invoice ? (invoice.balanceMinor / 100).toFixed(2) : ""} />
            </Field>
            <Field label="Currency" htmlFor="currencyPick">
              <select id="currencyPick" className="select" value={effectiveCurrency} onChange={(e) => setCurrency(e.target.value)} disabled={!!invoice}>
                <option value="USD">US$</option>
                <option value="DOP">RD$</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" htmlFor="date">
              <input id="date" name="date" type="date" className="input" defaultValue={data.today} required />
            </Field>
            <Field label="Method" htmlFor="method">
              <select id="method" name="method" className="select" defaultValue="transfer">
                <option value="transfer">Bank transfer</option>
                <option value="zelle">Zelle</option>
                <option value="cash">Cash</option>
                <option value="paypal">PayPal</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </select>
            </Field>
          </div>
          <Field label="Deposited to (Business account)" htmlFor="accountId">
            <AccountSelect accounts={data.accounts} id="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)} />
          </Field>
          {needsDop && (
            <Field label={dopRequired ? "DOP amount that landed in the account" : "DOP equivalent you calculated"} htmlFor="dopEquivalent" hint={dopRequired ? "Required because the account is in pesos." : "Used in DOP reports. The invoice stays in its original currency."}>
              <input id="dopEquivalent" name="dopEquivalent" className="input" inputMode="decimal" placeholder="e.g. 24,000.00" required={dopRequired} />
            </Field>
          )}
          <Field label="Note (optional)" htmlFor="note">
            <input id="note" name="note" className="input" />
          </Field>
        </>
      )}
    </QuickForm>
  );
}

export function ClientForm({ backHref, today }: { backHref: string; today: string }) {
  const [status, setStatus] = useState("prospect");
  void today;
  return (
    <QuickForm action={addClientAction} title="Add client or prospect" workspace="business" backHref={backHref} doneHref="/clients" recordHref={(id) => `/clients/${id}`}>
      {() => (
        <>
          <Field label="Company or client name" htmlFor="company">
            <input id="company" name="company" className="input" required autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact name" htmlFor="contactName">
              <input id="contactName" name="contactName" className="input" />
            </Field>
            <Field label="Preferred contact" htmlFor="preferredContact">
              <select id="preferredContact" name="preferredContact" className="select" defaultValue="whatsapp">
                <option value="whatsapp">WhatsApp</option>
                <option value="phone">Phone</option>
                <option value="email">Email</option>
                <option value="other">Other</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email" htmlFor="email">
              <input id="email" name="email" type="email" className="input" />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <input id="phone" name="phone" type="tel" className="input" placeholder="+1 809 000 0000" />
            </Field>
          </div>
          <Field label="Website" htmlFor="website">
            <input id="website" name="website" className="input" placeholder="https://" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status" htmlFor="status">
              <select id="status" name="status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="prospect">Prospect</option>
                <option value="active">Active client</option>
              </select>
            </Field>
            {status === "prospect" && (
              <Field label="Pipeline stage" htmlFor="pipelineStage">
                <select id="pipelineStage" name="pipelineStage" className="select" defaultValue="inquiry">
                  <option value="inquiry">Inquiry</option>
                  <option value="discussion">Discussion</option>
                  <option value="proposal_sent">Proposal sent</option>
                </select>
              </Field>
            )}
          </div>
          {status === "prospect" && (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Estimated value" htmlFor="estimate" className="col-span-2" hint="Prospect estimates stay outside confirmed receivables.">
                <input id="estimate" name="estimate" className="input" inputMode="decimal" />
              </Field>
              <Field label="Currency" htmlFor="estimateCurrency">
                <select id="estimateCurrency" name="estimateCurrency" className="select" defaultValue="USD">
                  <option value="USD">US$</option>
                  <option value="DOP">RD$</option>
                </select>
              </Field>
            </div>
          )}
          <Field label="Follow-up date (optional)" htmlFor="followUpDate">
            <input id="followUpDate" name="followUpDate" type="date" className="input" />
          </Field>
          <Field label="Billing address (optional)" htmlFor="billingAddress">
            <textarea id="billingAddress" name="billingAddress" className="textarea" rows={2} />
          </Field>
          <Field label="Notes" htmlFor="notes">
            <textarea id="notes" name="notes" className="textarea" rows={3} />
          </Field>
        </>
      )}
    </QuickForm>
  );
}

export function ProjectForm({ clients, backHref, today, defaultClientId }: { clients: ClientRef[]; backHref: string; today: string; defaultClientId?: string }) {
  if (!clients.length) {
    return (
      <QuickForm action={addProjectAction} title="New project" workspace="business" backHref={backHref}>
        {() => <Notice tone="warn">Add a client first, then create the project.</Notice>}
      </QuickForm>
    );
  }
  return (
    <QuickForm action={addProjectAction} title="New project" workspace="business" backHref={backHref} doneHref="/projects" recordHref={(id) => `/projects/${id}`} submitLabel="Create project">
      {() => (
        <>
          <Field label="Client" htmlFor="clientId">
            <select id="clientId" name="clientId" className="select" defaultValue={defaultClientId ?? clients[0].id} required>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Project name" htmlFor="name">
            <input id="name" name="name" className="input" required autoFocus placeholder="e.g. Shopify website" />
          </Field>
          <Field label="Brief" htmlFor="brief">
            <textarea id="brief" name="brief" className="textarea" rows={2} placeholder="One or two sentences on the goal." />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Agreed value" htmlFor="agreed" className="col-span-2">
              <input id="agreed" name="agreed" className="input" inputMode="decimal" placeholder="0.00" />
            </Field>
            <Field label="Currency" htmlFor="currency">
              <select id="currency" name="currency" className="select" defaultValue="USD">
                <option value="USD">US$</option>
                <option value="DOP">RD$</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date" htmlFor="startDate">
              <input id="startDate" name="startDate" type="date" className="input" defaultValue={today} />
            </Field>
            <Field label="Target date" htmlFor="targetDate">
              <input id="targetDate" name="targetDate" type="date" className="input" />
            </Field>
          </div>
          <Field label="Next action" htmlFor="nextAction">
            <input id="nextAction" name="nextAction" className="input" placeholder="e.g. Send content checklist" />
          </Field>
          <Field label="Phases (one per line)" htmlFor="phases" hint="Default for agency website work. Edit freely.">
            <textarea id="phases" name="phases" className="textarea" rows={7} defaultValue={DEFAULT_PHASES.join("\n")} />
          </Field>
        </>
      )}
    </QuickForm>
  );
}
