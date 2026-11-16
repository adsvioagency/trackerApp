import type { Metadata } from "next";
import Link from "next/link";
import { getCtx } from "@/lib/current";
import { getToday } from "@/lib/today";
import { assistantConfigured, getConversation, listConversations } from "@/lib/assistant";
import { listProposedChanges } from "@/lib/assistant/changes";
import { listNotes } from "@/lib/notes";
import { PageHeader, Card, Notice, Pill, WorkspaceBadge, cx } from "@/components/ui";
import { Composer, MessageActions, ProposalCard, AttachNotes, DeleteConversation } from "./assistant-client";
import type { MessageMeta } from "@/lib/assistant";

export const metadata: Metadata = { title: "Assistant" };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const { user, view } = ctx;
  const [today, conversations, conv] = await Promise.all([getToday(ctx), listConversations(user.id), sp.c ? getConversation(user.id, sp.c) : Promise.resolve(null)]);
  const changes = conv ? await listProposedChanges(user.id, conv.id) : [];
  const notes = await listNotes(user.id, { workspace: "combined", limit: 60 });
  const ai = assistantConfigured();
  const defaultWs = view === "business" ? "business" : "personal";

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader title="Assistant" description="A briefing from your records, and answers to questions about them. It can suggest changes, but only you can apply them." />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="order-2 grid min-w-0 content-start gap-4 lg:order-1">
          <Card title="Today's briefing">
            <p className="text-[14px]">{today.summaryLine}</p>
            {today.priorities.length > 0 ? (
              <ol className="mt-3 grid gap-2">
                {today.priorities.map((p, i) => (
                  <li key={p.id}>
                    <Link href={p.href} className="block rounded-lg p-2 hover:bg-surface-2/60">
                      <div className="flex items-start gap-2">
                        <span className="tnum mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-mango/15 text-[11px] font-bold text-mango-deep">{i + 1}</span>
                        <div className="min-w-0">
                          <div className="font-semibold">{p.title}</div>
                          <div className="muted text-[13px]">{p.reason}</div>
                          {view === "combined" && <div className="mt-1"><WorkspaceBadge workspace={p.workspace} /></div>}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted mt-2 text-[13px]">Nothing urgent right now.</p>
            )}
            <p className="muted mt-3 text-[12px]">Built from your records with fixed rules — no AI involved.</p>
          </Card>

          <Card title="Conversations" action={<Link href="/assistant" className="btn btn-ghost btn-sm">New</Link>}>
            {conversations.length === 0 ? (
              <p className="muted text-[13px]">No conversations yet.</p>
            ) : (
              <ul className="grid gap-1">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <Link href={`/assistant?c=${c.id}`} aria-current={conv?.id === c.id ? "page" : undefined} className={cx("block truncate rounded-lg px-2 py-2 text-[14px] hover:bg-surface-2/60", conv?.id === c.id && "bg-surface-2 font-semibold")}>
                      {c.title ?? "Conversation"}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>

        <section className="card order-1 flex min-h-[60vh] min-w-0 flex-col p-0 lg:order-2" aria-label="Conversation">
          <div className="flex flex-wrap items-center gap-2 border-b border-rule px-4 py-3">
            <h2 className="mr-auto truncate font-display text-[16px] font-bold">{conv?.title ?? "Ask about your records"}</h2>
            <Pill tone={ai ? "teal" : "neutral"}>{ai ? "AI on" : "Rules only"}</Pill>
            <AttachNotes conversationId={conv?.id ?? ""} attached={conv?.attachedNoteIds ?? []} notes={notes.map((n) => ({ id: n.id, title: n.title ?? n.body.slice(0, 60), isPrivate: n.isPrivate, workspace: n.workspace }))} />
            {conv && <DeleteConversation id={conv.id} />}
          </div>

          {!ai && (
            <Notice className="m-4 mb-0">
              AI answers are off because no Anthropic API key is set on the server. You still get answers to common questions from built-in rules. To turn AI on, set <code>ANTHROPIC_API_KEY</code> in your environment (see the README).
            </Notice>
          )}
          {conv && conv.attachedNoteIds.length > 0 && (
            <p className="muted px-4 pt-3 text-[13px]">
              {conv.attachedNoteIds.length} note{conv.attachedNoteIds.length === 1 ? "" : "s"} attached as context. Private notes are only shared when you attach them.
            </p>
          )}

          <ol className="flex-1 space-y-4 p-4" aria-live="polite">
            {!conv || conv.messages.length === 0 ? (
              <li className="muted text-[14px]">Ask a question below, or tap one of the examples.</li>
            ) : (
              conv.messages.map((m) => {
                const meta = (m.meta ?? null) as MessageMeta | null;
                const mine = m.role === "user";
                const props = changes.filter((c) => meta?.proposals?.includes(c.id));
                return (
                  <li key={m.id} className={cx("flex", mine ? "justify-end" : "justify-start")}>
                    <div className={cx("max-w-[92%] rounded-2xl px-4 py-3 text-[15px] md:max-w-[80%]", mine ? "bg-ink text-paper dark:bg-surface-2 dark:text-ink" : "border border-rule bg-surface")}>
                      <div className="whitespace-pre-wrap break-words">{m.content}</div>
                      {!mine && (
                        <>
                          {meta?.notice && <p className="mt-2 text-[12px] text-warn">{meta.notice}</p>}
                          {props.map((c) => <ProposalCard key={c.id} change={{ id: c.id, summary: c.summary, status: c.status, preview: c.preview }} />)}
                          <MessageActions messageId={m.id} defaultWorkspace={defaultWs} mode={meta?.mode ?? "rules"} sources={meta?.tools ?? []} />
                        </>
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ol>

          <Composer conversationId={conv?.id ?? ""} />
        </section>
      </div>
    </div>
  );
}
