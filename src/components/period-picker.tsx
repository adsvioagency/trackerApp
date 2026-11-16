"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CategoryTree } from "@/lib/money/categories";

export type PeriodKind = "month" | "paycheck" | "year" | "custom";

export function usePeriodParams() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [router, pathname, sp],
  );
  return { sp, set };
}

function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Period + account + category filter bar. State lives in the URL so it survives navigation. */
export function PeriodPicker({ period, month, year, from, to, accounts, tree, showPaycheck = true, paydays }: { period: PeriodKind; month: string; year: string; from: string; to: string; accounts: { id: string; name: string }[]; tree?: CategoryTree; showPaycheck?: boolean; paydays?: { id: string; label: string }[] }) {
  const { sp, set } = usePeriodParams();
  const label = period === "month" ? new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : period === "year" ? year : `${from} → ${to}`;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label="Period" className="inline-flex rounded-[10px] border border-rule bg-surface p-0.5">
        {(["month", ...(showPaycheck ? ["paycheck"] : []), "year", "custom"] as PeriodKind[]).map((p) => (
          <button key={p} type="button" role="radio" aria-checked={period === p} onClick={() => set({ period: p })} className={`rounded-lg px-2.5 py-1.5 text-[13px] font-medium capitalize ${period === p ? "bg-ink text-paper" : "text-ink-soft hover:bg-surface-2"}`}>
            {p}
          </button>
        ))}
      </div>
      {period === "month" && (
        <div className="inline-flex items-center rounded-[10px] border border-rule bg-surface">
          <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Previous month" onClick={() => set({ month: shiftMonth(month, -1) })}>
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-[140px] text-center text-[13px] font-semibold">{label}</span>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Next month" onClick={() => set({ month: shiftMonth(month, 1) })}>
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
      {period === "year" && (
        <div className="inline-flex items-center rounded-[10px] border border-rule bg-surface">
          <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Previous year" onClick={() => set({ year: String(Number(year) - 1) })}>
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-[70px] text-center text-[13px] font-semibold">{year}</span>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Next year" onClick={() => set({ year: String(Number(year) + 1) })}>
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
      {period === "paycheck" && paydays && paydays.length > 0 && (
        <select aria-label="Paycheck" className="select w-auto py-1.5 text-[13px]" value={sp.get("payday") ?? ""} onChange={(e) => set({ payday: e.target.value })}>
          <option value="">Current paycheck</option>
          {paydays.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      )}
      {period === "custom" && (
        <div className="flex items-center gap-1.5">
          <input type="date" aria-label="From" className="input w-auto py-1.5 text-[13px]" defaultValue={from} onChange={(e) => set({ from: e.target.value })} />
          <span className="muted text-[12px]">to</span>
          <input type="date" aria-label="To" className="input w-auto py-1.5 text-[13px]" defaultValue={to} onChange={(e) => set({ to: e.target.value })} />
        </div>
      )}
      {accounts.length > 0 && (
        <select aria-label="Account" className="select w-auto py-1.5 text-[13px]" value={sp.get("account") ?? ""} onChange={(e) => set({ account: e.target.value })}>
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}
      {tree && (
        <select aria-label="Category" className="select w-auto py-1.5 text-[13px]" value={sp.get("category") ?? ""} onChange={(e) => set({ category: e.target.value })}>
          <option value="">All categories</option>
          {tree.map((g) => (
            <optgroup key={g.id} label={g.name}>
              {g.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
    </div>
  );
}
