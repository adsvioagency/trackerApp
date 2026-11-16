"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPhaseAction } from "./actions";
import { Pill, cx } from "@/components/ui";
import { fmtDate } from "@/lib/dates";

type P = { id: string; name: string; clientName: string; status: string; waitingOnClient: boolean; targetDate: string | null; phases: { id: string; name: string; sort: number }[]; currentPhaseId: string | null; nextAction: string | null };

/** Board grouped by the current phase name. Moving uses a select (keyboard/touch friendly) instead of dragging. */
export function PhaseBoard({ projects, today }: { projects: P[]; today: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const columns = [...new Map(projects.flatMap((p) => p.phases.map((ph) => [ph.name, ph.sort] as const)).sort((a, b) => a[1] - b[1])).keys()];
  const move = (p: P, phaseName: string) => {
    const ph = p.phases.find((x) => x.name === phaseName);
    if (!ph) return;
    start(async () => { await setPhaseAction(p.id, ph.id); router.refresh(); });
  };
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
      <div className="flex gap-3" style={{ minWidth: `${columns.length * 240}px` }}>
        {columns.map((col) => {
          const list = projects.filter((p) => p.phases.find((x) => x.id === p.currentPhaseId)?.name === col);
          return (
            <section key={col} className="card w-[240px] shrink-0 p-3" aria-label={col}>
              <header className="mb-2 flex items-baseline justify-between"><h2 className="text-[12px] font-bold uppercase tracking-wide">{col}</h2><span className="muted text-[12px]">{list.length}</span></header>
              <ul className="space-y-2">
                {list.map((p) => (
                  <li key={p.id} className={cx("rounded-lg border border-rule bg-surface-2/40 p-2.5", (p.waitingOnClient || p.status === "waiting_client") && "border-warn/50")}>
                    <Link href={`/projects/${p.id}`} className="font-semibold hover:underline">{p.name}</Link>
                    <div className="muted text-[12px]">{p.clientName}{p.targetDate ? ` · ${fmtDate(p.targetDate, "short")}${p.targetDate < today ? " (past)" : ""}` : ""}</div>
                    {(p.waitingOnClient || p.status === "waiting_client") && <Pill tone="warn" className="mt-1">Waiting on client</Pill>}
                    {p.nextAction && <div className="mt-1 text-[12px]">Next: {p.nextAction}</div>}
                    <label className="mt-2 block">
                      <span className="sr-only">Move {p.name} to phase</span>
                      <select className="select py-1 text-[12px]" value={col} disabled={pending} onChange={(e) => move(p, e.target.value)}>
                        {p.phases.map((ph) => <option key={ph.id} value={ph.name}>{ph.name}</option>)}
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
