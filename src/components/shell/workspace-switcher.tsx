"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setWorkspaceAction } from "@/app/(app)/actions";
import type { WorkspaceView } from "@/lib/settings";
import { cx } from "@/components/ui";

const OPTIONS: { value: WorkspaceView; label: string }[] = [
  { value: "personal", label: "Personal" },
  { value: "business", label: "Business" },
  { value: "combined", label: "Combined" },
];

export function WorkspaceSwitcher({ view, full }: { view: WorkspaceView; full?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div role="radiogroup" aria-label="Workspace" className={cx("inline-flex rounded-[10px] border border-rule bg-surface p-0.5", full && "w-full", pending && "opacity-70")}>
      {OPTIONS.map((o) => {
        const active = o.value === view;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={pending}
            onClick={() =>
              start(async () => {
                await setWorkspaceAction(o.value);
                router.refresh();
              })
            }
            className={cx(
              "rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition-colors",
              full && "flex-1",
              active && o.value === "business" && "bg-mango-deep text-white",
              active && o.value === "personal" && "bg-teal-deep text-white",
              active && o.value === "combined" && "bg-ink text-paper",
              !active && "text-ink-soft hover:bg-surface-2 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
