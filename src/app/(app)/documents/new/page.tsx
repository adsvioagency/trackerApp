import type { Metadata } from "next";
import { getCtx } from "@/lib/current";
import { listClients } from "@/lib/business/clients";
import { listProjects } from "@/lib/business/projects";
import { NewDocumentForm } from "./form";
import { PageHeader, EmptyState } from "@/components/ui";
import Link from "next/link";

export const metadata: Metadata = { title: "New document" };

export default async function NewDocumentPage({ searchParams }: { searchParams: Promise<{ type?: string; client?: string; project?: string }> }) {
  const sp = await searchParams;
  const { user } = await getCtx();
  const [clients, projects] = await Promise.all([listClients(user.id), listProjects(user.id, { status: "all" })]);
  return (
    <div className="mx-auto max-w-[640px]">
      <PageHeader title="New proposal or invoice" description="Pick the client and, optionally, the project. You will land in the editor with a live preview." />
      {clients.length === 0 ? (
        <EmptyState title="Add a client first" action={<Link href="/add/client" className="btn btn-primary btn-sm">Add client</Link>} />
      ) : (
        <NewDocumentForm clients={clients.map((c) => ({ id: c.id, name: c.company }))} projects={projects.map((p) => ({ id: p.id, name: p.name, clientId: p.clientId, currency: p.currency }))} defaults={{ type: sp.type === "invoice" ? "invoice" : "proposal", clientId: sp.client ?? projects.find((p) => p.id === sp.project)?.clientId, projectId: sp.project }} />
      )}
    </div>
  );
}
