import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { logActivity } from "@/lib/activity";
import { fmtMoney } from "@/lib/money/format";

export type Project = typeof schema.projects.$inferSelect;
export type ProjectStatus = Project["status"];
export type Phase = typeof schema.projectPhases.$inferSelect;
export type Installment = typeof schema.projectInstallments.$inferSelect;

export const DEFAULT_PHASES = ["Planning", "Waiting for content", "Design", "Development", "Review", "Launch", "Completed"];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "Planning",
  active: "Active",
  waiting_client: "Waiting on client",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export type ProjectFinance = {
  currency: string;
  agreedMinor: number;
  invoicedMinor: number; // issued invoices (not void)
  receivedMinor: number; // payments recorded
  outstandingMinor: number; // invoiced − received (not below 0)
  overdueMinor: number; // outstanding on invoices past due date
  scheduledToInvoiceMinor: number; // planned installments without an invoice
  uninvoicedMinor: number; // agreed − invoiced − scheduledToInvoice (not below 0)
  costsMinor: number; // business expenses linked to the project (native sum in project currency when matching)
  costsByCurrency: Record<string, number>;
  receivedDopMinor: number;
  receivedMissingDop: number;
};

export async function listProjects(userId: string, opts: { status?: ProjectStatus | "all" | "open"; clientId?: string; includeArchived?: boolean; search?: string } = {}) {
  const db = await getDb();
  const conds = [eq(schema.projects.userId, userId)];
  if (!opts.includeArchived) conds.push(isNull(schema.projects.archivedAt));
  if (opts.clientId) conds.push(eq(schema.projects.clientId, opts.clientId));
  if (opts.status === "open") conds.push(inArray(schema.projects.status, ["planning", "active", "waiting_client", "on_hold"]));
  else if (opts.status && opts.status !== "all") conds.push(eq(schema.projects.status, opts.status));
  const rows = await db
    .select({ project: schema.projects, clientName: schema.clients.company })
    .from(schema.projects)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.projects.clientId))
    .where(and(...conds))
    .orderBy(asc(schema.projects.targetDate), desc(schema.projects.updatedAt));
  const ids = rows.map((r) => r.project.id);
  const phases = ids.length ? await db.query.projectPhases.findMany({ where: inArray(schema.projectPhases.projectId, ids), orderBy: [asc(schema.projectPhases.sort)] }) : [];
  const q = opts.search?.trim().toLowerCase();
  return rows
    .map((r) => {
      const ph = phases.filter((p) => p.projectId === r.project.id);
      const current = ph.find((p) => p.id === r.project.currentPhaseId) ?? ph.find((p) => !p.completedAt) ?? null;
      const done = ph.filter((p) => p.completedAt).length;
      return { ...r.project, clientName: r.clientName, phases: ph, currentPhase: current, progressPct: ph.length ? Math.round((done / ph.length) * 100) : 0 };
    })
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.clientName.toLowerCase().includes(q));
}

export async function getProject(userId: string, id: string) {
  const db = await getDb();
  const project = await db.query.projects.findFirst({ where: and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)) });
  if (!project) return null;
  const client = (await db.query.clients.findFirst({ where: eq(schema.clients.id, project.clientId) }))!;
  const phases = await db.query.projectPhases.findMany({ where: eq(schema.projectPhases.projectId, id), orderBy: [asc(schema.projectPhases.sort)] });
  const deliverables = await db.query.projectDeliverables.findMany({ where: eq(schema.projectDeliverables.projectId, id), orderBy: [asc(schema.projectDeliverables.sort)] });
  const dependencies = await db.query.projectDependencies.findMany({ where: eq(schema.projectDependencies.projectId, id) });
  const installments = await db.query.projectInstallments.findMany({ where: eq(schema.projectInstallments.projectId, id), orderBy: [asc(schema.projectInstallments.sort), asc(schema.projectInstallments.dueDate)] });
  const files = await db
    .select({ link: schema.projectFiles, file: schema.files })
    .from(schema.projectFiles)
    .innerJoin(schema.files, eq(schema.files.id, schema.projectFiles.fileId))
    .where(eq(schema.projectFiles.projectId, id));
  const currentPhase = phases.find((p) => p.id === project.currentPhaseId) ?? phases.find((p) => !p.completedAt) ?? null;
  return { ...project, client, phases, currentPhase, deliverables, dependencies, installments, files: files.map((f) => ({ ...f.file, label: f.link.label, linkId: f.link.id })) };
}

export async function projectFinance(userId: string, projectId: string): Promise<ProjectFinance> {
  const db = await getDb();
  const project = await db.query.projects.findFirst({ where: and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)) });
  if (!project) throw new Error("Project not found.");
  const invoices = await db.query.invoices.findMany({ where: and(eq(schema.invoices.projectId, projectId), ne(schema.invoices.status, "void"), ne(schema.invoices.status, "draft")) });
  const pays = await db.query.payments.findMany({ where: eq(schema.payments.projectId, projectId) });
  const installments = await db.query.projectInstallments.findMany({ where: eq(schema.projectInstallments.projectId, projectId) });
  const costs = await db.query.transactions.findMany({ where: and(eq(schema.transactions.userId, userId), eq(schema.transactions.projectId, projectId), inArray(schema.transactions.kind, ["expense", "refund"])) });
  const today = new Date().toISOString().slice(0, 10);
  const invoicedMinor = invoices.reduce((s, i) => s + i.totalMinor, 0);
  const receivedMinor = pays.filter((p) => p.currency === project.currency).reduce((s, p) => s + p.amountMinor, 0);
  let overdueMinor = 0;
  for (const inv of invoices) {
    const paid = pays.filter((p) => p.invoiceId === inv.id).reduce((s, p) => s + p.amountMinor, 0);
    const left = Math.max(0, inv.totalMinor - paid);
    if (left > 0 && inv.dueDate && inv.dueDate < today) overdueMinor += left;
  }
  const scheduledToInvoiceMinor = installments.filter((i) => i.status === "planned").reduce((s, i) => s + i.amountMinor, 0);
  const costsByCurrency: Record<string, number> = {};
  for (const c of costs) costsByCurrency[c.currency] = (costsByCurrency[c.currency] ?? 0) + (c.kind === "refund" ? -c.amountMinor : c.amountMinor);
  const receivedDopMinor = pays.reduce((s, p) => s + (p.currency === "DOP" ? p.amountMinor : p.dopEquivalentMinor ?? 0), 0);
  const receivedMissingDop = pays.filter((p) => p.currency !== "DOP" && p.dopEquivalentMinor == null).length;
  return {
    currency: project.currency,
    agreedMinor: project.agreedValueMinor,
    invoicedMinor,
    receivedMinor,
    outstandingMinor: Math.max(0, invoicedMinor - receivedMinor),
    overdueMinor,
    scheduledToInvoiceMinor,
    uninvoicedMinor: Math.max(0, project.agreedValueMinor - invoicedMinor - scheduledToInvoiceMinor),
    costsMinor: costsByCurrency[project.currency] ?? 0,
    costsByCurrency,
    receivedDopMinor,
    receivedMissingDop,
  };
}

export type ProjectInput = {
  clientId: string;
  name: string;
  brief?: string | null;
  scope?: string | null;
  status?: ProjectStatus;
  startDate?: string | null;
  targetDate?: string | null;
  agreedValueMinor?: number;
  currency?: string;
  nextAction?: string | null;
  notes?: string | null;
  phases?: string[];
};

export async function createProject(userId: string, input: ProjectInput, source: "user" | "assistant" | "system" = "user") {
  const db = await getDb();
  const client = await db.query.clients.findFirst({ where: and(eq(schema.clients.id, input.clientId), eq(schema.clients.userId, userId)) });
  if (!client) throw new Error("Client not found.");
  const [p] = await db
    .insert(schema.projects)
    .values({
      userId,
      clientId: input.clientId,
      name: input.name.trim(),
      brief: input.brief?.trim() || null,
      scope: input.scope?.trim() || null,
      status: input.status ?? "planning",
      startDate: input.startDate ?? null,
      targetDate: input.targetDate ?? null,
      agreedValueMinor: input.agreedValueMinor ?? 0,
      currency: input.currency ?? "USD",
      nextAction: input.nextAction?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .returning();
  const names = input.phases && input.phases.length ? input.phases : DEFAULT_PHASES;
  const phases = await db.insert(schema.projectPhases).values(names.map((name, i) => ({ projectId: p.id, name, sort: i }))).returning();
  await db.update(schema.projects).set({ currentPhaseId: phases[0].id }).where(eq(schema.projects.id, p.id));
  if (client.status === "prospect") await db.update(schema.clients).set({ status: "active", pipelineStage: "won" }).where(eq(schema.clients.id, client.id));
  await logActivity({ userId, workspace: "business", entityType: "project", entityId: p.id, action: "create", summary: `Created project ${p.name} for ${client.company}${p.agreedValueMinor ? ` · ${fmtMoney(p.agreedValueMinor, p.currency)}` : ""}`, source });
  return { ...p, currentPhaseId: phases[0].id };
}

export async function updateProject(userId: string, id: string, patch: Partial<ProjectInput> & { waitingOnClient?: boolean; waitingNote?: string | null; followUpDate?: string | null; archived?: boolean; currentPhaseId?: string | null; waitingSince?: string | null }, source: "user" | "assistant" | "system" = "user") {
  const db = await getDb();
  const before = await db.query.projects.findFirst({ where: and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)) });
  if (!before) throw new Error("Project not found.");
  const { archived, phases: _phases, ...rest } = patch;
  void _phases;
  const set: Partial<typeof schema.projects.$inferInsert> = { ...rest, updatedAt: new Date() };
  if (rest.name !== undefined) set.name = rest.name.trim();
  if (archived !== undefined) set.archivedAt = archived ? new Date() : null;
  if (patch.waitingOnClient !== undefined) {
    set.waitingOnClient = patch.waitingOnClient;
    if (patch.waitingOnClient) {
      set.waitingSince = patch.waitingSince ?? before.waitingSince ?? new Date().toISOString().slice(0, 10);
      if (before.status === "active" || before.status === "planning") set.status = "waiting_client";
    } else {
      set.waitingSince = null;
      set.waitingNote = null;
      if (before.status === "waiting_client" && !rest.status) set.status = "active";
    }
  }
  await db.update(schema.projects).set(set).where(eq(schema.projects.id, id));
  const changed = Object.keys(rest).filter((k) => (rest as Record<string, unknown>)[k] !== (before as Record<string, unknown>)[k]);
  await logActivity({ userId, workspace: "business", entityType: "project", entityId: id, action: archived ? "archive" : "update", summary: `${archived ? "Archived" : "Edited"} project ${before.name}${changed.length ? ` (${changed.join(", ")})` : ""}`, details: patch, source });
}

export async function setProjectPhase(userId: string, projectId: string, phaseId: string, source: "user" | "assistant" | "system" = "user") {
  const db = await getDb();
  const project = await db.query.projects.findFirst({ where: and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)) });
  if (!project) throw new Error("Project not found.");
  const phases = await db.query.projectPhases.findMany({ where: eq(schema.projectPhases.projectId, projectId), orderBy: [asc(schema.projectPhases.sort)] });
  const target = phases.find((p) => p.id === phaseId);
  if (!target) throw new Error("Phase not found.");
  // Phases before the target are complete; the target and later ones are open.
  for (const p of phases) {
    const done = p.sort < target.sort;
    await db.update(schema.projectPhases).set({ completedAt: done ? p.completedAt ?? new Date() : null }).where(eq(schema.projectPhases.id, p.id));
  }
  const isLast = target.sort === phases[phases.length - 1].sort;
  await db
    .update(schema.projects)
    .set({ currentPhaseId: target.id, updatedAt: new Date(), ...(isLast && target.name.toLowerCase() === "completed" ? { status: "completed" } : project.status === "completed" ? { status: "active" } : {}) })
    .where(eq(schema.projects.id, projectId));
  if (isLast && target.name.toLowerCase() === "completed") await db.update(schema.projectPhases).set({ completedAt: new Date() }).where(eq(schema.projectPhases.id, target.id));
  await logActivity({ userId, workspace: "business", entityType: "project", entityId: projectId, action: "phase", summary: `${project.name} moved to ${target.name}`, source });
}

export async function replacePhases(userId: string, projectId: string, names: string[]) {
  const db = await getDb();
  const project = await db.query.projects.findFirst({ where: and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)) });
  if (!project) throw new Error("Project not found.");
  const existing = await db.query.projectPhases.findMany({ where: eq(schema.projectPhases.projectId, projectId), orderBy: [asc(schema.projectPhases.sort)] });
  const currentName = existing.find((p) => p.id === project.currentPhaseId)?.name;
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (!clean.length) throw new Error("Add at least one phase.");
  // Keep ids for phases whose name survives, so history and completion are preserved.
  const kept = new Map(existing.map((p) => [p.name.toLowerCase(), p]));
  await db.delete(schema.projectPhases).where(and(eq(schema.projectPhases.projectId, projectId), inArray(schema.projectPhases.id, existing.filter((p) => !clean.some((n) => n.toLowerCase() === p.name.toLowerCase())).map((p) => p.id))));
  let newCurrent: string | null = null;
  for (let i = 0; i < clean.length; i++) {
    const prev = kept.get(clean[i].toLowerCase());
    if (prev) {
      await db.update(schema.projectPhases).set({ sort: i, name: clean[i] }).where(eq(schema.projectPhases.id, prev.id));
      if (currentName && prev.name === currentName) newCurrent = prev.id;
    } else {
      const [np] = await db.insert(schema.projectPhases).values({ projectId, name: clean[i], sort: i }).returning();
      if (!newCurrent && i === 0 && !currentName) newCurrent = np.id;
    }
  }
  const all = await db.query.projectPhases.findMany({ where: eq(schema.projectPhases.projectId, projectId), orderBy: [asc(schema.projectPhases.sort)] });
  await db.update(schema.projects).set({ currentPhaseId: newCurrent ?? all.find((p) => !p.completedAt)?.id ?? all[0].id }).where(eq(schema.projects.id, projectId));
}

export async function addDeliverable(userId: string, projectId: string, title: string) {
  const db = await getDb();
  await assertProject(userId, projectId);
  const [d] = await db.insert(schema.projectDeliverables).values({ projectId, title: title.trim(), sort: 999 }).returning();
  return d;
}
export async function toggleDeliverable(userId: string, id: string, done: boolean) {
  const db = await getDb();
  const row = await db.select({ d: schema.projectDeliverables }).from(schema.projectDeliverables).innerJoin(schema.projects, eq(schema.projects.id, schema.projectDeliverables.projectId)).where(and(eq(schema.projectDeliverables.id, id), eq(schema.projects.userId, userId)));
  if (row[0]) await db.update(schema.projectDeliverables).set({ done }).where(eq(schema.projectDeliverables.id, id));
}
export async function removeDeliverable(userId: string, id: string) {
  const db = await getDb();
  const row = await db.select({ d: schema.projectDeliverables }).from(schema.projectDeliverables).innerJoin(schema.projects, eq(schema.projects.id, schema.projectDeliverables.projectId)).where(and(eq(schema.projectDeliverables.id, id), eq(schema.projects.userId, userId)));
  if (row[0]) await db.delete(schema.projectDeliverables).where(eq(schema.projectDeliverables.id, id));
}

export async function addDependency(userId: string, projectId: string, input: { title: string; dueDate?: string | null; requestedOn?: string | null }) {
  const db = await getDb();
  await assertProject(userId, projectId);
  const [d] = await db.insert(schema.projectDependencies).values({ projectId, title: input.title.trim(), dueDate: input.dueDate ?? null, requestedOn: input.requestedOn ?? null }).returning();
  return d;
}
export async function setDependencyStatus(userId: string, id: string, received: boolean, receivedOn?: string) {
  const db = await getDb();
  const row = await db.select({ d: schema.projectDependencies }).from(schema.projectDependencies).innerJoin(schema.projects, eq(schema.projects.id, schema.projectDependencies.projectId)).where(and(eq(schema.projectDependencies.id, id), eq(schema.projects.userId, userId)));
  if (row[0]) await db.update(schema.projectDependencies).set({ status: received ? "received" : "pending", receivedOn: received ? receivedOn ?? new Date().toISOString().slice(0, 10) : null }).where(eq(schema.projectDependencies.id, id));
}
export async function removeDependency(userId: string, id: string) {
  const db = await getDb();
  const row = await db.select({ d: schema.projectDependencies }).from(schema.projectDependencies).innerJoin(schema.projects, eq(schema.projects.id, schema.projectDependencies.projectId)).where(and(eq(schema.projectDependencies.id, id), eq(schema.projects.userId, userId)));
  if (row[0]) await db.delete(schema.projectDependencies).where(eq(schema.projectDependencies.id, id));
}

export async function assertProject(userId: string, projectId: string) {
  const db = await getDb();
  const p = await db.query.projects.findFirst({ where: and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)) });
  if (!p) throw new Error("Project not found.");
  return p;
}

/** Planned payment schedule management. */
export async function addInstallment(userId: string, projectId: string, input: { label: string; amountMinor: number; dueDate?: string | null }) {
  const db = await getDb();
  const p = await assertProject(userId, projectId);
  const count = (await db.query.projectInstallments.findMany({ where: eq(schema.projectInstallments.projectId, projectId) })).length;
  const [i] = await db.insert(schema.projectInstallments).values({ userId, projectId, label: input.label.trim(), amountMinor: input.amountMinor, currency: p.currency, dueDate: input.dueDate ?? null, sort: count }).returning();
  await logActivity({ userId, workspace: "business", entityType: "installment", entityId: i.id, action: "create", summary: `Planned ${i.label} · ${fmtMoney(i.amountMinor, i.currency)} for ${p.name}` });
  return i;
}
export async function updateInstallment(userId: string, id: string, patch: Partial<{ label: string; amountMinor: number; dueDate: string | null }>) {
  const db = await getDb();
  const i = await db.query.projectInstallments.findFirst({ where: and(eq(schema.projectInstallments.id, id), eq(schema.projectInstallments.userId, userId)) });
  if (!i) throw new Error("Installment not found.");
  if (i.status !== "planned" && patch.amountMinor !== undefined && patch.amountMinor !== i.amountMinor) throw new Error("This installment is already invoiced. Edit the invoice instead.");
  await db.update(schema.projectInstallments).set(patch).where(eq(schema.projectInstallments.id, id));
}
export async function removeInstallment(userId: string, id: string) {
  const db = await getDb();
  const i = await db.query.projectInstallments.findFirst({ where: and(eq(schema.projectInstallments.id, id), eq(schema.projectInstallments.userId, userId)) });
  if (!i) return;
  if (i.status !== "planned") throw new Error("This installment is already invoiced and cannot be removed.");
  await db.delete(schema.projectInstallments).where(eq(schema.projectInstallments.id, id));
}

export async function attachFileToProject(userId: string, projectId: string, fileId: string, label?: string) {
  const db = await getDb();
  await assertProject(userId, projectId);
  await db.insert(schema.projectFiles).values({ projectId, fileId, label: label ?? null });
}
