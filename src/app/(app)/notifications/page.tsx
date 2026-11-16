import type { Metadata } from "next";
import Link from "next/link";
import { getCtx } from "@/lib/current";
import { PageHeader, Card, Pill, EmptyState, Notice } from "@/components/ui";
import { collectDueItems, listNotifications, listReminderStates } from "@/lib/reminders";
import { getReminderSettings } from "@/lib/settings";
import { env } from "@/lib/env";
import { fmtDateTime } from "@/lib/dates";
import { ReminderControls, DueItemRow } from "./client";

export const metadata: Metadata = { title: "Reminders" };

export default async function NotificationsPage() {
  const { user, tz } = await getCtx();
  const settings = await getReminderSettings(user.id);
  const [due, history, states] = await Promise.all([collectDueItems(user.id, tz, { ...settings, include: { bills: true, tasks: true, invoices: true, followUps: true, paydays: settings.include.paydays } }, new Date()), listNotifications(user.id), listReminderStates(user.id)]);
  const deliveryReady = env.remindersDelivery && env.emailTransport === "resend";
  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader title="Reminders" description="Due items, what has been sent, and a labeled test flow." actions={<Link href="/settings" className="btn btn-secondary btn-sm">Reminder settings</Link>} />
      <Notice tone={settings.enabled ? (deliveryReady ? "ok" : "warn") : "neutral"} className="mb-4">
        {settings.enabled ? (deliveryReady ? `Reminders are on. Emails go to ${user.email} at ${String(settings.sendHour).padStart(2, "0")}:00 (${tz}), repeating every ${settings.repeatHours} hours while an item stays unresolved.` : "Reminders are on, but real delivery is not configured, so runs are recorded in the history below without sending email.") : "Reminders are off. Turn them on in Settings. You can still preview and send a labeled test below."}
      </Notice>
      <ReminderControls />
      <Card title={`Due now (${due.length})`} className="mt-4">
        {due.length === 0 ? <EmptyState title="Nothing due" body="Bills, tasks, invoices and follow-ups appear here when they are due or overdue." /> : (
          <ul className="divide-y divide-rule">
            {due.map((it) => {
              const st = states.find((s) => s.itemType === it.itemType && s.itemId === it.itemId);
              return <DueItemRow key={`${it.itemType}:${it.itemId}`} item={{ itemType: it.itemType, itemId: it.itemId, title: it.title, detail: it.detail, group: it.group, href: it.href }} state={st ? { muted: st.muted, snoozedUntil: st.snoozedUntil?.toISOString() ?? null, timesSent: st.timesSent, lastSentAt: st.lastSentAt?.toISOString() ?? null } : null} />;
            })}
          </ul>
        )}
      </Card>
      <Card title="History" className="mt-4">
        {history.length === 0 ? <EmptyState title="No reminders recorded yet" /> : (
          <ul className="divide-y divide-rule">
            {history.map((n) => (
              <li key={n.id} className="py-2.5 text-[14px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{n.subject}</span>
                  {n.isTest && <Pill tone="warn">Test</Pill>}
                  <Pill tone={n.status === "sent" ? "ok" : n.status === "failed" ? "danger" : "neutral"}>{n.status}</Pill>
                  <Pill>{n.channel === "email" ? `email · ${n.providerMessageId?.split(":")[0] ?? ""}` : "in-app only"}</Pill>
                </div>
                <div className="muted text-[12px]">{fmtDateTime(n.createdAt, tz)} · {n.items.length} item(s) · key {n.dedupeKey}{n.error ? ` · ${n.error}` : ""}</div>
                <ul className="mt-1 flex flex-wrap gap-1.5">{n.items.map((it) => <li key={it.itemId}><Link href={it.href} className="pill pill-neutral hover:bg-mango-wash">{it.title}</Link></li>)}</ul>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
