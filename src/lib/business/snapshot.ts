/** Pure snapshot builder (safe on client and server). */
import type { DocInstallment, DocLine, DocSnapshot, DocTax } from "@/db/schema";
import { computeTotals } from "./doc-math";

export type SnapshotSource = {
  number: string;
  issueDate: string;
  currency: string;
  title: string;
  subtitle?: string | null;
  intro?: string | null;
  lines: DocLine[];
  projectDiscountMinor: number;
  taxes: DocTax[];
  exclusions?: string | null;
  revisionLimit?: string | null;
  paymentTerms?: string | null;
  paymentInstructions?: string | null;
  timingNotes?: string | null;
  installments?: DocInstallment[];
  validUntil?: string | null;
  dueDate?: string | null;
};

export function makeSnapshot(doc: SnapshotSource, client: { company: string; contactName?: string | null; email?: string | null; billingAddress?: string | null }, project: { name: string } | null, docType: "proposal" | "invoice"): DocSnapshot {
  const totals = computeTotals(doc.lines, doc.projectDiscountMinor, doc.taxes);
  return {
    docType,
    number: doc.number,
    issueDate: doc.issueDate,
    currency: doc.currency,
    title: doc.title,
    subtitle: doc.subtitle ?? null,
    intro: doc.intro ?? null,
    client: { company: client.company, contactName: client.contactName ?? null, email: client.email ?? null, billingAddress: client.billingAddress ?? null },
    project: project ? { name: project.name } : null,
    lines: doc.lines,
    projectDiscountMinor: doc.projectDiscountMinor,
    taxes: doc.taxes,
    exclusions: doc.exclusions ?? null,
    revisionLimit: doc.revisionLimit ?? null,
    paymentTerms: doc.paymentTerms ?? null,
    paymentInstructions: doc.paymentInstructions ?? null,
    timingNotes: doc.timingNotes ?? null,
    installments: doc.installments ?? [],
    totals,
    validUntil: doc.validUntil ?? null,
    dueDate: doc.dueDate ?? null,
    amountDueMinor: totals.totalMinor,
  };
}
