"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { ActionMessage, SubmitButton, type ActionState } from "@/components/forms";
import { WorkspaceBadge } from "@/components/ui";

export type QuickFormProps = {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  title: string;
  workspace?: "personal" | "business";
  submitLabel?: string;
  backHref: string;
  /** Where "Done" goes after a successful save. */
  doneHref?: string;
  /** Build a link to the created record from its id. */
  recordHref?: (id: string) => string;
  children: (ctx: { key: number; idempotencyKey: string }) => ReactNode;
  hiddenFields?: Record<string, string | undefined>;
  wide?: boolean;
};

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/**
 * Full-page quick-add frame: reads like a sheet on phones, a centered card on
 * desktop. Each submission carries a one-time idempotency key so a retried save
 * never creates a duplicate record.
 */
export function QuickForm({ action, title, workspace, submitLabel = "Save", backHref, doneHref, recordHref, children, hiddenFields, wide }: QuickFormProps) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const [idem] = useState(newKey);
  const saved = !!state?.ok;
  const hidden = useMemo(() => Object.entries(hiddenFields ?? {}).filter(([, v]) => v !== undefined), [hiddenFields]);

  return (
    <div className={`mx-auto w-full ${wide ? "max-w-[880px]" : "max-w-[640px]"}`}>
      <div className="mb-3 flex items-center gap-3">
        <Link href={backHref} className="btn btn-ghost btn-sm -ml-2" aria-label="Back">
          <ArrowLeft className="size-4" /> Back
        </Link>
      </div>
      <div className="card p-4 md:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h1 className="text-[22px] font-extrabold">{title}</h1>
          {workspace && (
            <span className="muted flex items-center gap-1.5 text-[13px]">
              saving to <WorkspaceBadge workspace={workspace} />
            </span>
          )}
        </div>
        {saved ? (
          <div className="space-y-4">
            <ActionMessage state={state} />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => window.location.reload()}
              >
                Add another
              </button>
              {state?.id && recordHref && (
                <Link href={recordHref(state.id)} className="btn btn-secondary">
                  Open record
                </Link>
              )}
              <Link href={doneHref ?? backHref} className="btn btn-primary">
                Done
              </Link>
            </div>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="idempotencyKey" value={idem} />
            {hidden.map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            {children({ key: 0, idempotencyKey: idem })}
            <ActionMessage state={state} />
            <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-rule bg-surface px-4 pb-1 pt-3 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
              <SubmitButton className="btn btn-primary flex-1 md:flex-none">{submitLabel}</SubmitButton>
              <Link href={backHref} className="btn btn-ghost">
                Cancel
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
