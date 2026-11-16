"use client";

import { Search } from "lucide-react";
import { usePeriodParams } from "@/components/period-picker";

export function TxSearch() {
  const { sp, set } = usePeriodParams();
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <label className="relative flex-1 min-w-[200px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
        <input type="search" aria-label="Search merchant or note" placeholder="Search merchant or note" className="input pl-9" defaultValue={sp.get("q") ?? ""} onKeyDown={(e) => { if (e.key === "Enter") set({ q: (e.target as HTMLInputElement).value }); }} onBlur={(e) => set({ q: e.target.value })} />
      </label>
      <select aria-label="Type" className="select w-auto py-1.5 text-[13px]" value={sp.get("kind") ?? ""} onChange={(e) => set({ kind: e.target.value })}>
        <option value="">All types</option>
        <option value="spending">Spending</option>
        <option value="income">Income</option>
        <option value="transfers">Transfers</option>
        <option value="debt_payment">Debt payments</option>
        <option value="owner_draw">Owner draws</option>
        <option value="owner_contribution">Owner contributions</option>
      </select>
      <label className="flex items-center gap-1.5 text-[13px]">
        <input type="checkbox" className="size-4 accent-[var(--mango-deep)]" checked={sp.get("all") === "1"} onChange={(e) => set({ all: e.target.checked ? "1" : null })} /> Ignore period
      </label>
    </div>
  );
}
