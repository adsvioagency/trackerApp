import "server-only";
import { and, desc, eq, inArray, like, ne, sql } from "drizzle-orm";
import { getDb, schema, type Db } from "@/db";
import type { DocInstallment, DocLine, DocSnapshot, DocTax } from "@/db/schema";
import { computeTotals, installmentAmounts } from "./doc-math";
import { makeSnapshot, type SnapshotSource } from "./snapshot";
import { logActivity } from "@/lib/activity";
import { fmtMoney } from "@/lib/money/format";
import { shortId } from "@/lib/ids";
import { addDaysISO } from "@/lib/dates";

export type Proposal = typeof schema.proposals.$inferSelect;
export type Invoice = typeof schema.invoices.$inferSelect;

export const DEFAULT_PAYMENT_TERMS = "Deposit due to begin; balance due before launch. Prices in US dollars. Work beyond the agreed scope is quoted for approval.";
export const DEFAULT_PAYMENT_INSTRUCTIONS = "Pay by bank transfer or Zelle, as discussed. Please reference the document number.";
export const DEFAULT_EXCLUSIONS = "Third-party fees (hosting, domain, paid themes or apps, transaction fees, printing) are paid directly to providers and are not included.";
export const DEFAULT_REVISIONS = "Two revision rounds are included per deliverable.";

async function nextNumber(db: Db, userId: string, kind: "proposal" | "invoice", issueDate: string) {
  const year = issueDate.slice(0, 4);
  const prefix = kind === "proposal" ? `P-${year}-` : `INV-${year}-`;
  const table = kind === "proposal" ? schema.proposals : schema.invoices;
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(table)
    .where(and(eq(table.userId, userId), like(table.number, `${prefix}%`)));
  let n = Number(rows[0]?.n ?? 0) + 1;
  // Guard against gaps/duplicates.
  for (let i = 0; i < 50; i++) {
    const candidate = `${prefix}${String(n).padStart(3, "0")}`;
    const exists = await db.select({ id: table.id }).from(table).where(and(eq(table.userId, userId), eq(table.number, candidate))).limit(1);
    if (!exists.length) return candidate;
    n++;
  }
  return `${prefix}${Date.now()}`;
}

export type ProposalInput = {
  clientId: string;
  projectId?: string | null;
  title: string;
  subtitle?: string | null;
  intro?: string | null;
  issueDate: string;
  validUntil?: string | null;
  currency?: string;
  lines: DocLine[];
  projectDiscountMinor?: number;
  taxes?: DocTax[];
  exclusions?: string | null;
  revisionLimit?: string | null;
  paymentTerms?: string | null;
  paymentInstructions?: string | null;
  timingNotes?: string | null;
  installments?: DocInstallment[];
  notes?: string | null;
};

function normalizeLines(lines: DocLine[]): DocLine[] {
  return lines
    .filter((l) => l.title?.trim())
    .map((l, i) => ({
      ...l,
      id: l.id || shortId(),
      title: l.title.trim(),
      description: l.description?.trim() || undefined,
      quantity: Number.isFinite(l.quantity) && l.quantity > 0 ? l.quantity : 1,
      rateMinor: Math.max(0, Math.round(l.rateMinor || 0)),
      standardRateMinor: l.standardRateMinor ? Math.round(l.standardRateMinor) : null,
      discountMinor: Math.max(0, Math.round(l.discountMinor ?? 0)),
      optional: l.kind === "maintenance" ? true : !!l.optional,
      selected: l.kind === "maintenance" || l.optional ? !!l.selected : undefined,
      sort: i,
    }));
}

export async function createProposal(userId: string, input: ProposalInput) {
  const db = await getDb();
  const client = await db.query.clients.findFirst({ where: and(eq(schema.clients.id, input.clientId), eq(schema.clients.userId, userId)) });
  if (!client) throw new Error("Client not found.");
  const number = await nextNumber(db, userId, "proposal", input.issueDate);
  const [p] = await db
    .insert(schema.proposals)
    .values({
      userId,
      clientId: input.clientId,
      projectId: input.projectId ?? null,
      number,
      title: input.title.trim(),
      subtitle: input.subtitle?.trim() || null,
      intro: input.intro?.trim() || null,
      issueDate: input.issueDate,
      validUntil: input.validUntil ?? null,
      currency: input.currency ?? "USD",
      lines: normalizeLines(input.lines),
      projectDiscountMinor: input.projectDiscountMinor ?? 0,
      taxes: input.taxes ?? [],
      exclusions: input.exclusions ?? DEFAULT_EXCLUSIONS,
      revisionLimit: input.revisionLimit ?? DEFAULT_REVISIONS,
      paymentTerms: input.paymentTerms ?? DEFAULT_PAYMENT_TERMS,
      paymentInstructions: input.paymentInstructions ?? DEFAULT_PAYMENT_INSTRUCTIONS,
      timingNotes: input.timingNotes ?? null,
      installments: input.installments ?? [],
      notes: input.notes ?? null,
    })
    .returning();
  if (client.status === "prospect" && client.pipelineStage !== "won") await db.update(schema.clients).set({ pipelineStage: "proposal_sent" }).where(and(eq(schema.clients.id, client.id), eq(schema.clients.pipelineStage, "discussion")));
  await logActivity({ userId, workspace: "business", entityType: "proposal", entityId: p.id, action: "create", summary: `Created proposal ${p.number} · ${p.title} for ${client.company}` });
  return p;
}

export async function updateProposal(userId: string, id: string, patch: Partial<ProposalInput>) {
  const db = await getDb();
  const p = await db.query.proposals.findFirst({ where: and(eq(schema.proposals.id, id), eq(schema.proposals.userId, userId)) });
  if (!p) throw new Error("Proposal not found.");
  const set: Partial<typeof schema.proposals.$inferInsert> = { updatedAt: new Date() };
  for (const k of ["clientId", "projectId", "title", "subtitle", "intro", "issueDate", "validUntil", "currency", "projectDiscountMinor", "taxes", "exclusions", "revisionLimit", "paymentTerms", "paymentInstructions", "timingNotes", "installments", "notes"] as const) {
    if (patch[k] !== undefined) (set as Record<string, unknown>)[k] = patch[k];
  }
  if (patch.lines) set.lines = normalizeLines(patch.lines);
  await db.update(schema.proposals).set(set).where(eq(schema.proposals.id, id));
  await logActivity({ userId, workspace: "business", entityType: "proposal", entityId: id, action: "update", summary: `Edited proposal ${p.number}` });
}

export async function getProposal(userId: string, id: string) {
  const db = await getDb();
  const p = await db.query.proposals.findFirst({ where: and(eq(schema.proposals.id, id), eq(schema.proposals.userId, userId)) });
  if (!p) return null;
  const client = (await db.query.clients.findFirst({ where: eq(schema.clients.id, p.clientId) }))!;
  const project = p.projectId ? await db.query.projects.findFirst({ where: eq(schema.projects.id, p.projectId) }) : null;
  const invoices = await db.query.invoices.findMany({ where: eq(schema.invoices.proposalId, id), orderBy: [desc(schema.invoices.createdAt)] });
  return { ...p, client, project: project ?? null, invoices, totals: computeTotals(p.lines, p.projectDiscountMinor, p.taxes) };
}

export function buildSnapshot(doc: SnapshotSource, client: { company: string; contactName?: string | null; email?: string | null; billingAddress?: string | null }, project: { name: string } | null, docType: "proposal" | "invoice"): DocSnapshot {
  return makeSnapshot(doc, client, project, docType);
}

/** Mark sent: freezes a snapshot of the issued values and moves the pipeline. */
export async function markProposalSent(userId: string, id: string) {
  const db = await getDb();
  const p = await getProposal(userId, id);
  if (!p) throw new Error("Proposal not found.");
  const snapshot = p.snapshot ?? buildSnapshot(p, p.client, p.project, "proposal");
  await db.update(schema.proposals).set({ status: "sent", sentAt: p.sentAt ?? new Date(), snapshot, updatedAt: new Date() }).where(eq(schema.proposals.id, id));
  if (p.client.status === "prospect") await db.update(schema.clients).set({ pipelineStage: "proposal_sent" }).where(eq(schema.clients.id, p.clientId));
  await logActivity({ userId, workspace: "business", entityType: "proposal", entityId: id, action: "sent", summary: `Marked proposal ${p.number} as sent · ${fmtMoney(snapshot.totals.totalMinor, p.currency)}` });
}

/** Manual approval. Syncs the project's agreed value and planned installments when missing. */
export async function approveProposal(userId: string, id: string) {
  const db = await getDb();
  const p = await getProposal(userId, id);
  if (!p) throw new Error("Proposal not found.");
  const snapshot = p.snapshot ?? buildSnapshot(p, p.client, p.project, "proposal");
  await db.update(schema.proposals).set({ status: "approved", approvedAt: new Date(), sentAt: p.sentAt ?? new Date(), snapshot, updatedAt: new Date() }).where(eq(schema.proposals.id, id));
  await db.update(schema.clients).set({ status: "active", pipelineStage: "won" }).where(eq(schema.clients.id, p.clientId));
  if (p.projectId) {
    const project = p.project!;
    if (!project.agreedValueMinor) await db.update(schema.projects).set({ agreedValueMinor: snapshot.totals.totalMinor, currency: p.currency }).where(eq(schema.projects.id, p.projectId));
    const existing = await db.query.projectInstallments.findMany({ where: eq(schema.projectInstallments.projectId, p.projectId) });
    if (!existing.length && snapshot.installments?.length) {
      const amounts = installmentAmounts(snapshot.totals.totalMinor, snapshot.installments);
      await db.insert(schema.projectInstallments).values(amounts.map((a, i) => ({ userId, projectId: p.projectId!, label: a.installment.label, amountMinor: a.amountMinor, currency: p.currency, dueDate: a.installment.dueDate ?? null, sort: i })));
    }
  }
  await logActivity({ userId, workspace: "business", entityType: "proposal", entityId: id, action: "approved", summary: `Proposal ${p.number} approved · ${fmtMoney(snapshot.totals.totalMinor, p.currency)}` });
}

export async function setProposalStatus(userId: string, id: string, status: "declined" | "expired" | "draft") {
  const db = await getDb();
  await db.update(schema.proposals).set({ status, updatedAt: new Date() }).where(and(eq(schema.proposals.id, id), eq(schema.proposals.userId, userId)));
}

export type InvoiceInput = {
  clientId: string;
  projectId?: string | null;
  proposalId?: string | null;
  installmentId?: string | null;
  kind?: Invoice["kind"];
  title: string;
  issueDate: string;
  dueDate?: string | null;
  currency?: string;
  lines: DocLine[];
  projectDiscountMinor?: number;
  taxes?: DocTax[];
  paymentTerms?: string | null;
  paymentInstructions?: string | null;
  notes?: string | null;
};

export async function createInvoice(userId: string, input: InvoiceInput) {
  const db = await getDb();
  const client = await db.query.clients.findFirst({ where: and(eq(schema.clients.id, input.clientId), eq(schema.clients.userId, userId)) });
  if (!client) throw new Error("Client not found.");
  const number = await nextNumber(db, userId, "invoice", input.issueDate);
  const lines = normalizeLines(input.lines);
  const totals = computeTotals(lines, input.projectDiscountMinor ?? 0, input.taxes ?? []);
  const [inv] = await db
    .insert(schema.invoices)
    .values({
      userId,
      clientId: input.clientId,
      projectId: input.projectId ?? null,
      proposalId: input.proposalId ?? null,
      installmentId: input.installmentId ?? null,
      number,
      kind: input.kind ?? "custom",
      title: input.title.trim(),
      issueDate: input.issueDate,
      dueDate: input.dueDate ?? addDaysISO(input.issueDate, 14),
      currency: input.currency ?? "USD",
      lines,
      projectDiscountMinor: input.projectDiscountMinor ?? 0,
      taxes: input.taxes ?? [],
      paymentTerms: input.paymentTerms ?? null,
      paymentInstructions: input.paymentInstructions ?? DEFAULT_PAYMENT_INSTRUCTIONS,
      notes: input.notes ?? null,
      totalMinor: totals.totalMinor,
    })
    .returning();
  await logActivity({ userId, workspace: "business", entityType: "invoice", entityId: inv.id, action: "create", summary: `Created invoice ${inv.number} · ${fmtMoney(totals.totalMinor, inv.currency)} for ${client.company}` });
  return inv;
}

export async function updateInvoice(userId: string, id: string, patch: Partial<InvoiceInput>) {
  const db = await getDb();
  const inv = await db.query.invoices.findFirst({ where: and(eq(schema.invoices.id, id), eq(schema.invoices.userId, userId)) });
  if (!inv) throw new Error("Invoice not found.");
  if (inv.status !== "draft") {
    // Issued documents keep their values; only due date, notes and instructions can change.
    const set: Partial<typeof schema.invoices.$inferInsert> = { updatedAt: new Date() };
    if (patch.dueDate !== undefined) set.dueDate = patch.dueDate;
    if (patch.notes !== undefined) set.notes = patch.notes;
    await db.update(schema.invoices).set(set).where(eq(schema.invoices.id, id));
    return;
  }
  const set: Partial<typeof schema.invoices.$inferInsert> = { updatedAt: new Date() };
  for (const k of ["clientId", "projectId", "kind", "title", "issueDate", "dueDate", "currency", "projectDiscountMinor", "taxes", "paymentTerms", "paymentInstructions", "notes"] as const) {
    if (patch[k] !== undefined) (set as Record<string, unknown>)[k] = patch[k];
  }
  if (patch.lines) set.lines = normalizeLines(patch.lines);
  const lines = set.lines ?? inv.lines;
  set.totalMinor = computeTotals(lines, (set.projectDiscountMinor as number | undefined) ?? inv.projectDiscountMinor, (set.taxes as DocTax[] | undefined) ?? inv.taxes).totalMinor;
  await db.update(schema.invoices).set(set).where(eq(schema.invoices.id, id));
}

export async function getInvoice(userId: string, id: string) {
  const db = await getDb();
  const inv = await db.query.invoices.findFirst({ where: and(eq(schema.invoices.id, id), eq(schema.invoices.userId, userId)) });
  if (!inv) return null;
  const client = (await db.query.clients.findFirst({ where: eq(schema.clients.id, inv.clientId) }))!;
  const project = inv.projectId ? await db.query.projects.findFirst({ where: eq(schema.projects.id, inv.projectId) }) : null;
  const payments = await db.query.payments.findMany({ where: eq(schema.payments.invoiceId, id), orderBy: [desc(schema.payments.date)] });
  const paidMinor = payments.reduce((s, p) => s + p.amountMinor, 0);
  const totals = computeTotals(inv.lines, inv.projectDiscountMinor, inv.taxes);
  const total = inv.status === "draft" ? totals.totalMinor : inv.totalMinor;
  return { ...inv, client, project: project ?? null, payments, totals, paidMinor, balanceMinor: Math.max(0, total - paidMinor), effectiveTotalMinor: total };
}

/** Issue: freezes the snapshot and the amount requested. Moves a linked installment to invoiced. */
export async function issueInvoice(userId: string, id: string) {
  const db = await getDb();
  const inv = await getInvoice(userId, id);
  if (!inv) throw new Error("Invoice not found.");
  if (inv.status !== "draft") return;
  const snapshot = buildSnapshot({ ...inv, installments: [] }, inv.client, inv.project, "invoice");
  await db.update(schema.invoices).set({ status: "issued", issuedAt: new Date(), snapshot, totalMinor: snapshot.totals.totalMinor, updatedAt: new Date() }).where(eq(schema.invoices.id, id));
  if (inv.installmentId) await db.update(schema.projectInstallments).set({ status: "invoiced", invoiceId: id }).where(eq(schema.projectInstallments.id, inv.installmentId));
  await logActivity({ userId, workspace: "business", entityType: "invoice", entityId: id, action: "issued", summary: `Issued invoice ${inv.number} · ${fmtMoney(snapshot.totals.totalMinor, inv.currency)} due ${inv.dueDate ?? "on receipt"}` });
}

export async function voidInvoice(userId: string, id: string) {
  const db = await getDb();
  const inv = await getInvoice(userId, id);
  if (!inv) throw new Error("Invoice not found.");
  if (inv.payments.length) throw new Error("This invoice has payments recorded. Delete those payments first or keep the invoice.");
  await db.update(schema.invoices).set({ status: "void", voidedAt: new Date(), updatedAt: new Date() }).where(eq(schema.invoices.id, id));
  if (inv.installmentId) await db.update(schema.projectInstallments).set({ status: "planned", invoiceId: null }).where(eq(schema.projectInstallments.id, inv.installmentId));
  await logActivity({ userId, workspace: "business", entityType: "invoice", entityId: id, action: "void", summary: `Voided invoice ${inv.number}` });
}

/** Recompute paid/issued status from payments (called after recording or deleting payments). */
export async function refreshInvoiceStatus(userId: string, invoiceId: string) {
  const db = await getDb();
  const inv = await getInvoice(userId, invoiceId);
  if (!inv || inv.status === "void" || inv.status === "draft") return;
  const paid = inv.paidMinor >= inv.totalMinor && inv.totalMinor > 0;
  await db.update(schema.invoices).set({ status: paid ? "paid" : "issued", paidAt: paid ? inv.paidAt ?? new Date() : null }).where(eq(schema.invoices.id, invoiceId));
  if (inv.installmentId) await db.update(schema.projectInstallments).set({ status: paid ? "paid" : "invoiced" }).where(eq(schema.projectInstallments.id, inv.installmentId));
}

/**
 * Create an invoice from an approved/sent proposal.
 * - full: copies all included lines, discount and taxes.
 * - deposit/milestone/final: one line for the chosen installment amount.
 */
export async function createInvoiceFromProposal(userId: string, proposalId: string, opts: { installmentId?: string; kind?: Invoice["kind"]; issueDate: string; dueDate?: string | null; projectInstallmentId?: string | null }) {
  const p = await getProposal(userId, proposalId);
  if (!p) throw new Error("Proposal not found.");
  const snap = p.snapshot ?? buildSnapshot(p, p.client, p.project, "proposal");
  const base = { clientId: p.clientId, projectId: p.projectId, proposalId: p.id, currency: p.currency, paymentTerms: p.paymentTerms, paymentInstructions: p.paymentInstructions, issueDate: opts.issueDate, dueDate: opts.dueDate ?? null };
  if (!opts.installmentId || opts.kind === "full") {
    return createInvoice(userId, { ...base, kind: "full", title: p.title, lines: snap.lines.filter((l) => l.kind !== "third_party" && (!l.optional || l.selected)), projectDiscountMinor: snap.projectDiscountMinor, taxes: snap.taxes, installmentId: opts.projectInstallmentId ?? null });
  }
  const amounts = installmentAmounts(snap.totals.totalMinor, snap.installments ?? []);
  const hit = amounts.find((a) => a.installment.id === opts.installmentId);
  if (!hit) throw new Error("Installment not found on the proposal.");
  const kind = opts.kind ?? hit.installment.kind;
  return createInvoice(userId, {
    ...base,
    kind,
    title: `${p.title} · ${hit.installment.label}`,
    installmentId: opts.projectInstallmentId ?? null,
    lines: [{ id: shortId(), kind: "service", title: hit.installment.label, description: `${hit.installment.mode === "percent" ? `${hit.installment.value}% of ` : "Installment of "}proposal ${p.number} (${p.title}), total ${fmtMoney(snap.totals.totalMinor, p.currency)}.`, quantity: 1, rateMinor: hit.amountMinor, sort: 0 }],
    projectDiscountMinor: 0,
    taxes: [],
  });
}

/** Create an invoice straight from a project's planned installment. */
export async function createInvoiceFromInstallment(userId: string, installmentId: string, opts: { issueDate: string; dueDate?: string | null }) {
  const db = await getDb();
  const inst = await db.query.projectInstallments.findFirst({ where: and(eq(schema.projectInstallments.id, installmentId), eq(schema.projectInstallments.userId, userId)) });
  if (!inst) throw new Error("Installment not found.");
  if (inst.status !== "planned") throw new Error("This installment already has an invoice.");
  const project = (await db.query.projects.findFirst({ where: eq(schema.projects.id, inst.projectId) }))!;
  const kind: Invoice["kind"] = /deposit|begin/i.test(inst.label) ? "deposit" : /final|balance|launch/i.test(inst.label) ? "final" : "milestone";
  return createInvoice(userId, {
    clientId: project.clientId,
    projectId: project.id,
    installmentId: inst.id,
    kind,
    title: `${project.name} · ${inst.label}`,
    issueDate: opts.issueDate,
    dueDate: opts.dueDate ?? inst.dueDate ?? null,
    currency: inst.currency,
    lines: [{ id: shortId(), kind: "service", title: inst.label, description: `Installment for ${project.name}${project.agreedValueMinor ? ` (agreed value ${fmtMoney(project.agreedValueMinor, project.currency)})` : ""}.`, quantity: 1, rateMinor: inst.amountMinor, sort: 0 }],
  });
}

export async function listProposals(userId: string, opts: { clientId?: string; projectId?: string; status?: Proposal["status"] | "all" } = {}) {
  const db = await getDb();
  const rows = await db
    .select({ p: schema.proposals, clientName: schema.clients.company })
    .from(schema.proposals)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.proposals.clientId))
    .where(and(eq(schema.proposals.userId, userId), opts.clientId ? eq(schema.proposals.clientId, opts.clientId) : undefined, opts.projectId ? eq(schema.proposals.projectId, opts.projectId) : undefined, opts.status && opts.status !== "all" ? eq(schema.proposals.status, opts.status) : undefined))
    .orderBy(desc(schema.proposals.issueDate), desc(schema.proposals.createdAt));
  return rows.map((r) => ({ ...r.p, clientName: r.clientName, totalMinor: (r.p.snapshot?.totals ?? computeTotals(r.p.lines, r.p.projectDiscountMinor, r.p.taxes)).totalMinor }));
}

export type InvoiceListRow = Invoice & { clientName: string; paidMinor: number; balanceMinor: number; overdue: boolean };

export async function listInvoices(userId: string, opts: { clientId?: string; projectId?: string; status?: Invoice["status"] | "overdue" | "open" | "all"; today?: string } = {}): Promise<InvoiceListRow[]> {
  const db = await getDb();
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({ i: schema.invoices, clientName: schema.clients.company })
    .from(schema.invoices)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.invoices.clientId))
    .where(and(eq(schema.invoices.userId, userId), opts.clientId ? eq(schema.invoices.clientId, opts.clientId) : undefined, opts.projectId ? eq(schema.invoices.projectId, opts.projectId) : undefined, opts.status && !["overdue", "open", "all"].includes(opts.status) ? eq(schema.invoices.status, opts.status as Invoice["status"]) : undefined, opts.status === "open" || opts.status === "overdue" ? eq(schema.invoices.status, "issued") : undefined))
    .orderBy(desc(schema.invoices.issueDate), desc(schema.invoices.createdAt));
  const ids = rows.map((r) => r.i.id);
  const pays = ids.length
    ? await db
        .select({ invoiceId: schema.payments.invoiceId, total: sql<number>`sum(${schema.payments.amountMinor})` })
        .from(schema.payments)
        .where(inArray(schema.payments.invoiceId, ids))
        .groupBy(schema.payments.invoiceId)
    : [];
  const out = rows.map((r) => {
    const paidMinor = Number(pays.find((p) => p.invoiceId === r.i.id)?.total ?? 0);
    const total = r.i.status === "draft" ? computeTotals(r.i.lines, r.i.projectDiscountMinor, r.i.taxes).totalMinor : r.i.totalMinor;
    const balanceMinor = Math.max(0, total - paidMinor);
    return { ...r.i, totalMinor: total, clientName: r.clientName, paidMinor, balanceMinor, overdue: r.i.status === "issued" && balanceMinor > 0 && !!r.i.dueDate && r.i.dueDate < today };
  });
  return opts.status === "overdue" ? out.filter((i) => i.overdue) : out;
}

export type Receivables = {
  outstandingByCurrency: Record<string, number>;
  overdueByCurrency: Record<string, number>;
  overdueCount: number;
  dueSoon: InvoiceListRow[]; // due within 14 days
  overdue: InvoiceListRow[];
  open: InvoiceListRow[];
};

export async function receivablesSummary(userId: string, today: string): Promise<Receivables> {
  const open = await listInvoices(userId, { status: "open", today });
  const outstandingByCurrency: Record<string, number> = {};
  const overdueByCurrency: Record<string, number> = {};
  for (const i of open) {
    outstandingByCurrency[i.currency] = (outstandingByCurrency[i.currency] ?? 0) + i.balanceMinor;
    if (i.overdue) overdueByCurrency[i.currency] = (overdueByCurrency[i.currency] ?? 0) + i.balanceMinor;
  }
  const soon = addDaysISO(today, 14);
  return {
    outstandingByCurrency,
    overdueByCurrency,
    overdueCount: open.filter((i) => i.overdue).length,
    dueSoon: open.filter((i) => !i.overdue && i.dueDate && i.dueDate <= soon),
    overdue: open.filter((i) => i.overdue),
    open,
  };
}

export async function listServiceTemplates(userId: string) {
  const db = await getDb();
  return db.query.serviceTemplates.findMany({ where: and(eq(schema.serviceTemplates.userId, userId), sql`${schema.serviceTemplates.archivedAt} is null`), orderBy: [schema.serviceTemplates.name] });
}
export async function saveServiceTemplate(userId: string, input: { id?: string; name: string; description?: string | null; unitPriceMinor: number; currency: string; unit?: string }) {
  const db = await getDb();
  if (input.id) {
    await db.update(schema.serviceTemplates).set({ name: input.name.trim(), description: input.description ?? null, unitPriceMinor: input.unitPriceMinor, currency: input.currency, unit: input.unit ?? "project" }).where(and(eq(schema.serviceTemplates.id, input.id), eq(schema.serviceTemplates.userId, userId)));
    return input.id;
  }
  const [t] = await db.insert(schema.serviceTemplates).values({ userId, name: input.name.trim(), description: input.description ?? null, unitPriceMinor: input.unitPriceMinor, currency: input.currency, unit: input.unit ?? "project" }).returning();
  return t.id;
}
export async function archiveServiceTemplate(userId: string, id: string) {
  const db = await getDb();
  await db.update(schema.serviceTemplates).set({ archivedAt: new Date() }).where(and(eq(schema.serviceTemplates.id, id), eq(schema.serviceTemplates.userId, userId)));
}

export async function countOpenDocs(userId: string) {
  const db = await getDb();
  const drafts = await db.select({ n: sql<number>`count(*)` }).from(schema.proposals).where(and(eq(schema.proposals.userId, userId), inArray(schema.proposals.status, ["draft", "sent"])));
  const inv = await db.select({ n: sql<number>`count(*)` }).from(schema.invoices).where(and(eq(schema.invoices.userId, userId), ne(schema.invoices.status, "void"), ne(schema.invoices.status, "paid")));
  return { proposals: Number(drafts[0]?.n ?? 0), invoices: Number(inv[0]?.n ?? 0) };
}
