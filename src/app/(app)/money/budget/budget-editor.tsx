"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Copy } from "lucide-react";
import type { BudgetPlan, BudgetLine } from "@/lib/money/budget";
import { fmtMoney, majorInput, parseMoney } from "@/lib/money/format";
import { ProgressBar, cx, Field } from "@/components/ui";
import { copyPlanAction, rolloverAdjustmentAction, setBudgetLineAction, setRolloverAction } from "@/app/(app)/money/actions";
import { SubmitButton, ActionMessage, useAfterSuccess, type ActionState } from "@/components/forms";
import { useActionState } from "react";

function AmountCell({ line, plan, workspace, periodType, periodKey, value }: { line: BudgetLine; plan: BudgetPlan; workspace: "personal" | "business"; periodType: "month" | "paycheck"; periodKey: string; value: number }) {
  const [val, setVal] = useState(value ? majorInput(value) : "");
  const [pending, start] = useTransition();
  const router = useRouter();
  void plan;
  const commit = () => {
    const minor = parseMoney(val) ?? 0;
    if (minor === value) return;
    const fd = new FormData();
    fd.set("workspace", workspace);
    fd.set("categoryId", line.categoryId);
    fd.set("periodType", periodType);
    fd.set("periodKey", periodKey);
    fd.set("amount", String(minor / 100));
    start(async () => {
      await setBudgetLineAction(null, fd);
      router.refresh();
    });
  };
  return (
    <input
      aria-label={`${line.name} target`}
      className={cx("input w-[110px] py-1 text-right text-[14px]", pending && "opacity-60")}
      inputMode="decimal"
      placeholder="0.00"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function RolloverPanel({ line, month }: { line: BudgetLine; month: string }) {
  const [state, action] = useActionState<ActionState, FormData>(rolloverAdjustmentAction, null);
  const router = useRouter();
  const [pending, start] = useTransition();
  useAfterSuccess(state);
  return (
    <div className="mt-2 rounded-lg bg-surface-2/60 p-3 text-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" className="size-4 accent-[var(--mango-deep)]" checked={line.rolloverEnabled} disabled={pending} onChange={(e) => start(async () => { await setRolloverAction(line.categoryId, e.target.checked, month); router.refresh(); })} />
          Roll over unused or overspent amounts month to month
        </label>
        {line.rolloverEnabled && <span className="muted">Carried into this month: <span className={cx("font-semibold", line.carryMinor < 0 ? "text-danger" : "text-ink")}>{fmtMoney(line.carryMinor, "DOP", { signed: true })}</span>{line.adjustmentMinor ? ` · manual ${fmtMoney(line.adjustmentMinor, "DOP", { signed: true })}` : ""}</span>}
      </div>
      {line.rolloverEnabled && (
        <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="categoryId" value={line.categoryId} />
          <input type="hidden" name="month" value={month} />
          <Field label="Adjust carry (+/−)" htmlFor={`adj-${line.categoryId}`}>
            <input id={`adj-${line.categoryId}`} name="amount" className="input w-[130px] py-1" inputMode="decimal" placeholder="-500.00" />
          </Field>
          <Field label="Why" htmlFor={`adjn-${line.categoryId}`}>
            <input id={`adjn-${line.categoryId}`} name="note" className="input w-[200px] py-1" placeholder="e.g. forgive overspend" />
          </Field>
          <SubmitButton className="btn btn-secondary btn-sm">Apply</SubmitButton>
          <ActionMessage state={state} />
        </form>
      )}
      {line.paycheckAllocations.length > 0 && <div className="muted mt-2">Paycheck allocations in this month: {line.paycheckAllocations.map((a) => `${fmtMoney(a.amountMinor)} (${a.date})`).join(", ")}{line.monthLineMinor ? ` · plus ${fmtMoney(line.monthLineMinor)} set on the month` : ""}.</div>}
    </div>
  );
}

export function BudgetEditor({ plan, workspace }: { plan: BudgetPlan; workspace: "personal" | "business" }) {
  const [open, setOpen] = useState<string | null>(null);
  const [copying, start] = useTransition();
  const router = useRouter();
  const isPaycheck = plan.period.type === "paycheck";
  const periodType = isPaycheck ? "paycheck" : "month";
  const periodKey = plan.period.type === "paycheck" ? plan.period.paydayId : plan.period.month;
  const hasAnyTarget = plan.lines.some((l) => l.targetMinor > 0);
  return (
    <div className="space-y-4">
      {!hasAnyTarget && !isPaycheck && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-rule-strong p-3 text-[13px]">
          <span>Type a target next to each category. You can also</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={copying} onClick={() => start(async () => { const n = await copyPlanAction(plan.period.month, workspace); router.refresh(); if (!n) alert("Last month has no plan to copy."); })}>
            <Copy className="size-4" /> copy last month&apos;s plan
          </button>
        </div>
      )}
      {plan.groups.map((g) => (
        <section key={g.id} className="card overflow-hidden">
          <header className="flex items-center justify-between gap-3 border-b border-rule bg-surface-2/50 px-4 py-2">
            <h2 className="text-[13px] font-bold uppercase tracking-wide">{g.name}</h2>
            <div className="muted text-[12px] tnum">{fmtMoney(g.actualMinor)} of {fmtMoney(g.targetMinor)} · <span className={g.remainingMinor < 0 ? "font-semibold text-danger" : ""}>{fmtMoney(g.remainingMinor)} left</span></div>
          </header>
          <ul>
            {g.lines.map((l) => {
              const over = l.remainingMinor < 0;
              const near = !over && l.availableMinor > 0 && l.remainingMinor / l.availableMinor <= 0.15;
              const expanded = open === l.categoryId;
              return (
                <li key={l.categoryId} id={`cat-${l.categoryId}`} className="border-b border-rule px-3 py-2.5 last:border-b-0 md:px-4">
                  <div className="flex items-center gap-3">
                    <button type="button" className="btn btn-ghost btn-icon btn-sm -ml-2" aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} details for ${l.name}`} onClick={() => setOpen(expanded ? null : l.categoryId)}>
                      {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <Link href={`/money/transactions?category=${l.categoryId}&period=custom&from=${plan.period.from}&to=${plan.period.to}`} className="font-medium hover:underline">{l.name}</Link>
                        <span className={cx("text-[12px] font-semibold tnum", over ? "text-danger" : near ? "text-warn" : "text-ink-soft")}>{over ? `Over by ${fmtMoney(-l.remainingMinor)}` : `${fmtMoney(l.remainingMinor)} left`}</span>
                        {l.carryMinor !== 0 && <span className="pill pill-neutral">carry {fmtMoney(l.carryMinor, "DOP", { signed: true })}</span>}
                        {l.missingCount > 0 && <span className="pill pill-warn">{l.missingCount} need RD$</span>}
                      </div>
                      <ProgressBar value={l.actualMinor} max={l.availableMinor} label={`${l.name}: spent ${fmtMoney(l.actualMinor)} of ${fmtMoney(l.availableMinor)}`} />
                      <div className="muted mt-0.5 text-[12px] tnum">Spent {fmtMoney(l.actualMinor)} of {fmtMoney(l.availableMinor)}{l.headroomPct !== null ? ` · ${l.headroomPct}% headroom` : ""}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <AmountCell line={l} plan={plan} workspace={workspace} periodType={periodType} periodKey={periodKey} value={isPaycheck ? l.targetMinor : l.monthLineMinor} />
                      {!isPaycheck && l.paycheckAllocations.length > 0 && <div className="muted mt-0.5 text-[11px]">+ {fmtMoney(l.paycheckAllocations.reduce((s, a) => s + a.amountMinor, 0))} from paychecks</div>}
                    </div>
                  </div>
                  {expanded && !isPaycheck && <RolloverPanel line={l} month={plan.period.month} />}
                  {expanded && isPaycheck && <div className="muted mt-2 text-[13px]">Allocation for this paycheck only. Month totals add every paycheck in the month plus any amount set on the month view.</div>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="muted text-[12px]">Targets save when you leave the field. Rollover carries a category&apos;s unused (or overspent) amount into the next month once enabled; adjust it explicitly when you want to forgive or add.</p>
    </div>
  );
}
