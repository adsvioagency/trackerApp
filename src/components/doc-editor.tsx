"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ChevronUp, ChevronDown, Eye, PencilLine } from "lucide-react";
import type { DocInstallment, DocLine, DocTax } from "@/db/schema";
import { computeTotals, defaultInstallments, installmentAmounts } from "@/lib/business/doc-math";
import { makeSnapshot } from "@/lib/business/snapshot";
import { DocPreview } from "./doc-preview";
import { Field, Notice, cx } from "./ui";
import { saveDocumentAction, type DocPayload } from "@/app/(app)/documents/actions";
import { fmtMoney, majorInput, parseMoney } from "@/lib/money/format";
import { shortId } from "@/lib/ids";

export type EditorDoc = DocPayload & { id: string; number: string; status: string };
export type EditorRefs = {
  clients: { id: string; company: string; contactName: string | null; email: string | null; billingAddress: string | null }[];
  projects: { id: string; name: string; clientId: string }[];
  templates: { id: string; name: string; description: string | null; unitPriceMinor: number; currency: string; unit: string }[];
};

export function DocEditor({ type, doc, refs }: { type: "proposal" | "invoice"; doc: EditorDoc; refs: EditorRefs }) {
  const [d, setD] = useState<DocPayload>({ ...doc });
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const client = refs.clients.find((c) => c.id === d.clientId) ?? refs.clients[0];
  const project = refs.projects.find((p) => p.id === d.projectId) ?? null;
  const totals = useMemo(() => computeTotals(d.lines, d.projectDiscountMinor, d.taxes), [d.lines, d.projectDiscountMinor, d.taxes]);
  const snap = useMemo(() => makeSnapshot({ ...d, number: doc.number, installments: type === "proposal" ? d.installments : [] }, client ?? { company: "Client" }, project ? { name: project.name } : null, type), [d, doc.number, client, project, type]);
  const set = (patch: Partial<DocPayload>) => {
    setD((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };
  const setLine = (id: string, patch: Partial<DocLine>) => set({ lines: d.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const addLine = (kind: DocLine["kind"], tpl?: EditorRefs["templates"][number]) => set({ lines: [...d.lines, { id: shortId(), kind, title: tpl?.name ?? "", description: tpl?.description ?? undefined, quantity: 1, rateMinor: tpl?.unitPriceMinor ?? 0, optional: kind === "maintenance", selected: false, period: kind === "maintenance" ? "month" : kind === "third_party" ? "year" : undefined, sort: d.lines.length }] });
  const move = (idx: number, dir: -1 | 1) => {
    const arr = [...d.lines];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    set({ lines: arr.map((l, i) => ({ ...l, sort: i })) });
  };
  const save = () =>
    start(async () => {
      const res = await saveDocumentAction(type, doc.id, d);
      setMsg(res?.ok ? { ok: true, text: "Saved." } : { ok: false, text: res?.error ?? "Could not save." });
      if (res?.ok) {
        setDirty(false);
        router.refresh();
      }
    });
  const schedule = installmentAmounts(totals.totalMinor, d.installments);
  const pctSum = d.installments.filter((i) => i.mode === "percent").reduce((s, i) => s + i.value, 0);

  const editor = (
    <div className="space-y-5">
      <section className="card space-y-3 p-4">
        <h2 className="text-[14px] font-bold">Client & project</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Client" htmlFor="d-client"><select id="d-client" className="select" value={d.clientId} onChange={(e) => set({ clientId: e.target.value, projectId: null })}>{refs.clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}</select></Field>
          <Field label="Project (optional)" htmlFor="d-project"><select id="d-project" className="select" value={d.projectId ?? ""} onChange={(e) => set({ projectId: e.target.value || null })}><option value="">None</option>{refs.projects.filter((p) => p.clientId === d.clientId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        </div>
        <p className="muted text-[12px]">Contact, email and billing address come from the client record and are entered once there.</p>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-[14px] font-bold">Details</h2>
        <Field label={type === "proposal" ? "Proposal title" : "Invoice title"} htmlFor="d-title"><input id="d-title" className="input" value={d.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        {type === "proposal" && (
          <>
            <Field label="Subtitle (eyebrow under the client name)" htmlFor="d-sub"><input id="d-sub" className="input" value={d.subtitle ?? ""} onChange={(e) => set({ subtitle: e.target.value || null })} placeholder="e.g. SHOPIFY WEBSITE & EVENT INVITATION" /></Field>
            <Field label="Intro paragraph" htmlFor="d-intro"><textarea id="d-intro" className="textarea" rows={3} value={d.intro ?? ""} onChange={(e) => set({ intro: e.target.value || null })} /></Field>
          </>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Issue date" htmlFor="d-issue"><input id="d-issue" type="date" className="input" value={d.issueDate} onChange={(e) => set({ issueDate: e.target.value })} /></Field>
          {type === "proposal" ? (
            <Field label="Valid until" htmlFor="d-valid"><input id="d-valid" type="date" className="input" value={d.validUntil ?? ""} onChange={(e) => set({ validUntil: e.target.value || null })} /></Field>
          ) : (
            <Field label="Due date" htmlFor="d-due"><input id="d-due" type="date" className="input" value={d.dueDate ?? ""} onChange={(e) => set({ dueDate: e.target.value || null })} /></Field>
          )}
          <Field label="Currency" htmlFor="d-cur"><select id="d-cur" className="select" value={d.currency} onChange={(e) => set({ currency: e.target.value })}><option value="USD">US$</option><option value="DOP">RD$</option></select></Field>
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[14px] font-bold">Scope lines</h2>
          <div className="flex flex-wrap gap-1.5">
            {refs.templates.length > 0 && (
              <select aria-label="Add from template" className="select w-auto py-1 text-[13px]" value="" onChange={(e) => { const t = refs.templates.find((x) => x.id === e.target.value); if (t) addLine("service", t); }}>
                <option value="">Add from template…</option>
                {refs.templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {fmtMoney(t.unitPriceMinor, t.currency)}</option>)}
              </select>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => addLine("service")}><Plus className="size-4" /> Service</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => addLine("maintenance")}>+ Optional maintenance</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => addLine("third_party")}>+ Third-party cost</button>
          </div>
        </div>
        <ul className="space-y-2">
          {d.lines.map((l, idx) => (
            <li key={l.id} className={cx("rounded-xl border p-3", l.kind === "service" ? "border-rule" : l.kind === "maintenance" ? "border-teal/40 bg-teal-wash/30" : "border-rule-strong bg-surface-2/50")}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="pill pill-neutral">{l.kind === "service" ? `Service ${idx + 1}` : l.kind === "maintenance" ? "Optional maintenance" : "Third-party cost (paid to provider)"}</span>
                <div className="flex gap-1">
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Move up" onClick={() => move(idx, -1)}><ChevronUp className="size-4" /></button>
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Move down" onClick={() => move(idx, 1)}><ChevronDown className="size-4" /></button>
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Remove line" onClick={() => set({ lines: d.lines.filter((x) => x.id !== l.id) })}><Trash2 className="size-4" /></button>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-[1fr_90px_120px_120px]">
                <input aria-label="Line title" className="input" placeholder="Title" value={l.title} onChange={(e) => setLine(l.id, { title: e.target.value })} />
                <input aria-label="Quantity" className="input" inputMode="decimal" placeholder="Qty" value={l.quantity} onChange={(e) => setLine(l.id, { quantity: Number(e.target.value) || 0 })} />
                <input aria-label={l.kind === "service" ? "Agreed rate" : "Price"} className="input" inputMode="decimal" placeholder={l.kind === "service" ? "Agreed price" : "Price"} defaultValue={l.rateMinor ? majorInput(l.rateMinor) : ""} onBlur={(e) => setLine(l.id, { rateMinor: parseMoney(e.target.value) ?? 0 })} />
                {l.kind === "service" ? (
                  <input aria-label="Standard rate" className="input" inputMode="decimal" placeholder="Standard price (optional)" defaultValue={l.standardRateMinor ? majorInput(l.standardRateMinor) : ""} onBlur={(e) => setLine(l.id, { standardRateMinor: parseMoney(e.target.value) })} />
                ) : (
                  <input aria-label="Period" className="input" placeholder="per month / per year" value={l.period ?? ""} onChange={(e) => setLine(l.id, { period: e.target.value || undefined })} />
                )}
              </div>
              <textarea aria-label="Line description" className="textarea mt-2" rows={2} placeholder="One or two lines describing what is included." value={l.description ?? ""} onChange={(e) => setLine(l.id, { description: e.target.value || undefined })} />
              <div className="mt-2 flex flex-wrap items-center gap-4 text-[13px]">
                {l.kind === "service" && <label className="flex items-center gap-2">Line discount <input aria-label="Line discount" className="input w-28 py-1" inputMode="decimal" defaultValue={l.discountMinor ? majorInput(l.discountMinor) : ""} onBlur={(e) => setLine(l.id, { discountMinor: parseMoney(e.target.value) ?? 0 })} /></label>}
                {l.kind === "maintenance" && <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[var(--mango-deep)]" checked={!!l.selected} onChange={(e) => setLine(l.id, { selected: e.target.checked })} /> Selected for billing (included in total)</label>}
                <span className="muted ml-auto tnum">{fmtMoney(Math.max(0, Math.round(l.quantity * l.rateMinor) - (l.discountMinor ?? 0)), d.currency)}{l.kind === "third_party" ? " (not in total)" : ""}</span>
              </div>
            </li>
          ))}
        </ul>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Project discount (whole document)" htmlFor="d-disc"><input id="d-disc" className="input" inputMode="decimal" defaultValue={d.projectDiscountMinor ? majorInput(d.projectDiscountMinor) : ""} onBlur={(e) => set({ projectDiscountMinor: parseMoney(e.target.value) ?? 0 })} /></Field>
          <div>
            <div className="label">Taxes (optional, owner-entered)</div>
            {d.taxes.map((t, i) => (
              <div key={i} className="mb-1 flex gap-2">
                <input aria-label="Tax label" className="input py-1" value={t.label} onChange={(e) => set({ taxes: d.taxes.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <input aria-label="Tax rate percent" className="input w-24 py-1" inputMode="decimal" defaultValue={(t.rateBasisPoints / 100).toString()} onBlur={(e) => set({ taxes: d.taxes.map((x, j) => (j === i ? { ...x, rateBasisPoints: Math.round(Number(e.target.value) * 100) } : x)) })} />
                <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Remove tax" onClick={() => set({ taxes: d.taxes.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></button>
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ taxes: [...d.taxes, { label: "ITBIS", rateBasisPoints: 1800 } as DocTax] })}>+ Add tax</button>
          </div>
        </div>
        <div className="rounded-xl bg-surface-2/60 p-3 text-[13px]">
          <div className="flex justify-between"><span>Services after line discounts</span><span className="tnum">{fmtMoney(totals.servicesSubtotalMinor, d.currency)}</span></div>
          {totals.projectDiscountMinor > 0 && <div className="flex justify-between text-mango-deep"><span>Project discount</span><span className="tnum">-{fmtMoney(totals.projectDiscountMinor, d.currency)}</span></div>}
          {totals.taxMinor > 0 && <div className="flex justify-between"><span>Taxes</span><span className="tnum">{fmtMoney(totals.taxMinor, d.currency)}</span></div>}
          <div className="mt-1 flex justify-between border-t border-rule pt-1 font-bold"><span>{type === "proposal" ? "Project total" : "Amount due"}</span><span className="tnum">{fmtMoney(totals.totalMinor, d.currency)}</span></div>
          {totals.thirdPartyMinor > 0 && <div className="muted flex justify-between"><span>Third-party costs (informational)</span><span className="tnum">{fmtMoney(totals.thirdPartyMinor, d.currency)}</span></div>}
          <p className="muted mt-1 text-[12px]">Included in the total: {totals.includedLineIds.length} line(s). Optional maintenance counts only when selected. Third-party costs never do.</p>
        </div>
      </section>

      {type === "proposal" && (
        <section className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[14px] font-bold">Payment schedule</h2>
            <div className="flex gap-1.5">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ installments: defaultInstallments("full") })}>Full</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ installments: defaultInstallments("half") })}>50 / 50</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ installments: defaultInstallments("thirds") })}>40 / 30 / 30</button>
            </div>
          </div>
          {d.installments.map((inst, i) => (
            <div key={inst.id} className="grid gap-2 md:grid-cols-[1fr_110px_90px_110px_140px_36px]">
              <input aria-label="Installment label" className="input" value={inst.label} onChange={(e) => set({ installments: d.installments.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <select aria-label="Installment kind" className="select" value={inst.kind} onChange={(e) => set({ installments: d.installments.map((x, j) => (j === i ? { ...x, kind: e.target.value as DocInstallment["kind"] } : x)) })}><option value="deposit">Deposit</option><option value="milestone">Milestone</option><option value="final">Final</option><option value="full">Full</option></select>
              <select aria-label="Mode" className="select" value={inst.mode} onChange={(e) => set({ installments: d.installments.map((x, j) => (j === i ? { ...x, mode: e.target.value as "percent" } : x)) })}><option value="percent">%</option><option value="fixed">Fixed</option></select>
              <input aria-label="Value" className="input" inputMode="decimal" defaultValue={inst.mode === "percent" ? inst.value : majorInput(inst.value)} onBlur={(e) => set({ installments: d.installments.map((x, j) => (j === i ? { ...x, value: inst.mode === "percent" ? Number(e.target.value) || 0 : parseMoney(e.target.value) ?? 0 } : x)) })} />
              <input aria-label="Due date or label" className="input" placeholder="Due date / when" value={inst.dueDate ?? inst.dueLabel ?? ""} onChange={(e) => { const v = e.target.value; set({ installments: d.installments.map((x, j) => (j === i ? (/^\d{4}-\d{2}-\d{2}$/.test(v) ? { ...x, dueDate: v, dueLabel: null } : { ...x, dueDate: null, dueLabel: v || null }) : x)) }); }} />
              <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove installment" onClick={() => set({ installments: d.installments.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ installments: [...d.installments, { id: shortId(), label: "Milestone", kind: "milestone", mode: "percent", value: 0 }] })}><Plus className="size-4" /> Add installment</button>
          <div className="text-[13px]">
            {schedule.map((a) => <div key={a.installment.id} className="flex justify-between"><span className="muted">{a.installment.label}</span><span className="tnum font-semibold">{fmtMoney(a.amountMinor, d.currency)}</span></div>)}
            {d.installments.some((i) => i.mode === "percent") && Math.abs(pctSum - 100) > 0.001 && <Notice tone="warn" className="mt-2">Percentages add up to {pctSum}%, not 100%.</Notice>}
          </div>
        </section>
      )}

      <section className="card space-y-3 p-4">
        <h2 className="text-[14px] font-bold">Terms</h2>
        {type === "proposal" && (
          <>
            <Field label="Timing & scope notes" htmlFor="d-timing"><textarea id="d-timing" className="textarea" rows={2} value={d.timingNotes ?? ""} onChange={(e) => set({ timingNotes: e.target.value || null })} placeholder="Target launch before…, subject to timely deposit, content and approvals." /></Field>
            <Field label="Revision limits" htmlFor="d-rev"><input id="d-rev" className="input" value={d.revisionLimit ?? ""} onChange={(e) => set({ revisionLimit: e.target.value || null })} /></Field>
            <Field label="Exclusions" htmlFor="d-exc"><textarea id="d-exc" className="textarea" rows={2} value={d.exclusions ?? ""} onChange={(e) => set({ exclusions: e.target.value || null })} /></Field>
          </>
        )}
        <Field label="Payment terms" htmlFor="d-terms"><textarea id="d-terms" className="textarea" rows={2} value={d.paymentTerms ?? ""} onChange={(e) => set({ paymentTerms: e.target.value || null })} /></Field>
        <Field label="Payment instructions" htmlFor="d-instr"><textarea id="d-instr" className="textarea" rows={2} value={d.paymentInstructions ?? ""} onChange={(e) => set({ paymentInstructions: e.target.value || null })} /></Field>
        <Field label="Private notes (never printed)" htmlFor="d-notes"><textarea id="d-notes" className="textarea" rows={2} value={d.notes ?? ""} onChange={(e) => set({ notes: e.target.value || null })} /></Field>
      </section>
    </div>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" className="inline-flex rounded-[10px] border border-rule bg-surface p-0.5 lg:hidden">
          <button role="tab" type="button" aria-selected={tab === "edit"} className={cx("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium", tab === "edit" ? "bg-ink text-paper" : "text-ink-soft")} onClick={() => setTab("edit")}><PencilLine className="size-4" /> Edit</button>
          <button role="tab" type="button" aria-selected={tab === "preview"} className={cx("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium", tab === "preview" ? "bg-ink text-paper" : "text-ink-soft")} onClick={() => setTab("preview")}><Eye className="size-4" /> Preview</button>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className={cx("text-[13px] font-medium", msg.ok ? "text-ok" : "text-danger")}>{msg.text}</span>}
          <button type="button" className="btn btn-primary" onClick={save} disabled={pending || !dirty}>{pending ? "Saving…" : dirty ? "Save draft" : "Saved"}</button>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={cx(tab !== "edit" && "hidden lg:block")}>{editor}</div>
        <div className={cx(tab !== "preview" && "hidden lg:block", "lg:sticky lg:top-6 lg:self-start")}>
          <div className="mb-2 flex items-center justify-between"><span className="eyebrow">Live preview</span>{dirty && <span className="muted text-[12px]">Unsaved changes are previewed; save to keep them.</span>}</div>
          <DocPreview snap={snap} />
        </div>
      </div>
    </div>
  );
}
