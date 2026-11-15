import type { Metadata } from "next";
import { getCtx } from "@/lib/current";
import { listAccounts } from "@/lib/money/accounts";
import { listSchedules } from "@/lib/money/paydays";
import { listBills } from "@/lib/money/bills";
import { listClients } from "@/lib/business/clients";
import { OnboardingSteps } from "./steps";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Set up" };

export default async function OnboardingPage() {
  const { user, today } = await getCtx();
  const [accounts, schedules, bills, clients] = await Promise.all([listAccounts(user.id), listSchedules(user.id, "combined"), listBills(user.id, "combined"), listClients(user.id)]);
  return (
    <div className="mx-auto max-w-[640px]">
      <PageHeader eyebrow="Welcome" title="A few quick things, then Today is ready." description="Skip anything. You can finish each step later from Today." />
      <OnboardingSteps
        timezone={user.timezone}
        name={user.name ?? ""}
        today={today}
        done={{ account: accounts.length > 0, schedule: schedules.length > 0 || bills.length > 0, client: clients.length > 0, onboarded: !!user.onboardedAt }}
        summary={{ accounts: accounts.map((a) => `${a.name} (${a.currency})`), schedules: [...schedules.map((s) => s.name), ...bills.map((b) => b.name)], clients: clients.map((c) => c.company) }}
      />
    </div>
  );
}
