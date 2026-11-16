"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { setPipelineStageAction } from "./actions";
import type { PipelineStage } from "@/lib/business/clients";
import { fmtMoney } from "@/lib/money/format";
import { fmtDate } from "@/lib/dates";
import { Notice } from "@/components/ui";

export function ClientSearch() {
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();
  return (
    <label className="relative min-w-[220px] flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
      <input type="search" aria-label="Search clients" placeholder="Search company, contact, email, phone" className="input pl-9" defaultValue={sp.get("q") ?? ""} onChange={(e) => { const next = new URLSearchParams(sp.toString()); if (e.target.value) next.set("q", e.target.value); else next.delete("q"); router.replace(`${pathname}?${next.toString()}`); }} />
    </label>
  );
}

type C = { id: string; company: string; contactName: string | null; pipelineStage: PipelineStage; estimateMinor: number | null; estimateCurrency: string | null; followUpDate: string | null };

export function PipelineBoard({ stages, clients, today }: { stages: { value: PipelineStage; label: string }[]; clients: C[]; today: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const move = (id: string, stage: PipelineStage) => start(async () => { await setPipelineStageAction(id, stage); router.refresh(); });
  const all = [...stages, { value: "won" as PipelineStage, label: "Won" }, { value: "lost" as PipelineStage, label: "Lost" }];
  return (
    <div>
      <Notice tone="neutral" className="mb-3">Prospect estimates stay outside confirmed receivables. Moving a prospect to Won makes it an active client.</Notice>
      <div className="grid gap-3 md:grid-cols-3">
        {stages.map((s) => {
          const list = clients.filter((c) => c.pipelineStage === s.value);
          const est = list.reduce((sum, c) => sum + (c.estimateCurrency === "USD" ? c.estimateMinor ?? 0 : 0), 0);
          return (
            <section key={s.value} className="card p-3" aria-label={s.label}>
              <header className="mb-2 flex items-baseline justify-between"><h2 className="text-[13px] font-bold uppercase tracking-wide">{s.label}</h2><span className="muted text-[12px]">{list.length}{est ? ` · ~${fmtMoney(est, "USD")}` : ""}</span></header>
              <ul className="space-y-2">
                {list.map((c) => (
                  <li key={c.id} className="rounded-lg border border-rule bg-surface-2/40 p-2.5">
                    <Link href={`/clients/${c.id}`} className="font-semibold hover:underline">{c.company}</Link>
                    <div className="muted text-[12px]">{c.contactName ?? "—"}{c.estimateMinor ? ` · est. ${fmtMoney(c.estimateMinor, c.estimateCurrency ?? "USD")}` : ""}{c.followUpDate ? ` · follow up ${fmtDate(c.followUpDate, "short")}${c.followUpDate < today ? " (overdue)" : ""}` : ""}</div>
                    <label className="mt-2 block text-[12px]">
                      <span className="sr-only">Move {c.company} to stage</span>
                      <select className="select py-1 text-[12px]" value={c.pipelineStage} disabled={pending} onChange={(e) => move(c.id, e.target.value as PipelineStage)}>
                        {all.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                  </li>
                ))}
                {list.length === 0 && <li className="muted py-3 text-center text-[12px]">Empty</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
