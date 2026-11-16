import "server-only";
import type { WorkspaceView } from "@/lib/settings";
import { addMonthsKey, monthEnd, monthStart } from "@/lib/dates";
import { incomeTotal, spendingByCategory } from "./transactions";
import { getCategoryIndex } from "./categories";

export type TrendPoint = { month: string; incomeMinor: number; spendingMinor: number; netMinor: number; missing: number };

/** Monthly cash flow trend in DOP for the last `months` months ending at `endMonth`. */
export async function cashFlowTrend(userId: string, workspace: WorkspaceView, endMonth: string, months = 6): Promise<TrendPoint[]> {
  const out: TrendPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = addMonthsKey(endMonth, -i);
    const [inc, sp] = await Promise.all([incomeTotal(userId, workspace, monthStart(m), monthEnd(m)), spendingByCategory(userId, workspace, monthStart(m), monthEnd(m))]);
    out.push({ month: m, incomeMinor: inc.dopMinor, spendingMinor: sp.totalDop, netMinor: inc.dopMinor - sp.totalDop, missing: inc.missingCount + sp.missingCount });
  }
  return out;
}

export type CategoryBreakdownRow = { categoryId: string | null; name: string; groupName: string; kind: string; dopMinor: number; missingCount: number; pct: number; nativeByCurrency: Record<string, number> };

export async function spendingBreakdown(userId: string, workspace: WorkspaceView, from: string, to: string): Promise<{ rows: CategoryBreakdownRow[]; totalDop: number; missingCount: number; byGroup: { groupName: string; kind: string; dopMinor: number }[] }> {
  const sp = await spendingByCategory(userId, workspace, from, to);
  const idx = await getCategoryIndex(userId);
  const rows: CategoryBreakdownRow[] = [];
  for (const [catId, line] of sp.lines) {
    const meta = catId ? idx.get(catId) : null;
    rows.push({ categoryId: catId, name: meta?.name ?? "Uncategorized", groupName: meta?.groupName ?? "—", kind: meta?.kind ?? "expenses", dopMinor: line.dopMinor, missingCount: line.missingCount, pct: sp.totalDop > 0 ? Math.round((line.dopMinor / sp.totalDop) * 100) : 0, nativeByCurrency: line.nativeByCurrency });
  }
  rows.sort((a, b) => b.dopMinor - a.dopMinor);
  const groups = new Map<string, { groupName: string; kind: string; dopMinor: number }>();
  for (const r of rows) {
    const g = groups.get(r.groupName) ?? { groupName: r.groupName, kind: r.kind, dopMinor: 0 };
    g.dopMinor += r.dopMinor;
    groups.set(r.groupName, g);
  }
  return { rows, totalDop: sp.totalDop, missingCount: sp.missingCount, byGroup: [...groups.values()].sort((a, b) => b.dopMinor - a.dopMinor) };
}
