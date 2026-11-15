/**
 * Pure document math for proposals and invoices. Shared by server, UI preview and PDF.
 * Amounts are minor units.
 */
import type { DocInstallment, DocLine, DocTax, DocTotals } from "@/db/schema";
import { basisPointsOf } from "@/lib/money/format";

export function lineSubtotal(line: DocLine): number {
  const gross = Math.round(line.quantity * line.rateMinor);
  return Math.max(0, gross - (line.discountMinor ?? 0));
}

export function lineStandard(line: DocLine): number {
  return Math.round(line.quantity * (line.standardRateMinor ?? line.rateMinor));
}

/** A line is billed by the agency when it is a service, or a selected optional line. */
export function isIncluded(line: DocLine): boolean {
  if (line.kind === "third_party") return false;
  if (line.optional) return !!line.selected;
  return true;
}

export function computeTotals(lines: DocLine[], projectDiscountMinor: number, taxes: DocTax[]): DocTotals {
  const included = lines.filter(isIncluded);
  const servicesSubtotalMinor = included.reduce((s, l) => s + lineSubtotal(l), 0);
  const lineDiscountsMinor = included.reduce((s, l) => s + (l.discountMinor ?? 0), 0);
  const standardSubtotalMinor = included.reduce((s, l) => s + lineStandard(l), 0);
  const projectDiscount = Math.min(Math.max(0, projectDiscountMinor), servicesSubtotalMinor);
  const servicesTotalMinor = servicesSubtotalMinor - projectDiscount;
  const taxMinor = taxes.reduce((s, t) => s + basisPointsOf(servicesTotalMinor, t.rateBasisPoints), 0);
  return {
    standardSubtotalMinor,
    servicesSubtotalMinor,
    lineDiscountsMinor,
    projectDiscountMinor: projectDiscount,
    servicesTotalMinor,
    taxMinor,
    totalMinor: servicesTotalMinor + taxMinor,
    maintenanceMinor: included.filter((l) => l.kind === "maintenance").reduce((s, l) => s + lineSubtotal(l), 0),
    thirdPartyMinor: lines.filter((l) => l.kind === "third_party").reduce((s, l) => s + lineSubtotal(l), 0),
    includedLineIds: included.map((l) => l.id),
  };
}

/** Resolve installment amounts against a total; percent splits are rounded so they add up exactly. */
export function installmentAmounts(totalMinor: number, installments: DocInstallment[]): { installment: DocInstallment; amountMinor: number }[] {
  const out = installments.map((i) => ({ installment: i, amountMinor: i.mode === "percent" ? Math.round((totalMinor * i.value) / 100) : Math.round(i.value) }));
  const percentOnly = installments.every((i) => i.mode === "percent");
  const pctSum = installments.reduce((s, i) => (i.mode === "percent" ? s + i.value : s), 0);
  if (percentOnly && Math.abs(pctSum - 100) < 0.001 && out.length) {
    const diff = totalMinor - out.reduce((s, o) => s + o.amountMinor, 0);
    out[out.length - 1].amountMinor += diff;
  }
  return out;
}

export function defaultInstallments(kind: "full" | "half" | "thirds"): DocInstallment[] {
  if (kind === "half") {
    return [
      { id: "dep", label: "50% to begin", kind: "deposit", mode: "percent", value: 50 },
      { id: "fin", label: "50% before launch", kind: "final", mode: "percent", value: 50 },
    ];
  }
  if (kind === "thirds") {
    return [
      { id: "dep", label: "Deposit to begin", kind: "deposit", mode: "percent", value: 40 },
      { id: "mid", label: "Design approval", kind: "milestone", mode: "percent", value: 30 },
      { id: "fin", label: "Before launch", kind: "final", mode: "percent", value: 30 },
    ];
  }
  return [{ id: "full", label: "Full amount", kind: "full", mode: "percent", value: 100 }];
}
