import type { Metadata } from "next";
import Link from "next/link";
import { getCtx } from "@/lib/current";
import { PageHeader, Card, Notice } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProfileForm, RemindersForm } from "./forms";
import { getReminderSettings } from "@/lib/settings";
import { env } from "@/lib/env";
import { signOutAction } from "../actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user } = await getCtx();
  const reminders = await getReminderSettings(user.id);
  const deliveryReady = env.remindersDelivery && env.emailTransport === "resend";
  return (
    <div className="mx-auto max-w-[760px] space-y-5">
      <PageHeader title="Settings" description="Account, appearance, reminders, data." />

      <Card title="Appearance">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="muted text-[14px]">Light, dark, or follow your device. Saved on this device.</p>
          <ThemeToggle />
        </div>
      </Card>

      <Card title="Profile">
        <ProfileForm name={user.name ?? ""} timezone={user.timezone} email={user.email} />
      </Card>

      <Card title="Reminders" action={<Link href="/notifications" className="btn btn-ghost btn-sm">History &amp; test</Link>}>
        <div className="mb-3 space-y-2">
          <Notice tone={deliveryReady ? "ok" : "warn"}>
            {deliveryReady
              ? "Real email delivery is configured. Reminders go to your account email when enabled below."
              : env.isDemo
                ? "Demo mode never sends email. Reminders are recorded in the in-app history only."
                : "Real delivery is off. Set EMAIL_TRANSPORT=resend, RESEND_API_KEY and REMINDERS_DELIVERY=on in your environment to deliver by email. Until then, reminders are recorded in the in-app history and the local outbox."}
          </Notice>
          <p className="muted text-[13px]">Once an enabled item is due and unresolved, a reminder repeats about every 24 hours until it is done, paid, canceled, dismissed or snoozed. Multiple items go out as one digest. A server-side schedule runs even when the app is closed.</p>
        </div>
        <RemindersForm settings={reminders} />
      </Card>

      <Card title="Money">
        <ul className="space-y-1 text-[14px]">
          <li>
            <Link href="/money/accounts" className="font-semibold text-mango-deep hover:underline">
              Accounts and spending-cash selection
            </Link>
          </li>
          <li>
            <Link href="/money/categories" className="font-semibold text-mango-deep hover:underline">
              Category groups and categories
            </Link>
          </li>
          <li>
            <Link href="/money/import" className="font-semibold text-mango-deep hover:underline">
              Import CSV (including your Google Sheets export)
            </Link>
          </li>
        </ul>
      </Card>

      <Card title="Export & backup">
        <p className="muted mb-3 text-[14px]">Download your records, including goals and milestones, as CSV or JSON. Uploaded files are stored separately.</p>
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-secondary" href="/api/export?format=csv">
            Download CSV bundle
          </a>
          <a className="btn btn-secondary" href="/api/export?format=json">
            Download JSON
          </a>
        </div>
      </Card>

      <Card title="Session">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="muted text-[14px]">Signed in as {user.email}. Sessions last 30 days per device.</p>
          <form action={signOutAction}>
            <button type="submit" className="btn btn-secondary">
              Sign out
            </button>
          </form>
        </div>
      </Card>
    </div>
  );
}
