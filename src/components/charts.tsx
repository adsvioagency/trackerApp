import Link from "next/link";
import { fmtMoney } from "@/lib/money/format";
import { cx } from "@/components/ui";

/** Horizontal spending bars with accessible values and drill-down links. */
export function SpendingBars({ rows, total, hrefFor }: { rows: { key: string; label: string; sub?: string; value: number; tone?: "mango" | "teal" | "ink" }[]; total: number; hrefFor?: (key: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2" aria-label="Spending by category">
      {rows.map((r) => {
        const pct = total > 0 ? Math.round((r.value / total) * 100) : 0;
        const inner = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate font-medium">{r.label}{r.sub && <span className="muted"> · {r.sub}</span>}</span>
              <span className="tnum shrink-0">{fmtMoney(r.value)} <span className="muted">· {pct}%</span></span>
            </div>
            <div className="bar mt-1" role="img" aria-label={`${r.label}: ${fmtMoney(r.value)}, ${pct}% of total`}>
              <span style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: r.tone === "teal" ? "var(--teal)" : r.tone === "ink" ? "var(--ink-soft)" : "var(--mango)" }} />
            </div>
          </>
        );
        return <li key={r.key}>{hrefFor ? <Link href={hrefFor(r.key)} className="block rounded-lg px-1 py-1 hover:bg-surface-2/70">{inner}</Link> : <div className="px-1 py-1">{inner}</div>}</li>;
      })}
    </ul>
  );
}

/** Budget vs actual grouped bars. */
export function BudgetVsActual({ rows, hrefFor }: { rows: { key: string; label: string; planned: number; actual: number }[]; hrefFor?: (key: string) => string }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.planned, r.actual]));
  return (
    <ul className="space-y-3" aria-label="Budget versus actual">
      {rows.map((r) => {
        const over = r.actual > r.planned && r.planned > 0;
        const body = (
          <>
            <div className="flex items-baseline justify-between text-[13px]"><span className="font-medium">{r.label}</span><span className={cx("tnum", over && "font-semibold text-danger")}>{fmtMoney(r.actual)} / {fmtMoney(r.planned)}</span></div>
            <div className="mt-1 space-y-0.5" role="img" aria-label={`${r.label}: planned ${fmtMoney(r.planned)}, actual ${fmtMoney(r.actual)}`}>
              <div className="bar"><span style={{ width: `${(r.planned / max) * 100}%`, background: "var(--rule-strong)" }} /></div>
              <div className={cx("bar", over && "over")}><span style={{ width: `${(r.actual / max) * 100}%` }} /></div>
            </div>
          </>
        );
        return <li key={r.key}>{hrefFor ? <Link href={hrefFor(r.key)} className="block rounded-lg px-1 py-1 hover:bg-surface-2/70">{body}</Link> : <div className="px-1 py-1">{body}</div>}</li>;
      })}
      <li className="muted flex items-center gap-3 text-[11px]"><span className="inline-block h-2 w-5 rounded bg-rule-strong" /> planned <span className="inline-block h-2 w-5 rounded bg-teal" /> actual</li>
    </ul>
  );
}

/** Monthly cash flow trend as grouped columns with an accessible table. */
export function CashFlowChart({ points, hrefFor }: { points: { month: string; incomeMinor: number; spendingMinor: number; netMinor: number }[]; hrefFor?: (month: string) => string }) {
  const max = Math.max(1, ...points.flatMap((p) => [p.incomeMinor, p.spendingMinor]));
  const W = 560;
  const H = 180;
  const pad = 8;
  const colW = (W - pad * 2) / Math.max(1, points.length);
  const barW = Math.max(6, colW * 0.3);
  const label = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString("en-US", { month: "short" });
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="h-auto w-full" role="img" aria-label="Monthly income and spending">
        {points.map((p, i) => {
          const x = pad + i * colW + colW / 2;
          const hi = (p.incomeMinor / max) * H;
          const hs = (p.spendingMinor / max) * H;
          return (
            <g key={p.month}>
              <rect x={x - barW - 2} y={H - hi} width={barW} height={hi} rx={3} fill="var(--teal)" />
              <rect x={x + 2} y={H - hs} width={barW} height={hs} rx={3} fill="var(--mango)" />
              <text x={x} y={H + 16} textAnchor="middle" fontSize="11" fill="var(--ink-soft)" fontFamily="var(--font-sans)">{label(p.month)}</text>
            </g>
          );
        })}
        <line x1={pad} x2={W - pad} y1={H} y2={H} stroke="var(--rule)" />
      </svg>
      <div className="muted mt-1 flex gap-3 text-[11px]"><span className="inline-flex items-center gap-1"><span className="inline-block size-2 rounded-sm bg-teal" /> income</span><span className="inline-flex items-center gap-1"><span className="inline-block size-2 rounded-sm bg-mango" /> spending</span></div>
      <table className="table mt-3">
        <thead><tr><th>Month</th><th className="num">Income</th><th className="num">Spending</th><th className="num">Net</th></tr></thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.month}>
              <td>{hrefFor ? <Link href={hrefFor(p.month)} className="font-medium hover:underline">{label(p.month)} {p.month.slice(0, 4)}</Link> : p.month}</td>
              <td className="num">{fmtMoney(p.incomeMinor)}</td>
              <td className="num">{fmtMoney(p.spendingMinor)}</td>
              <td className={cx("num font-semibold", p.netMinor < 0 ? "text-danger" : "text-ok")}>{fmtMoney(p.netMinor, "DOP", { signed: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
