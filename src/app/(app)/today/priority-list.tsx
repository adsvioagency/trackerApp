"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ArrowRight } from "lucide-react";
import type { Priority } from "@/lib/today";
import { WorkspaceBadge, Money, cx } from "@/components/ui";
import { completeTaskAction } from "./actions";

export function PriorityList({ items, showWorkspace }: { items: Priority[]; showWorkspace: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <ol className="space-y-2">
      {items.map((p, i) => {
        const tone = p.severity === 1 ? "border-l-danger" : p.severity === 2 ? "border-l-warn" : "border-l-teal";
        return (
          <li key={p.id} className={cx("card flex flex-col gap-3 border-l-4 p-3.5 md:flex-row md:items-center md:p-4", tone)}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-bold text-ink-muted">{i + 1}</span>
                <Link href={p.href} className="font-semibold hover:underline">
                  {p.title}
                </Link>
                {showWorkspace && <WorkspaceBadge workspace={p.workspace} />}
                {p.amountMinor != null && p.currency && <Money minor={p.amountMinor} currency={p.currency} className="font-semibold" />}
              </div>
              <p className="muted mt-0.5 text-[13px]">{p.reason}</p>
            </div>
            <div className="shrink-0">
              {p.action.kind === "complete_task" && p.action.id ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await completeTaskAction(p.action.id!);
                      router.refresh();
                    })
                  }
                  className="btn btn-secondary btn-sm"
                >
                  <Check className="size-4" /> {p.action.label}
                </button>
              ) : p.action.kind === "open_pay_bill" && p.action.id ? (
                <Link href={`/money/bills?occ=${p.action.id}`} className="btn btn-secondary btn-sm">
                  {p.action.label} <ArrowRight className="size-4" />
                </Link>
              ) : p.action.kind === "open_payment" && p.action.id ? (
                <Link href={`/add/payment?invoice=${p.action.id}`} className="btn btn-secondary btn-sm">
                  {p.action.label} <ArrowRight className="size-4" />
                </Link>
              ) : (
                <Link href={p.href} className="btn btn-secondary btn-sm">
                  {p.action.label} <ArrowRight className="size-4" />
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
