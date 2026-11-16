"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Notice, Pill } from "@/components/ui";
import { muteAction, previewRemindersAction, runNowAction, sendTestReminderAction, snoozeAction } from "./actions";
import type { ActionState } from "@/components/forms";

export function ReminderControls() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState>(null);
  const [preview, setPreview] = useState<{ items: { title: string; detail: string; group: string; href: string }[]; skipped: string } | null>(null);
  const router = useRouter();
  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => setPreview(await previewRemindersAction()))}>Preview what would be sent</button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => { setMsg(await sendTestReminderAction()); router.refresh(); })}>Send a labeled test reminder</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { setMsg(await runNowAction()); router.refresh(); })}>Run the schedule now</button>
      </div>
      <p className="muted text-[12px]">Preview computes the digest without sending or recording. The test sends through the configured transport (console locally) with a visible “Test” label and leaves reminder state untouched. “Run now” behaves like the daily schedule.</p>
      {msg?.message && <Notice tone="ok">{msg.message}</Notice>}
      {msg?.error && <Notice tone="danger">{msg.error}</Notice>}
      {preview && (
        <div className="rounded-xl border border-rule p-3 text-[13px]">
          <div className="mb-1 font-semibold">Preview · {preview.items.length} item(s){preview.skipped && preview.skipped !== "dry run" ? ` · ${preview.skipped}` : ""}</div>
          {preview.items.length ? <ul className="space-y-1">{preview.items.map((i) => <li key={i.href}><span className="pill pill-neutral mr-1">{i.group}</span><Link href={i.href} className="font-medium hover:underline">{i.title}</Link> <span className="muted">· {i.detail}</span></li>)}</ul> : <p className="muted">Nothing would be sent right now.</p>}
        </div>
      )}
    </div>
  );
}

export function DueItemRow({ item, state }: { item: { itemType: string; itemId: string; title: string; detail: string; group: string; href: string }; state: { muted: boolean; snoozedUntil: string | null; timesSent: number; lastSentAt: string | null } | null }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const snoozed = state?.snoozedUntil && new Date(state.snoozedUntil) > new Date();
  return (
    <li className="flex flex-wrap items-center gap-2 py-2.5 text-[14px]">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><Pill>{item.group}</Pill><Link href={item.href} className="font-medium hover:underline">{item.title}</Link>{state?.muted && <Pill tone="neutral">Muted</Pill>}{snoozed && <Pill tone="warn">Snoozed</Pill>}</div>
        <div className="muted text-[12px]">{item.detail}{state?.timesSent ? ` · reminded ${state.timesSent}×` : " · not reminded yet"}</div>
      </div>
      <div className="flex gap-1">
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { await snoozeAction(item.itemType, item.itemId, snoozed ? 0 : 1); router.refresh(); })}>{snoozed ? "Unsnooze" : "Snooze 1 day"}</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { await muteAction(item.itemType, item.itemId, !state?.muted); router.refresh(); })}>{state?.muted ? "Unmute" : "Turn off"}</button>
      </div>
    </li>
  );
}
