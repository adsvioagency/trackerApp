import { describe, it, expect } from "vitest";
import { makeUser, account } from "./helpers";
import { createClient } from "@/lib/business/clients";
import { createProject, projectFinance, addInstallment, getProject, updateProject } from "@/lib/business/projects";
import { createInvoiceFromInstallment, issueInvoice, getInvoice, updateInvoice, createProposal, markProposalSent, approveProposal, getProposal, updateProposal, createInvoiceFromProposal } from "@/lib/business/documents";
import { recordPayment, deletePayment } from "@/lib/business/payments";
import { incomeTotal, listTransactions } from "@/lib/money/transactions";
import { renderDocumentPdf } from "@/lib/pdf/document";
import { shortId } from "@/lib/ids";
import { buildAgenda } from "@/lib/agenda";

describe("US$1,000 project with a US$500 deposit invoice", () => {
  it("records US$400 + RD$24,000 once; US$100 left on the invoice, US$600 left on the project; retry is a no-op", async () => {
    const u = await makeUser();
    const usd = await account(u.id, { ws: "business", name: "USD account", currency: "USD" });
    const client = await createClient(u.id, { company: "Lakou Café (fictional)", contactName: "Marie", status: "active" });
    const project = await createProject(u.id, { clientId: client.id, name: "Shopify website", agreedValueMinor: 1_000_00, currency: "USD" });
    const inst = await addInstallment(u.id, project.id, { label: "50% deposit", amountMinor: 500_00, dueDate: "2026-11-20" });
    const draft = await createInvoiceFromInstallment(u.id, inst.id, { issueDate: "2026-11-16" });
    await issueInvoice(u.id, draft.id);
    const key = "pay-1";
    const p1 = await recordPayment(u.id, { clientId: client.id, invoiceId: draft.id, date: "2026-11-17", amountMinor: 400_00, currency: "USD", dopEquivalentMinor: 24_000_00, accountId: usd.id, idempotencyKey: key });
    const p2 = await recordPayment(u.id, { clientId: client.id, invoiceId: draft.id, date: "2026-11-17", amountMinor: 400_00, currency: "USD", dopEquivalentMinor: 24_000_00, accountId: usd.id, idempotencyKey: key });
    expect(p2.id).toBe(p1.id);

    const inv = (await getInvoice(u.id, draft.id))!;
    expect(inv.totalMinor).toBe(500_00);
    expect(inv.paidMinor).toBe(400_00);
    expect(inv.balanceMinor).toBe(100_00);
    expect(inv.status).toBe("issued");

    const f = await projectFinance(u.id, project.id);
    expect(f.agreedMinor - f.receivedMinor).toBe(600_00);
    expect(f.invoicedMinor).toBe(500_00);
    expect(f.outstandingMinor).toBe(100_00);
    expect(f.scheduledToInvoiceMinor).toBe(0); // the installment moved to invoiced
    expect(f.receivedDopMinor).toBe(24_000_00);

    const income = await incomeTotal(u.id, "business", "2026-11-01", "2026-11-30");
    expect(income.dopMinor).toBe(24_000_00);
    expect(income.missingCount).toBe(0);
    const txs = await listTransactions(u.id, { workspace: "business", kind: "income" });
    expect(txs).toHaveLength(1);
    expect(txs[0].amountMinor).toBe(400_00);
    expect(txs[0].currency).toBe("USD");
    expect(txs[0].dopEquivalentMinor).toBe(24_000_00);

    // The installment appears once in the calendar, as the invoice due date.
    const agenda = await buildAgenda({ user: u, view: "business", today: "2026-11-16", tz: u.timezone }, "2026-11-01", "2026-11-30");
    expect(agenda.filter((a) => a.kind === "invoice")).toHaveLength(1);
    expect(agenda.filter((a) => a.kind === "installment")).toHaveLength(0);

    // Paying the rest marks invoice and installment paid.
    await recordPayment(u.id, { clientId: client.id, invoiceId: draft.id, date: "2026-11-18", amountMinor: 100_00, currency: "USD", dopEquivalentMinor: 6_000_00, accountId: usd.id, idempotencyKey: "pay-2" });
    expect((await getInvoice(u.id, draft.id))!.status).toBe("paid");
    expect((await getProject(u.id, project.id))!.installments[0].status).toBe("paid");
    // Deleting a payment reverses once.
    await deletePayment(u.id, p1.id);
    expect((await getInvoice(u.id, draft.id))!.balanceMinor).toBe(400_00);
    expect((await listTransactions(u.id, { workspace: "business", kind: "income" })).length).toBe(1);
  });

  it("a USD payment into a DOP account posts the DOP amount once", async () => {
    const u = await makeUser();
    const dop = await account(u.id, { ws: "business", name: "DOP account", currency: "DOP" });
    const client = await createClient(u.id, { company: "Fictional Co", status: "active" });
    await recordPayment(u.id, { clientId: client.id, date: "2026-11-10", amountMinor: 200_00, currency: "USD", dopEquivalentMinor: 12_000_00, accountId: dop.id });
    const txs = await listTransactions(u.id, { workspace: "business" });
    expect(txs).toHaveLength(1);
    expect(txs[0].currency).toBe("DOP");
    expect(txs[0].amountMinor).toBe(12_000_00);
    expect((await incomeTotal(u.id, "business", "2026-11-01", "2026-11-30")).dopMinor).toBe(12_000_00);
    await expect(recordPayment(u.id, { clientId: client.id, date: "2026-11-10", amountMinor: 200_00, currency: "USD", accountId: dop.id })).rejects.toThrow(/DOP equivalent/);
  });
});

describe("documents keep issued values", () => {
  it("issued PDFs render from the frozen snapshot even after the project and draft fields change; long scopes paginate", async () => {
    const u = await makeUser();
    const client = await createClient(u.id, { company: "Atelier Fictional", contactName: "Eve", status: "active" });
    const project = await createProject(u.id, { clientId: client.id, name: "Store build", agreedValueMinor: 0, currency: "USD" });
    const lines = Array.from({ length: 28 }, (_, i) => ({ id: shortId(), kind: "service" as const, title: `Scope item ${i + 1}`, description: "A reasonably long description that explains what is included in this part of the work so the table wraps across pages.", quantity: 1, rateMinor: 100_00, standardRateMinor: 120_00, sort: i }));
    lines.push({ id: shortId(), kind: "maintenance" as const, title: "Monthly care", description: "Up to 1 hour per month.", quantity: 1, rateMinor: 59_00, standardRateMinor: null, sort: 99 } as (typeof lines)[number]);
    lines.push({ id: shortId(), kind: "third_party" as const, title: "Domain", quantity: 1, rateMinor: 15_00, standardRateMinor: null, sort: 100 } as (typeof lines)[number]);
    const p = await createProposal(u.id, { clientId: client.id, projectId: project.id, title: "Shopify website", issueDate: "2026-11-01", currency: "USD", lines, projectDiscountMinor: 300_00, installments: [{ id: "a", label: "50% to begin", kind: "deposit", mode: "percent", value: 50 }, { id: "b", label: "50% before launch", kind: "final", mode: "percent", value: 50 }] });
    const before = (await getProposal(u.id, p.id))!;
    expect(before.totals.servicesTotalMinor).toBe(28 * 100_00 - 300_00);
    expect(before.totals.thirdPartyMinor).toBe(15_00);
    expect(before.totals.maintenanceMinor).toBe(0); // optional, not selected
    await markProposalSent(u.id, p.id);
    await approveProposal(u.id, p.id);
    const sent = (await getProposal(u.id, p.id))!;
    expect(sent.snapshot?.totals.totalMinor).toBe(2_500_00);
    // Project synced from approval.
    const proj = (await getProject(u.id, project.id))!;
    expect(proj.agreedValueMinor).toBe(2_500_00);
    expect(proj.installments.map((i) => i.amountMinor)).toEqual([1_250_00, 1_250_00]);
    // Later edits do not touch the issued values.
    await updateProject(u.id, project.id, { name: "Renamed project", agreedValueMinor: 9_999_00 });
    await updateProposal(u.id, p.id, { title: "Changed title", projectDiscountMinor: 0 });
    const after = (await getProposal(u.id, p.id))!;
    expect(after.snapshot?.title).toBe("Shopify website");
    expect(after.snapshot?.project?.name).toBe("Store build");
    expect(after.snapshot?.totals.totalMinor).toBe(2_500_00);
    const pdf = await renderDocumentPdf(after.snapshot!);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect((pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeGreaterThan(1);
    // Deposit invoice from the proposal, linked to the project's planned installment.
    const inv = await createInvoiceFromProposal(u.id, p.id, { installmentId: "a", issueDate: "2026-11-02", projectInstallmentId: proj.installments[0].id });
    await issueInvoice(u.id, inv.id);
    const issued = (await getInvoice(u.id, inv.id))!;
    expect(issued.totalMinor).toBe(1_250_00);
    await updateInvoice(u.id, inv.id, { title: "Hacked", lines: [] });
    const still = (await getInvoice(u.id, inv.id))!;
    expect(still.totalMinor).toBe(1_250_00);
    expect(still.snapshot?.totals.totalMinor).toBe(1_250_00);
    expect((await projectFinance(u.id, project.id)).scheduledToInvoiceMinor).toBe(1_250_00); // only the final remains planned
  });
});
