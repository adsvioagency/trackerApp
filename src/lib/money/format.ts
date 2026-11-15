/**
 * Money helpers. All amounts are integer minor units (centavos / cents).
 * Reporting currency is DOP (RD$). USD is US$.
 */
export type Currency = "DOP" | "USD" | string;

export const CURRENCY_LABEL: Record<string, string> = { DOP: "RD$", USD: "US$" };

export function currencyLabel(c: Currency): string {
  return CURRENCY_LABEL[c] ?? c + " ";
}

/** Format minor units as "RD$ 1,234.50". */
export function fmtMoney(minor: number | null | undefined, currency: Currency = "DOP", opts: { signed?: boolean; compact?: boolean } = {}): string {
  if (minor === null || minor === undefined || Number.isNaN(minor)) return "—";
  const sign = minor < 0 ? "-" : opts.signed && minor > 0 ? "+" : "";
  const abs = Math.abs(minor);
  const major = abs / 100;
  const num = opts.compact && major >= 10000
    ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(major)
    : new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(major);
  return `${sign}${currencyLabel(currency)}${num}`;
}

/** Parse user input like "1,200.50" or "1200" to minor units. Returns null when invalid. */
export function parseMoney(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input * 100) : null;
  const cleaned = input.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned) return null;
  // Treat the last separator as decimal if followed by 1-2 digits.
  let normalized = cleaned;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma > lastDot && cleaned.length - lastComma <= 3) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = cleaned.replace(/,/g, "");
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function toMajor(minor: number): number {
  return minor / 100;
}

export function majorInput(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return "";
  return (minor / 100).toFixed(2);
}

/** Percent of a minor amount, rounded half away from zero. */
export function percentOf(minor: number, percent: number): number {
  return Math.round((minor * percent) / 100);
}

export function basisPointsOf(minor: number, bp: number): number {
  return Math.round((minor * bp) / 10_000);
}

export function sum(values: Array<number | null | undefined>): number {
  return values.reduce<number>((a, b) => a + (b ?? 0), 0);
}
