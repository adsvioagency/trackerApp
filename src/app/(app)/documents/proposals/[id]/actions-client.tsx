"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, Notice } from "@/components/ui";
import { Sheet, SubmitButton, ActionMessage, useAfterSuccess, type ActionState } from "@/components/forms";
import { invoiceFromProposalAction, proposalStatusAction } from "../../actions";
import { fmtMoney } from "@/lib/money/format";
import { addDaysISO } from "@/lib/dates";

type P = { id: string; status: string; number: string; totalMinor: number; currency: string; installments: { id: string; label: string; kind: string }[]; schedule: { id: string; amountMinor: number }[]; invoices: { id: string; number: string; status: string; totalMinor: number; installmentId: string | null }[]; projectInstallments: { id: string; label: string; amountMinor: number }[] };

export function ProposalActions({ proposal: p, today }: { proposal: P; today: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(invoiceFromProposalAction, null);
  useAfterSuccess(state, () => {
    setOpen(false);
    if (state?.id) router.push(`/documents/invoices/${state.id}`);
  });
  const run = (op: "sent" | "approved" | "declined" | "expired" | "draft") => start(async () => { await proposalStatusAction(p.id, op); router.refresh(); });
  const [installmentId, setInstallmentId] = useState(p.installments[0]?.id ?? "");
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {p.status === "draft" && <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => run("sent")}>Mark as sent (freeze values)</button>}
      {(p.status === "draft" || p.status === "sent") && <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => { if (window.confirm("Approve this proposal? The project agreed value and payment schedule will be synced if empty.")) run("approved"); }}>Approve</button>}
      {(p.status === "sent" || p.status === "approved") && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>Create invoice</button>}
      {p.status === "sent" && <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run("declined")}>Mark declined</button>}
      {p.status === "sent" && <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run("draft")}>Back to draft</button>}
      <Sheet open={open} onClose={() => setOpen(false)} title="Create invoice from proposal">
        <form action={action} className="space-y-3">
          <input type="hidden" name="proposalId" value={p.id} />
          <Field label="What to invoice" htmlFor="ip-inst">
            <select id="ip-inst" name="installmentId" className="select" value={installmentId} onChange={(e) => setInstallmentId(e.target.value)}>
              {p.installments.map((i) => <option key={i.id} value={i.id}>{i.label} · {fmtMoney(p.schedule.find((s) => s.id === i.id)?.amountMinor ?? 0, p.currency)}</option>)}
              <option value="">Full amount · {fmtMoney(p.totalMinor, p.currency)}</option>
            </select>
          </Field>
          {p.projectInstallments.length > 0 && (
            <Field label="Link to a planned project installment (keeps totals and calendar in sync)" htmlFor="ip-proj">
              <select id="ip-proj" name="projectInstallmentId" className="select" defaultValue={p.projectInstallments[0]?.id ?? ""}>
                <option value="">Do not link</option>
                {p.projectInstallments.map((i) => <option key={i.id} value={i.id}>{i.label} · {fmtMoney(i.amountMinor, p.currency)}</option>)}
              </select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Issue date" htmlFor="ip-issue"><input id="ip-issue" name="issueDate" type="date" className="input" defaultValue={today} /></Field>
            <Field label="Due date" htmlFor="ip-due"><input id="ip-due" name="dueDate" type="date" className="input" defaultValue={addDaysISO(today, 7)} /></Field>
          </div>
          <Notice tone="neutral">The invoice is created as a draft so you can review it before issuing.</Notice>
          <ActionMessage state={state} />
          <SubmitButton>Create draft invoice</SubmitButton>
        </form>
      </Sheet>
    </div>
  );
}
