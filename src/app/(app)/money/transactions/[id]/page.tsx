import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCtx } from "@/lib/current";
import { getTransaction, TX_KIND_LABEL } from "@/lib/money/transactions";
import { listAccounts } from "@/lib/money/accounts";
import { getCategoryTree } from "@/lib/money/categories";
import { listClients } from "@/lib/business/clients";
import { listProjects } from "@/lib/business/projects";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import { Card, Pill, WorkspaceBadge, Notice } from "@/components/ui";
import { EditTransactionForm } from "./edit-form";
import { fmtMoney } from "@/lib/money/format";

export const metadata: Metadata = { title: "Transaction" };

export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await getCtx();
  const tx = await getTransaction(user.id, id);
  if (!tx) notFound();
  const [accounts, tree, clients, projects] = await Promise.all([listAccounts(user.id, tx.workspace, { includeArchived: true }), getCategoryTree(user.id, tx.workspace), tx.workspace === "business" ? listClients(user.id) : Promise.resolve([]), tx.workspace === "business" ? listProjects(user.id, { status: "all" }) : Promise.resolve([])]);
  const db = await getDb();
  const links = {
    billOccurrence: tx.billOccurrenceId ? await db.query.billOccurrences.findFirst({ where: eq(schema.billOccurrences.id, tx.billOccurrenceId) }) : null,
    payment: tx.paymentId ? await db.query.payments.findFirst({ where: eq(schema.payments.id, tx.paymentId) }) : null,
    receipt: tx.receiptFileId ? await db.query.files.findFirst({ where: eq(schema.files.id, tx.receiptFileId) }) : null,
    counterpartAccount: tx.counterpart ? accounts.find((a) => a.id === tx.counterpart!.accountId) ?? (await db.query.accounts.findFirst({ where: eq(schema.accounts.id, tx.counterpart.accountId) })) : null,
  };
  return (
    <div className="mx-auto max-w-[720px]">
      <Link href="/money/transactions" className="btn btn-ghost btn-sm -ml-2 mb-3"><ArrowLeft className="size-4" /> Transactions</Link>
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h1 className="text-[22px] font-extrabold">{TX_KIND_LABEL[tx.kind]} · {fmtMoney(tx.amountMinor, tx.currency)}</h1>
          <WorkspaceBadge workspace={tx.workspace} />
          {tx.importBatchId && <Pill>Imported</Pill>}
        </div>
        {tx.counterpart && links.counterpartAccount && (
          <Notice tone="neutral" className="mb-3">
            Linked {tx.kind === "debt_payment" ? "principal leg" : "transfer leg"}: {tx.counterpart.kind === "transfer_in" ? "into" : "out of"} <Link href={`/money/transactions/${tx.counterpart.id}`} className="font-semibold underline">{links.counterpartAccount.name}</Link> ({fmtMoney(tx.counterpart.amountMinor, tx.counterpart.currency)}). Date and note edits apply to both legs.
          </Notice>
        )}
        {links.billOccurrence && <Notice tone="ok" className="mb-3">Records the bill due {links.billOccurrence.dueDate}. Deleting this transaction marks that bill unpaid again. <Link href="/money/bills" className="underline">Bills</Link></Notice>}
        {links.payment && <Notice tone="ok" className="mb-3">Client payment of {fmtMoney(links.payment.amountMinor, links.payment.currency)}{links.payment.invoiceId ? " on an invoice" : ""}. Amount and date edits here update the payment too. {links.payment.invoiceId && <Link href={`/documents/invoices/${links.payment.invoiceId}`} className="underline">Open invoice</Link>}</Notice>}
        {tx.kind === "debt_payment" && <Notice tone="neutral" className="mb-3">Principal {fmtMoney(tx.principalMinor ?? 0, tx.currency)} reduced the balance · interest {fmtMoney(tx.interestMinor ?? 0, tx.currency)} and fees {fmtMoney(tx.feesMinor ?? 0, tx.currency)} count as spending.</Notice>}
        <EditTransactionForm tx={{ ...tx, splits: tx.splits }} accounts={accounts.filter((a) => a.currency === tx.currency).map((a) => ({ id: a.id, name: a.name, currency: a.currency, type: a.type, workspace: a.workspace }))} tree={tree} clients={clients.map((c) => ({ id: c.id, name: c.company }))} projects={projects.map((p) => ({ id: p.id, name: p.name, clientId: p.clientId }))} receipt={links.receipt ? { id: links.receipt.id, filename: links.receipt.filename, mime: links.receipt.mime } : null} />
      </Card>
    </div>
  );
}
