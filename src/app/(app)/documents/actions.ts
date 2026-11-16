"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/components/forms";
import { errorMessage, isoDate, money, opt, str } from "@/lib/form";
import { approveProposal, archiveServiceTemplate, createInvoice, createInvoiceFromInstallment, createInvoiceFromProposal, createProposal, issueInvoice, markProposalSent, saveServiceTemplate, setProposalStatus, updateInvoice, updateProposal, voidInvoice, DEFAULT_EXCLUSIONS, DEFAULT_PAYMENT_INSTRUCTIONS, DEFAULT_PAYMENT_TERMS, DEFAULT_REVISIONS } from "@/lib/business/documents";
import { defaultInstallments } from "@/lib/business/doc-math";
import type { DocInstallment, DocLine, DocTax } from "@/db/schema";
import { todayInTz, addDaysISO } from "@/lib/dates";
import { shortId } from "@/lib/ids";

export async function createDocumentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const type = str(fd, "type") === "invoice" ? "invoice" : "proposal";
  const clientId = str(fd, "clientId");
  const projectId = opt(fd, "projectId");
  const title = str(fd, "title") || (type === "invoice" ? "Services" : "Website project");
  const today = todayInTz(user.timezone);
  if (!clientId) return { error: "Choose a client." };
  let id: string;
  try {
    if (type === "proposal") {
      const p = await createProposal(user.id, { clientId, projectId, title, issueDate: today, validUntil: addDaysISO(today, 30), currency: str(fd, "currency") || "USD", lines: [{ id: shortId(), kind: "service", title: "", quantity: 1, rateMinor: 0, sort: 0 }], installments: defaultInstallments("half"), exclusions: DEFAULT_EXCLUSIONS, revisionLimit: DEFAULT_REVISIONS, paymentTerms: DEFAULT_PAYMENT_TERMS, paymentInstructions: DEFAULT_PAYMENT_INSTRUCTIONS });
      id = p.id;
    } else {
      const i = await createInvoice(user.id, { clientId, projectId, title, issueDate: today, dueDate: addDaysISO(today, 14), currency: str(fd, "currency") || "USD", lines: [{ id: shortId(), kind: "service", title: "", quantity: 1, rateMinor: 0, sort: 0 }] });
      id = i.id;
    }
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/documents");
  redirect(type === "proposal" ? `/documents/proposals/${id}` : `/documents/invoices/${id}`);
}

export type DocPayload = {
  clientId: string;
  projectId: string | null;
  title: string;
  subtitle: string | null;
  intro: string | null;
  issueDate: string;
  validUntil: string | null;
  dueDate: string | null;
  currency: string;
  lines: DocLine[];
  projectDiscountMinor: number;
  taxes: DocTax[];
  exclusions: string | null;
  revisionLimit: string | null;
  paymentTerms: string | null;
  paymentInstructions: string | null;
  timingNotes: string | null;
  installments: DocInstallment[];
  notes: string | null;
};

export async function saveDocumentAction(type: "proposal" | "invoice", id: string, payload: DocPayload): Promise<ActionState> {
  const user = await requireUser();
  try {
    if (type === "proposal") await updateProposal(user.id, id, payload);
    else await updateInvoice(user.id, id, { clientId: payload.clientId, projectId: payload.projectId, title: payload.title, issueDate: payload.issueDate, dueDate: payload.dueDate, currency: payload.currency, lines: payload.lines, projectDiscountMinor: payload.projectDiscountMinor, taxes: payload.taxes, paymentTerms: payload.paymentTerms, paymentInstructions: payload.paymentInstructions, notes: payload.notes });
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function proposalStatusAction(id: string, op: "sent" | "approved" | "declined" | "expired" | "draft") {
  const user = await requireUser();
  if (op === "sent") await markProposalSent(user.id, id);
  else if (op === "approved") await approveProposal(user.id, id);
  else await setProposalStatus(user.id, id, op);
  revalidatePath("/", "layout");
}

export async function invoiceFromProposalAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const inv = await createInvoiceFromProposal(user.id, str(fd, "proposalId"), { installmentId: opt(fd, "installmentId") ?? undefined, kind: (opt(fd, "kind") as "full") ?? undefined, issueDate: isoDate(fd, "issueDate") ?? todayInTz(user.timezone), dueDate: isoDate(fd, "dueDate"), projectInstallmentId: opt(fd, "projectInstallmentId") });
    revalidatePath("/", "layout");
    return { ok: true, message: `Created ${inv.number}.`, id: inv.id };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function invoiceFromInstallmentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const inv = await createInvoiceFromInstallment(user.id, str(fd, "installmentId"), { issueDate: isoDate(fd, "issueDate") ?? todayInTz(user.timezone), dueDate: isoDate(fd, "dueDate") });
    revalidatePath("/", "layout");
    return { ok: true, message: `Created ${inv.number} as a draft.`, id: inv.id };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function invoiceStatusAction(id: string, op: "issue" | "void") {
  const user = await requireUser();
  if (op === "issue") await issueInvoice(user.id, id);
  else await voidInvoice(user.id, id);
  revalidatePath("/", "layout");
}

export async function serviceTemplateAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const op = str(fd, "op");
    if (op === "archive") {
      await archiveServiceTemplate(user.id, str(fd, "id"));
    } else {
      const price = money(fd, "price");
      if (!str(fd, "name")) return { error: "Give the service a name." };
      await saveServiceTemplate(user.id, { id: opt(fd, "id") ?? undefined, name: str(fd, "name"), description: opt(fd, "description"), unitPriceMinor: price ?? 0, currency: str(fd, "currency") || "USD", unit: str(fd, "unit") || "project" });
    }
    revalidatePath("/documents");
    return { ok: true, message: "Saved." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
