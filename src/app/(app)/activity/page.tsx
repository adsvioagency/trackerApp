import type { Metadata } from "next";
import { desc, eq, and } from "drizzle-orm";
import { getCtx } from "@/lib/current";
import { getDb, schema } from "@/db";
import { PageHeader, Card, EmptyState, Pill, WorkspaceBadge, Segmented } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const sp = await searchParams;
  const { user, view, tz } = await getCtx();
  const db = await getDb();
  const source = sp.source && ["user", "assistant", "system", "import"].includes(sp.source) ? sp.source : "all";
  const rows = await db.query.activityLog.findMany({
    where: and(eq(schema.activityLog.userId, user.id), view === "combined" ? undefined : eq(schema.activityLog.workspace, view), source === "all" ? undefined : eq(schema.activityLog.source, source)),
    orderBy: [desc(schema.activityLog.createdAt)],
    limit: 200,
  });
  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader title="Activity history" description="Every change recorded by you, the assistant, imports or the system." />
      <div className="mb-4"><Segmented value={source} options={[{ value: "all", label: "All" }, { value: "user", label: "You" }, { value: "assistant", label: "Assistant" }, { value: "import", label: "Imports" }, { value: "system", label: "System" }]} hrefFor={(v) => `/activity${v === "all" ? "" : `?source=${v}`}`} ariaLabel="Source" /></div>
      <Card className="p-0">
        {rows.length === 0 ? <div className="p-4"><EmptyState title="No activity yet" /></div> : (
          <ul>
            {rows.map((r) => (
              <li key={r.id} className="flex items-start gap-3 border-b border-rule px-4 py-2.5 last:border-b-0 text-[14px]">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span>{r.summary}</span>{r.workspace && view === "combined" && <WorkspaceBadge workspace={r.workspace} />}<Pill tone={r.source === "assistant" ? "mango" : r.source === "import" ? "teal" : "neutral"}>{r.source}</Pill><Pill>{r.entityType} · {r.action}</Pill></div>
                  <div className="muted text-[12px]">{fmtDateTime(r.createdAt, tz)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
