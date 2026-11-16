"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { invoiceStatusAction } from "../../actions";

export function InvoiceActions({ invoice: i }: { invoice: { id: string; status: string; balanceMinor: number; paidMinor: number; totalMinor: number; currency: string; hasPayments: boolean } }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (op: "issue" | "void") => start(async () => { try { await invoiceStatusAction(i.id, op); router.refresh(); } catch (e) { alert(e instanceof Error ? e.message : "Could not update."); } });
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {i.status === "draft" && <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => { if (window.confirm("Issue this invoice? Its values will be frozen and it becomes receivable.")) run("issue"); }}>Issue invoice (freeze values)</button>}
      {i.status === "issued" && i.balanceMinor > 0 && <Link href={`/add/payment?invoice=${i.id}&back=/documents/invoices/${i.id}`} className="btn btn-primary btn-sm">Record payment</Link>}
      {(i.status === "issued" || i.status === "draft") && !i.hasPayments && <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => { if (window.confirm("Void this invoice? It stays in history but no longer counts as receivable.")) run("void"); }}>Void</button>}
    </div>
  );
}
