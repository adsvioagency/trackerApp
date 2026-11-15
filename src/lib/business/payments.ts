import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { createTransaction, deleteTransaction } from "@/lib/money/transactions";
import { getAccount } from "@/lib/money/accounts";
import { findCategoryByName } from "@/lib/money/categories";
import { refreshInvoiceStatus } from "./documents";
import { logActivity } from "@/lib/activity";
import { fmtMoney } from "@/lib/money/format";

export type Payment = typeof schema.payments.$inferSelect;

export type PaymentInput = {
  clientId: string;
  projectId?: string | null;
  invoiceId?: string | null;
  date: string;
  amountMinor: number;
  currency: string;
  dopEquivalentMinor?: number | null;
  accountId: string;
  method?: string | null;
  note?: string | null;
  idempotencyKey?: string | null;
  source?: "user" | "assistant" | "system";
};

/**
 * Record a client payment once. Creates the payment record and exactly one
 * income transaction in the ledger. Safe to retry with the same idempotency key.
 */
export async function recordPayment(userId: string, input: PaymentInput): Promise<Payment> {
  const db = await getDb();
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error("Enter an amount greater than zero.");
  if (input.idempotencyKey) {
    const existing = await db.query.payments.findFirst({ where: and(eq(schema.payments.userId, userId), eq(schema.payments.idempotencyKey, input.idempotencyKey)) });
    if (existing) return existing;
  }
  const account = await getAccount(userId, input.accountId);
  if (!account) throw new Error("Choose the account that received the money.");
  if (account.workspace !== "business") throw new Error("Client payments land in a Business account. Record a transfer afterwards if you move the money.");
  const client = await db.query.clients.findFirst({ where: and(eq(schema.clients.id, input.clientId), eq(schema.clients.userId, userId)) });
  if (!client) throw new Error("Client not found.");
  const invoice = input.invoiceId ? await db.query.invoices.findFirst({ where: and(eq(schema.invoices.id, input.invoiceId), eq(schema.invoices.userId, userId)) }) : null;
  if (input.invoiceId && !invoice) throw new Error("Invoice not found.");
  if (invoice && invoice.currency !== input.currency) throw new Error(`This invoice is in ${invoice.currency}. Enter the payment in ${invoice.currency} and add the DOP equivalent if needed.`);
  const projectId = input.projectId ?? invoice?.projectId ?? null;

  // Ledger amount is in the receiving account's currency.
  let ledgerAmount = input.amountMinor;
  let ledgerDop: number | null = input.dopEquivalentMinor ?? null;
  if (account.currency !== input.currency) {
    if (account.currency === "DOP" && input.dopEquivalentMinor) {
      ledgerAmount = input.dopEquivalentMinor;
      ledgerDop = null;
    } else {
      throw new Error(`The payment is in ${input.currency} but ${account.name} is in ${account.currency}. Enter the DOP equivalent you calculated, or pick a ${input.currency} account.`);
    }
  }
  const category = await findCategoryByName(userId, "business", "Client payments");
  const [payment] = await db
    .insert(schema.payments)
    .values({ userId, clientId: input.clientId, projectId, invoiceId: input.invoiceId ?? null, date: input.date, amountMinor: input.amountMinor, currency: input.currency, dopEquivalentMinor: input.currency === "DOP" ? null : input.dopEquivalentMinor ?? null, method: input.method ?? null, accountId: account.id, note: input.note ?? null, idempotencyKey: input.idempotencyKey ?? null })
    .returning();
  const tx = await createTransaction(userId, {
    workspace: "business",
    kind: "income",
    date: input.date,
    accountId: account.id,
    amountMinor: ledgerAmount,
    dopEquivalentMinor: ledgerDop,
    categoryId: category?.id ?? null,
    merchant: client.company,
    note: invoice ? `Payment on ${invoice.number}` : input.note ?? null,
    clientId: input.clientId,
    projectId,
    paymentId: payment.id,
    idempotencyKey: `payment:${payment.id}`,
    source: input.source ?? "user",
  });
  await db.update(schema.payments).set({ transactionId: tx.id }).where(eq(schema.payments.id, payment.id));
  if (invoice) await refreshInvoiceStatus(userId, invoice.id);
  await logActivity({ userId, workspace: "business", entityType: "payment", entityId: payment.id, action: "create", summary: `Recorded ${fmtMoney(input.amountMinor, input.currency)} from ${client.company}${invoice ? ` on ${invoice.number}` : ""}${ledgerDop ? ` (RD$ equivalent ${fmtMoney(ledgerDop)})` : ""}`, source: input.source ?? "user" });
  return { ...payment, transactionId: tx.id };
}

export async function deletePayment(userId: string, paymentId: string) {
  const db = await getDb();
  const p = await db.query.payments.findFirst({ where: and(eq(schema.payments.id, paymentId), eq(schema.payments.userId, userId)) });
  if (!p) return;
  if (p.transactionId) await deleteTransaction(userId, p.transactionId); // also deletes the payment row
  else await db.delete(schema.payments).where(eq(schema.payments.id, paymentId));
  if (p.invoiceId) await refreshInvoiceStatus(userId, p.invoiceId);
  await logActivity({ userId, workspace: "business", entityType: "payment", entityId: paymentId, action: "delete", summary: `Deleted payment ${fmtMoney(p.amountMinor, p.currency)}` });
}

export async function updatePaymentDop(userId: string, paymentId: string, dopEquivalentMinor: number | null) {
  const db = await getDb();
  const p = await db.query.payments.findFirst({ where: and(eq(schema.payments.id, paymentId), eq(schema.payments.userId, userId)) });
  if (!p) throw new Error("Payment not found.");
  await db.update(schema.payments).set({ dopEquivalentMinor }).where(eq(schema.payments.id, paymentId));
  if (p.transactionId) await db.update(schema.transactions).set({ dopEquivalentMinor }).where(and(eq(schema.transactions.id, p.transactionId), eq(schema.transactions.currency, p.currency)));
}

export async function listPayments(userId: string, opts: { clientId?: string; projectId?: string; invoiceId?: string; limit?: number } = {}) {
  const db = await getDb();
  const rows = await db
    .select({ p: schema.payments, clientName: schema.clients.company, invoiceNumber: schema.invoices.number, projectName: schema.projects.name })
    .from(schema.payments)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.payments.clientId))
    .leftJoin(schema.invoices, eq(schema.invoices.id, schema.payments.invoiceId))
    .leftJoin(schema.projects, eq(schema.projects.id, schema.payments.projectId))
    .where(and(eq(schema.payments.userId, userId), opts.clientId ? eq(schema.payments.clientId, opts.clientId) : undefined, opts.projectId ? eq(schema.payments.projectId, opts.projectId) : undefined, opts.invoiceId ? eq(schema.payments.invoiceId, opts.invoiceId) : undefined))
    .orderBy(desc(schema.payments.date), desc(schema.payments.createdAt))
    .limit(opts.limit ?? 200);
  return rows.map((r) => ({ ...r.p, clientName: r.clientName, invoiceNumber: r.invoiceNumber, projectName: r.projectName }));
}
