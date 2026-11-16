import "server-only";
import { monthEnd, monthKey, monthStart, yearEnd, yearStart } from "@/lib/dates";
import { paycheckWindowFor } from "@/lib/money/paydays";
import type { Workspace } from "@/lib/settings";

export type ResolvedPeriod = { kind: "month" | "paycheck" | "year" | "custom"; month: string; year: string; from: string; to: string; paydayId?: string; label: string };

/** Resolve URL search params into a concrete date range. */
export async function resolvePeriodParams(userId: string, workspace: Workspace | "combined", sp: Record<string, string | undefined>, today: string): Promise<ResolvedPeriod> {
  const kind = (sp.period === "paycheck" || sp.period === "year" || sp.period === "custom" ? sp.period : "month") as ResolvedPeriod["kind"];
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : monthKey(today);
  const year = /^\d{4}$/.test(sp.year ?? "") ? sp.year! : today.slice(0, 4);
  if (kind === "year") return { kind, month, year, from: yearStart(Number(year)), to: yearEnd(Number(year)), label: year };
  if (kind === "custom") {
    const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : monthStart(month);
    const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : monthEnd(month);
    return { kind, month, year, from, to, label: `${from} to ${to}` };
  }
  if (kind === "paycheck" && workspace !== "combined") {
    const win = await paycheckWindowFor(userId, workspace, today);
    if (win) {
      let w = win;
      if (sp.payday) {
        const alt = await paycheckWindowFor(userId, workspace, sp.payday.length === 10 ? sp.payday : today);
        if (alt) w = alt;
      }
      return { kind, month: monthKey(w.start), year, from: w.start, to: w.end, paydayId: w.payday.id, label: `Paycheck ${w.start} to ${w.end}` };
    }
  }
  return { kind: "month", month, year, from: monthStart(month), to: monthEnd(month), label: month };
}
