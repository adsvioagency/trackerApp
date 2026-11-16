import type { Metadata } from "next";
import Link from "next/link";
import { Pin } from "lucide-react";
import { getCtx } from "@/lib/current";
import { PageHeader, Card, EmptyState, Pill, WorkspaceBadge } from "@/components/ui";
import { listNotes } from "@/lib/notes";
import { NotesSearch } from "./notes-client";
import { fmtDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Notes" };

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string }> }) {
  const sp = await searchParams;
  const { user, view } = await getCtx();
  const notes = await listNotes(user.id, { workspace: view, search: sp.q, tag: sp.tag });
  const tags = [...new Set(notes.flatMap((n) => n.tags))].sort();
  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader title="Notes" description="Quick capture for ideas and personal notes. Pin, tag, search, link to clients and projects, or turn a note into a task." actions={<Link href={`/add/note?ws=${view === "business" ? "business" : "personal"}&back=/notes`} className="btn btn-primary">Quick note</Link>} />
      <NotesSearch tags={tags} />
      {notes.length === 0 ? (
        <Card><EmptyState title="No notes match" action={<Link href="/add/note" className="btn btn-primary btn-sm">Quick note</Link>} /></Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {notes.map((n) => (
            <li key={n.id}>
              <Link href={`/notes/${n.id}`} className="card block h-full p-4 hover:bg-surface-2/60">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold">{n.title ?? n.body.split("\n")[0].slice(0, 70)}</div>
                  {n.pinned && <Pin className="size-4 shrink-0 text-mango-deep" aria-label="Pinned" />}
                </div>
                <p className="muted mt-1 line-clamp-3 whitespace-pre-wrap text-[13px]">{n.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
                  {view === "combined" && <WorkspaceBadge workspace={n.workspace} />}
                  {n.isPrivate && <Pill>Private</Pill>}
                  {n.tags.map((t) => <Pill key={t} tone="teal">#{t}</Pill>)}
                  <span className="muted ml-auto">{fmtDate(n.updatedAt.toISOString().slice(0, 10), "short")}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
