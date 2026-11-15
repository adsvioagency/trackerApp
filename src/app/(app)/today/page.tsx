import type { Metadata } from "next";
import Link from "next/link";
import { getCtx } from "@/lib/current";
import { getToday } from "@/lib/today";
import { PageHeader, Card, Money, Pill, EmptyState, Notice, SectionTitle, WorkspaceBadge } from "@/components/ui";
import { fmtDate, relativeDay } from "@/lib/dates";
import { PriorityList } from "./priority-list";
import { AgendaList } from "@/components/agenda";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const ctx = await getCtx();
  if (!ctx.user.onboardedAt) redirect("/onboarding");
  const data = await getToday(ctx);
  const greeting = ctx.user.name ? `Good ${data.dayPart}, ${ctx.user.name.split(" ")[0]}.` : `Good ${data.dayPart}.`;

  return (
    <div>
      <PageHeader eyebrow={fmtDate(ctx.today, "long")} title={greeting} description={data.summaryLine} />

      {data.nextSetupStep && (
        <Notice tone="mango" className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <span>{data.nextSetupStep.text}</span>
          <Link href={data.nextSetupStep.href} className="btn btn-secondary btn-sm">
            {data.nextSetupStep.cta}
          </Link>
        </Notice>
      )}

      <SectionTitle>Priorities</SectionTitle>
      {data.priorities.length ? <PriorityList items={data.priorities} showWorkspace={ctx.view === "combined"} /> : <EmptyState title="Nothing urgent." body="No overdue bills, payments, follow-ups or tasks right now." />}

      <SectionTitle action={<Link href="/calendar" className="text-[13px] font-semibold text-mango-deep hover:underline">Open calendar</Link>}>Agenda · next 7 days</SectionTitle>
      <Card className="p-0">
        <AgendaList items={data.agenda} today={ctx.today} showWorkspace={ctx.view === "combined"} tz={ctx.tz} />
      </Card>

      {(ctx.view === "personal" || ctx.view === "combined") && data.personal && (
        <>
          <SectionTitle action={<Link href="/money" className="text-[13px] font-semibold text-mango-deep hover:underline">Money</Link>}>{ctx.view === "combined" ? "Personal money" : "Money"}</SectionTitle>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Link href="/money/accounts" className="card block p-3.5 hover:bg-surface-2">
              <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">Recorded spending cash</div>
              <div className="mt-1 font-display text-[22px] font-extrabold leading-none"><Money minor={data.personal.cash.dopValuedMinor} /></div>
              <div className="muted mt-1.5 text-[12px]">{data.personal.cash.lastUpdated ? `Updated ${fmtDate(data.personal.cash.lastUpdated, "short")}` : "No entries yet"}{data.personal.cash.unvaluedAccounts.length ? ` · ${data.personal.cash.unvaluedAccounts.length} account(s) not valued in DOP` : ""}</div>
            </Link>
            <Link href="/money#available" className="card block p-3.5 hover:bg-surface-2">
              <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">Available after commitments</div>
              <div className={`mt-1 font-display text-[22px] font-extrabold leading-none ${data.personal.availability.availableMinor < 0 ? "text-danger" : ""}`}><Money minor={data.personal.availability.availableMinor} /></div>
              <div className="muted mt-1.5 text-[12px]">Cash − bills {data.personal.availability.horizonLabel} − reserved</div>
            </Link>
            <Link href="/money/budget" className="card block p-3.5 hover:bg-surface-2">
              <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">Budget remaining</div>
              <div className={`mt-1 font-display text-[22px] font-extrabold leading-none ${data.personal.budget && data.personal.budget.totals.remainingMinor < 0 ? "text-danger" : ""}`}>{data.personal.budget ? <Money minor={data.personal.budget.totals.remainingMinor} /> : "—"}</div>
              <div className="muted mt-1.5 text-[12px]">{data.personal.budget ? `${data.personal.budget.period.type === "paycheck" ? "This paycheck" : "This month"} · spent ${Math.round((data.personal.budget.totals.actualMinor / Math.max(1, data.personal.budget.totals.availableMinor)) * 100)}%` : "No budget set yet"}</div>
            </Link>
            <Link href="/money/bills" className="card block p-3.5 hover:bg-surface-2">
              <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">Bills before payday</div>
              <div className="mt-1 font-display text-[22px] font-extrabold leading-none"><Money minor={data.personal.availability.unpaidBillsDopMinor} /></div>
              <div className="muted mt-1.5 text-[12px]">{data.personal.availability.unpaidBills.length} unpaid · {data.personal.availability.forecast.paydays[0] ? `next payday ${fmtDate(data.personal.availability.forecast.paydays[0].date, "short")}` : "no payday scheduled"}</div>
            </Link>
          </div>
          {data.personal.nearLimit.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {data.personal.nearLimit.map((l) => (
                <Link key={l.categoryId} href={`/money/budget#cat-${l.categoryId}`}>
                  <Pill tone={l.remainingMinor < 0 ? "danger" : "warn"}>
                    {l.name}: {l.remainingMinor < 0 ? "over by " : ""}
                    <Money minor={Math.abs(l.remainingMinor)} /> {l.remainingMinor < 0 ? "" : "left"}
                  </Pill>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {(ctx.view === "business" || ctx.view === "combined") && data.business && (
        <>
          <SectionTitle action={<Link href="/money" className="text-[13px] font-semibold text-mango-deep hover:underline">Business money</Link>}>{ctx.view === "combined" ? "Adsvio money" : "Cash & receivables"}</SectionTitle>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Link href="/documents?tab=invoices&status=overdue" className="card block p-3.5 hover:bg-surface-2">
              <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">Overdue</div>
              <div className={`mt-1 font-display text-[22px] font-extrabold leading-none ${data.business.receivables.overdueCount ? "text-danger" : ""}`}>{Object.entries(data.business.receivables.overdueByCurrency).map(([c, v]) => <div key={c}><Money minor={v} currency={c} /></div>)}{!data.business.receivables.overdueCount && <Money minor={0} currency="USD" />}</div>
              <div className="muted mt-1.5 text-[12px]">{data.business.receivables.overdueCount} invoice(s)</div>
            </Link>
            <Link href="/documents?tab=invoices&status=issued" className="card block p-3.5 hover:bg-surface-2">
              <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">Outstanding</div>
              <div className="mt-1 font-display text-[22px] font-extrabold leading-none">{Object.entries(data.business.receivables.outstandingByCurrency).map(([c, v]) => <div key={c}><Money minor={v} currency={c} /></div>)}{!Object.keys(data.business.receivables.outstandingByCurrency).length && <Money minor={0} currency="USD" />}</div>
              <div className="muted mt-1.5 text-[12px]">Issued, not yet received</div>
            </Link>
            <Link href="/money/accounts" className="card block p-3.5 hover:bg-surface-2">
              <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">Business cash</div>
              <div className="mt-1 font-display text-[22px] font-extrabold leading-none">{Object.entries(data.business.cash.byCurrency).map(([c, v]) => <div key={c}><Money minor={v} currency={c} /></div>)}{!Object.keys(data.business.cash.byCurrency).length && "—"}</div>
              <div className="muted mt-1.5 text-[12px]">{data.business.cash.lastUpdated ? `Updated ${fmtDate(data.business.cash.lastUpdated, "short")}` : "No entries yet"}</div>
            </Link>
            <Link href="/money/reports" className="card block p-3.5 hover:bg-surface-2">
              <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">Collected this month</div>
              <div className="mt-1 font-display text-[22px] font-extrabold leading-none"><Money minor={data.business.collectedMonthDop} /></div>
              <div className="muted mt-1.5 text-[12px]">{data.business.collectedMissing ? `${data.business.collectedMissing} payment(s) need a DOP equivalent` : "DOP-valued income · owner movements excluded"}</div>
            </Link>
          </div>
          {data.business.waiting.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {data.business.waiting.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`}>
                  <Pill tone="warn">Waiting on client: {p.name}{p.waitingSince ? ` · since ${fmtDate(p.waitingSince, "short")}` : ""}</Pill>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {ctx.view === "combined" && (
        <p className="muted mt-6 text-[12px]">
          Combined totals exclude internal transfers between your own accounts. Items are labeled <WorkspaceBadge workspace="personal" /> or <WorkspaceBadge workspace="business" />. {relativeDay(ctx.today, ctx.today) === "today" ? "" : ""}
        </p>
      )}
    </div>
  );
}
