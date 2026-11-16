import type { DocSnapshot } from "@/db/schema";
import { installmentAmounts, lineStandard, lineSubtotal } from "@/lib/business/doc-math";
import { fmtMoney } from "@/lib/money/format";
import { fmtDate } from "@/lib/dates";

/** On-screen preview that mirrors the PDF layout (light Paper regardless of theme). */
export function DocPreview({ snap }: { snap: DocSnapshot }) {
  const cur = snap.currency;
  const services = snap.lines.filter((l) => l.kind === "service");
  const maintenance = snap.lines.filter((l) => l.kind === "maintenance");
  const third = snap.lines.filter((l) => l.kind === "third_party");
  const showStandard = services.some((l) => l.standardRateMinor && l.standardRateMinor !== l.rateMinor);
  const t = snap.totals;
  const isProposal = snap.docType === "proposal";
  const schedule = isProposal ? installmentAmounts(t.totalMinor, snap.installments ?? []) : [];
  const discount = (showStandard ? t.standardSubtotalMinor - t.servicesSubtotalMinor : t.lineDiscountsMinor) + t.projectDiscountMinor;
  return (
    <div className="mx-auto w-full max-w-[720px] overflow-hidden rounded-[6px] border border-[#E2DAD0] bg-[#FCFAF6] text-[#16130F] shadow-card" style={{ fontFamily: "var(--font-inter), Inter, sans-serif" }}>
      <div className="h-1.5 bg-[#E8590C]" />
      <div className="p-6 md:p-9">
        <div className="flex items-start justify-between border-b border-[#E2DAD0] pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-adsvio.png" alt="Adsvio" width={118} height={27} />
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em]">{isProposal ? "Project proposal" : "Invoice"}</div>
            <div className="text-[11px] text-[#5C554C]">{fmtDate(snap.issueDate, "long")} | {snap.number}</div>
            {!isProposal && snap.dueDate && <div className="text-[11px] text-[#5C554C]">Due {fmtDate(snap.dueDate, "long")}</div>}
            {isProposal && snap.validUntil && <div className="text-[11px] text-[#5C554C]">Valid until {fmtDate(snap.validUntil, "long")}</div>}
          </div>
        </div>
        <h2 className="mt-5 text-[28px] font-extrabold leading-tight tracking-[-0.02em]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{snap.client.company}</h2>
        <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#C4470A]">{snap.subtitle || snap.title}</div>
        <div className="mt-2 text-[11px] text-[#5C554C]">
          {isProposal ? "Prepared for" : "Billed to"} {snap.client.contactName ? `${snap.client.contactName} / ${snap.client.company}` : snap.client.company}
          {snap.client.billingAddress ? ` · ${snap.client.billingAddress.replace(/\n/g, ", ")}` : ""} / By Adsvio Agency{snap.project ? ` · Project: ${snap.project.name}` : ""}
        </div>
        {snap.intro && <p className="mt-3 text-[12px] leading-relaxed">{snap.intro}</p>}
        <table className="mt-4 w-full text-[12px]">
          <thead>
            <tr className="bg-[#F3EEE6] text-[9px] uppercase tracking-[0.08em] text-[#5C554C]">
              <th className="rounded-l px-2 py-1.5 text-left font-bold">{isProposal ? "Project scope" : "Description"}</th>
              {showStandard && <th className="px-2 py-1.5 text-right font-bold">Standard</th>}
              <th className="rounded-r px-2 py-1.5 text-right font-bold">{showStandard ? "Agreed" : `Value (${cur})`}</th>
            </tr>
          </thead>
          <tbody>
            {services.map((l, i) => (
              <tr key={l.id} className="border-b border-[#E2DAD0] align-top">
                <td className="px-2 py-2">
                  <div className="font-bold">{services.length > 3 ? `${String(i + 1).padStart(2, "0")}  ` : ""}{l.title}{l.quantity !== 1 ? ` ×${l.quantity}` : ""}</div>
                  {l.description && <div className="text-[10.5px] text-[#5C554C]">{l.description}</div>}
                </td>
                {showStandard && <td className="px-2 py-2 text-right text-[#5C554C] tnum">{l.standardRateMinor ? fmtMoney(lineStandard(l), cur) : ""}</td>}
                <td className={`px-2 py-2 text-right tnum ${showStandard ? "font-bold" : ""}`}>{fmtMoney(lineSubtotal(l), cur)}</td>
              </tr>
            ))}
            {!services.length && <tr><td className="px-2 py-4 text-center text-[#5C554C]" colSpan={3}>Add scope lines to see them here.</td></tr>}
          </tbody>
        </table>
        <div className="mt-5 flex flex-col gap-5 md:flex-row md:justify-between">
          <div className="flex-1 text-[11.5px]">
            {isProposal && schedule.length > 0 && (
              <>
                <div className="mb-1.5 font-semibold">Payment schedule</div>
                {schedule.map((a) => (
                  <div key={a.installment.id} className="mb-1 flex justify-between"><span className="text-[#5C554C]">{a.installment.label}{a.installment.dueLabel ? ` (${a.installment.dueLabel})` : a.installment.dueDate ? ` (${fmtDate(a.installment.dueDate)})` : ""}</span><span className="font-bold tnum">{fmtMoney(a.amountMinor, cur)}</span></div>
                ))}
                {snap.paymentInstructions && <p className="mt-1 text-[10px] text-[#5C554C]">{snap.paymentInstructions}</p>}
              </>
            )}
            {!isProposal && (
              <>
                <div className="mb-1 font-semibold">Payment</div>
                {snap.paymentTerms && <p className="text-[10px] text-[#5C554C]">{snap.paymentTerms}</p>}
                {snap.paymentInstructions && <p className="mt-1 text-[10px] text-[#5C554C]">{snap.paymentInstructions}</p>}
              </>
            )}
          </div>
          <div className="w-full md:w-[240px] text-[11.5px]">
            {discount > 0 && (
              <>
                <div className="flex justify-between text-[#5C554C]"><span>Standard project price</span><span className="tnum">{fmtMoney(showStandard ? t.standardSubtotalMinor : t.servicesSubtotalMinor + t.lineDiscountsMinor, cur)}</span></div>
                <div className="flex justify-between text-[#5C554C]"><span>Courtesy discount</span><span className="tnum text-[#C4470A]">-{fmtMoney(discount, cur)}</span></div>
              </>
            )}
            {t.maintenanceMinor > 0 && <div className="flex justify-between text-[#5C554C]"><span>Maintenance (selected)</span><span className="tnum">{fmtMoney(t.maintenanceMinor, cur)}</span></div>}
            {snap.taxes.map((tx) => <div key={tx.label} className="flex justify-between text-[#5C554C]"><span>{tx.label} ({(tx.rateBasisPoints / 100).toFixed(2)}%)</span><span className="tnum">{fmtMoney(Math.round((t.servicesTotalMinor * tx.rateBasisPoints) / 10000), cur)}</span></div>)}
            <div className="mt-2 flex items-center justify-between rounded bg-[#16130F] px-3 py-2.5 text-[#FCFAF6]"><span className="text-[9px] font-bold uppercase tracking-[0.1em]">{isProposal ? "Your project total" : "Amount due"}</span><span className="text-[22px] font-extrabold tnum" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>{fmtMoney(t.totalMinor, cur)}</span></div>
          </div>
        </div>
        {maintenance.map((m) => (
          <div key={m.id} className="mt-4 border-t border-[#E2DAD0] pt-3 text-[11.5px]">
            <div className="flex justify-between"><span className="font-bold">{m.selected ? "" : "Optional "}{m.title}</span><span className="font-bold tnum">{fmtMoney(lineSubtotal(m), cur)}{m.period ? ` / ${m.period}` : ""}</span></div>
            {m.description && <p className="text-[10px] text-[#5C554C]">{m.description}</p>}
            {!m.selected && <p className="text-[10px] text-[#5C554C]">Not included in the total above; starts only if selected.</p>}
          </div>
        ))}
        {third.length > 0 && (
          <div className="mt-4 border-t border-[#E2DAD0] pt-3 text-[11.5px]">
            <div className="flex justify-between"><span className="font-bold">Third-party costs</span><span className="text-[10px] text-[#5C554C]">Paid directly to providers</span></div>
            {third.map((l) => <div key={l.id} className="flex justify-between"><span>{l.title}</span><span className="font-semibold tnum">≈ {fmtMoney(lineSubtotal(l), cur)}{l.period ? ` / ${l.period}` : ""}</span></div>)}
            <p className="mt-1 text-[10px] text-[#5C554C]">Estimates, settled separately with each provider. Not part of the Adsvio amount due.</p>
          </div>
        )}
        {isProposal && (snap.timingNotes || snap.exclusions || snap.revisionLimit || snap.paymentTerms) && (
          <div className="mt-4 space-y-1 border-t border-[#E2DAD0] pt-3 text-[10px] text-[#5C554C]">
            {snap.timingNotes && <p>Timing &amp; scope: {snap.timingNotes}</p>}
            {snap.revisionLimit && <p>Revisions: {snap.revisionLimit}</p>}
            {snap.exclusions && <p>Not included: {snap.exclusions}</p>}
            {snap.paymentTerms && <p>Terms: {snap.paymentTerms}</p>}
          </div>
        )}
        {isProposal && (
          <div className="mt-6 flex justify-between gap-6 border-t border-[#E2DAD0] pt-4 text-[11px]">
            <span className="w-1/2 border-b border-[#16130F] pb-1">Approved by:</span><span className="w-1/3 border-b border-[#16130F] pb-1">Date:</span>
          </div>
        )}
        <div className="mt-6 flex justify-between text-[9px] text-[#5C554C]"><span>All amounts in {cur === "USD" ? "US dollars (USD)" : cur === "DOP" ? "Dominican pesos (DOP)" : cur}.</span><span className="font-bold">ADSVIO AGENCY / 01</span></div>
      </div>
    </div>
  );
}
