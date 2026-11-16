import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCtx } from "@/lib/current";
import { getNote } from "@/lib/notes";
import { listClients } from "@/lib/business/clients";
import { listProjects } from "@/lib/business/projects";
import { listTasks } from "@/lib/tasks";
import { NoteEditor } from "./note-editor";
import { WorkspaceBadge } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Note" };

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, tz, today } = await getCtx();
  const note = await getNote(user.id, id);
  if (!note) notFound();
  const [clients, projects, tasks] = await Promise.all([listClients(user.id), listProjects(user.id, { status: "open" }), listTasks(user.id, { status: "all", limit: 1000 })]);
  const linked = tasks.filter((t) => t.noteId === note.id);
  return (
    <div className="mx-auto max-w-[760px]">
      <Link href="/notes" className="btn btn-ghost btn-sm -ml-2 mb-2"><ArrowLeft className="size-4" /> Notes</Link>
      <div className="muted mb-3 flex flex-wrap items-center gap-2 text-[12px]"><WorkspaceBadge workspace={note.workspace} /> Updated {fmtDateTime(note.updatedAt, tz)}</div>
      <NoteEditor note={{ id: note.id, title: note.title, body: note.body, tags: note.tags, pinned: note.pinned, isPrivate: note.isPrivate, clientId: note.clientId, projectId: note.projectId, workspace: note.workspace, archived: !!note.archivedAt }} clients={clients.map((c) => ({ id: c.id, name: c.company }))} projects={projects.map((p) => ({ id: p.id, name: p.name, clientId: p.clientId }))} linkedTasks={linked.map((t) => ({ id: t.id, title: t.title, status: t.status }))} today={today} />
    </div>
  );
}
