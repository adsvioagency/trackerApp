"use client";

import { useFormStatus } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { cx } from "./ui";

export function SubmitButton({ children, className = "btn btn-primary", pendingText = "Saving…", disabled }: { children: ReactNode; className?: string; pendingText?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-busy={pending}>
      {pending ? pendingText : children}
    </button>
  );
}

/**
 * Sheet: bottom sheet on phones, centered dialog on desktop. Uses the native
 * <dialog> element for focus trapping and Escape handling.
 */
export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={cx("sheet", wide && "md:w-[min(100vw,880px)]")}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="sheet-title"
    >
      <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3 md:px-5">
        <h2 id="sheet-title" className="text-[17px] font-bold">
          {title}
        </h2>
        <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <div className="max-h-[calc(92dvh-64px)] overflow-y-auto px-4 py-4 md:px-5 safe-bottom">{open ? children : null}</div>
    </dialog>
  );
}

/** Button that opens a sheet containing arbitrary content. */
export function SheetButton({ label, title, className = "btn btn-primary", children, wide, icon }: { label: ReactNode; title: ReactNode; className?: string; children: (close: () => void) => ReactNode; wide?: boolean; icon?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {icon}
        {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title} wide={wide}>
        {children(() => setOpen(false))}
      </Sheet>
    </>
  );
}

export type ActionState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string>; id?: string } | null;

/** Shows the result of a server action in plain English. */
export function ActionMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.error) {
    return (
      <p role="alert" className="rounded-[10px] bg-danger-wash px-3 py-2 text-[13px] font-medium text-danger">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="rounded-[10px] bg-ok-wash px-3 py-2 text-[13px] font-medium text-ok">
        {state.message}
      </p>
    );
  }
  return null;
}

/** Refreshes server data and optionally closes a sheet after a successful action. */
export function useAfterSuccess(state: ActionState, onDone?: () => void) {
  const router = useRouter();
  const seen = useRef<ActionState>(null);
  useEffect(() => {
    if (state && state.ok && seen.current !== state) {
      seen.current = state;
      router.refresh();
      onDone?.();
    }
  }, [state, router, onDone]);
}

export function ConfirmButton({ children, confirm, className = "btn btn-danger btn-sm", formAction }: { children: ReactNode; confirm: string; className?: string; formAction?: (formData: FormData) => void | Promise<void> }) {
  return (
    <button
      type="submit"
      className={className}
      formAction={formAction}
      onClick={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

/** A form key that changes after each successful action, so uncontrolled inputs reset. */
export function useResetKey(state: ActionState, onDone?: () => void) {
  const [key, setKey] = useState(0);
  useAfterSuccess(state, () => {
    setKey((k) => k + 1);
    onDone?.();
  });
  return key;
}
