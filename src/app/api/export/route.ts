import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

/** Owner-only export: CSV bundle (multiple sections in one file) or a full JSON backup. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const format = new URL(req.url).searchParams.get("format") === "json" ? "json" : "csv";
  const db = await getDb();
  const uid = user.id;
  const [accounts, categories, groups, transactions, splits, bills, occurrences, schedules, paydays, budgetLines, goals, debts, clients, contacts, projects, installments, proposals, invoices, payments, tasks, notes, events] = await Promise.all([
    db.query.accounts.findMany({ where: eq(schema.accounts.userId, uid) }),
    db.query.categories.findMany({ where: eq(schema.categories.userId, uid) }),
    db.query.categoryGroups.findMany({ where: eq(schema.categoryGroups.userId, uid) }),
    db.query.transactions.findMany({ where: eq(schema.transactions.userId, uid) }),
    db.select().from(schema.transactionSplits).innerJoin(schema.transactions, eq(schema.transactions.id, schema.transactionSplits.transactionId)).where(eq(schema.transactions.userId, uid)).then((r) => r.map((x) => x.transaction_splits)),
    db.query.bills.findMany({ where: eq(schema.bills.userId, uid) }),
    db.query.billOccurrences.findMany({ where: eq(schema.billOccurrences.userId, uid) }),
    db.query.incomeSchedules.findMany({ where: eq(schema.incomeSchedules.userId, uid) }),
    db.query.paydayOccurrences.findMany({ where: eq(schema.paydayOccurrences.userId, uid) }),
    db.query.budgetLines.findMany({ where: eq(schema.budgetLines.userId, uid) }),
    db.query.goals.findMany({ where: eq(schema.goals.userId, uid) }),
    db.query.debts.findMany({ where: eq(schema.debts.userId, uid) }),
    db.query.clients.findMany({ where: eq(schema.clients.userId, uid) }),
    db.select().from(schema.clientContacts).innerJoin(schema.clients, eq(schema.clients.id, schema.clientContacts.clientId)).where(eq(schema.clients.userId, uid)).then((r) => r.map((x) => x.client_contacts)),
    db.query.projects.findMany({ where: eq(schema.projects.userId, uid) }),
    db.query.projectInstallments.findMany({ where: eq(schema.projectInstallments.userId, uid) }),
    db.query.proposals.findMany({ where: eq(schema.proposals.userId, uid) }),
    db.query.invoices.findMany({ where: eq(schema.invoices.userId, uid) }),
    db.query.payments.findMany({ where: eq(schema.payments.userId, uid) }),
    db.query.tasks.findMany({ where: eq(schema.tasks.userId, uid) }),
    db.query.notes.findMany({ where: eq(schema.notes.userId, uid) }),
    db.query.events.findMany({ where: eq(schema.events.userId, uid) }),
  ]);
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "json") {
    const body = JSON.stringify({ exportedAt: new Date().toISOString(), owner: user.email, version: 1, data: { accounts, categoryGroups: groups, categories, transactions, transactionSplits: splits, bills, billOccurrences: occurrences, incomeSchedules: schedules, paydayOccurrences: paydays, budgetLines, goals, debts, clients, clientContacts: contacts, projects, projectInstallments: installments, proposals, invoices, payments, tasks, notes, events } }, null, 2);
    return new Response(body, { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="assistant-backup-${stamp}.json"` } });
  }
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const accName = new Map(accounts.map((a) => [a.id, a.name]));
  const clientName = new Map(clients.map((c) => [c.id, c.company]));
  const projName = new Map(projects.map((p) => [p.id, p.name]));
  const m = (v: number | null | undefined) => (v === null || v === undefined ? "" : (v / 100).toFixed(2));
  const sections: [string, (string | number | null | undefined)[][]][] = [
    ["TRANSACTIONS", [["id", "workspace", "kind", "date", "account", "amount", "currency", "dop_equivalent", "category", "merchant", "note", "client", "project", "transfer_group"], ...transactions.map((t) => [t.id, t.workspace, t.kind, t.date, accName.get(t.accountId), m(t.amountMinor), t.currency, m(t.dopEquivalentMinor), t.categoryId ? catName.get(t.categoryId) : "", t.merchant, t.note, t.clientId ? clientName.get(t.clientId) : "", t.projectId ? projName.get(t.projectId) : "", t.transferGroupId])]],
    ["ACCOUNTS", [["id", "workspace", "name", "type", "currency", "opening_balance", "opening_date", "is_spending", "archived"], ...accounts.map((a) => [a.id, a.workspace, a.name, a.type, a.currency, m(a.openingBalanceMinor), a.openingDate, a.isSpending ? "yes" : "no", a.archivedAt ? "yes" : "no"])]],
    ["CLIENTS", [["id", "company", "contact", "email", "phone", "status", "pipeline", "follow_up"], ...clients.map((c) => [c.id, c.company, c.contactName, c.email, c.phone, c.status, c.pipelineStage, c.followUpDate])]],
    ["PROJECTS", [["id", "client", "name", "status", "start", "target", "agreed_value", "currency"], ...projects.map((p) => [p.id, clientName.get(p.clientId), p.name, p.status, p.startDate, p.targetDate, m(p.agreedValueMinor), p.currency])]],
    ["INVOICES", [["id", "number", "client", "project", "status", "issue_date", "due_date", "total", "currency"], ...invoices.map((i) => [i.id, i.number, clientName.get(i.clientId), i.projectId ? projName.get(i.projectId) : "", i.status, i.issueDate, i.dueDate, m(i.totalMinor), i.currency])]],
    ["PAYMENTS", [["id", "date", "client", "project", "invoice", "amount", "currency", "dop_equivalent", "account"], ...payments.map((p) => [p.id, p.date, clientName.get(p.clientId), p.projectId ? projName.get(p.projectId) : "", p.invoiceId, m(p.amountMinor), p.currency, m(p.dopEquivalentMinor), accName.get(p.accountId)])]],
    ["TASKS", [["id", "workspace", "title", "due_date", "status", "priority", "project"], ...tasks.map((t) => [t.id, t.workspace, t.title, t.dueDate, t.status, t.priority, t.projectId ? projName.get(t.projectId) : ""])]],
    ["NOTES", [["id", "workspace", "title", "body", "tags", "pinned"], ...notes.map((n) => [n.id, n.workspace, n.title, n.body, n.tags.join(" "), n.pinned ? "yes" : "no"])]],
  ];
  const csv = sections.map(([name, rows]) => `# ${name}\r\n${toCsv(rows)}`).join("\r\n\r\n");
  return new Response("﻿" + csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="assistant-export-${stamp}.csv"` } });
}
