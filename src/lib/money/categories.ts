import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Workspace } from "@/lib/settings";

export type CategoryKind = "income" | "savings" | "bills" | "expenses" | "debt";

const DEFAULTS: Record<Workspace, { kind: CategoryKind; name: string; categories: string[] }[]> = {
  personal: [
    { kind: "income", name: "Income", categories: ["Salary", "Freelance", "Other income"] },
    { kind: "bills", name: "Bills", categories: ["Rent", "Electricity", "Water", "Internet", "Phone", "Subscriptions", "Insurance"] },
    { kind: "expenses", name: "Everyday", categories: ["Groceries", "Dining out", "Transport", "Fuel", "Health", "Personal care", "Household", "Gifts", "Entertainment", "Shopping", "Education", "Other"] },
    { kind: "savings", name: "Savings", categories: ["Emergency fund", "Savings goal"] },
    { kind: "debt", name: "Debt", categories: ["Loan payment", "Interest & fees"] },
  ],
  business: [
    { kind: "income", name: "Revenue", categories: ["Client payments", "Maintenance plans", "Other revenue"] },
    { kind: "bills", name: "Recurring", categories: ["Software & tools", "Hosting & domains", "Phone & internet", "Subscriptions"] },
    { kind: "expenses", name: "Operating", categories: ["Advertising", "Contractors", "Project costs", "Equipment", "Transport", "Meals & meetings", "Fees & bank charges", "Taxes", "Other"] },
    { kind: "savings", name: "Reserves", categories: ["Tax reserve", "Operating reserve"] },
    { kind: "debt", name: "Debt", categories: ["Loan payment", "Interest & fees"] },
  ],
};

export async function ensureDefaultCategories(userId: string, workspace: Workspace) {
  const db = await getDb();
  const existing = await db.query.categoryGroups.findFirst({
    where: and(eq(schema.categoryGroups.userId, userId), eq(schema.categoryGroups.workspace, workspace)),
  });
  if (existing) return;
  let sort = 0;
  for (const group of DEFAULTS[workspace]) {
    const [g] = await db
      .insert(schema.categoryGroups)
      .values({ userId, workspace, kind: group.kind, name: group.name, sort: sort++ })
      .returning();
    await db.insert(schema.categories).values(group.categories.map((name, i) => ({ userId, groupId: g.id, name, sort: i })));
  }
}

export type CategoryTree = {
  id: string;
  name: string;
  kind: CategoryKind;
  sort: number;
  archived: boolean;
  categories: { id: string; name: string; parentId: string | null; archived: boolean; sort: number }[];
}[];

export async function getCategoryTree(userId: string, workspace: Workspace, opts: { includeArchived?: boolean } = {}): Promise<CategoryTree> {
  const db = await getDb();
  await ensureDefaultCategories(userId, workspace);
  const groups = await db.query.categoryGroups.findMany({
    where: and(eq(schema.categoryGroups.userId, userId), eq(schema.categoryGroups.workspace, workspace), ...(opts.includeArchived ? [] : [isNull(schema.categoryGroups.archivedAt)])),
    orderBy: [asc(schema.categoryGroups.sort), asc(schema.categoryGroups.name)],
  });
  const cats = await db.query.categories.findMany({
    where: and(eq(schema.categories.userId, userId), ...(opts.includeArchived ? [] : [isNull(schema.categories.archivedAt)])),
    orderBy: [asc(schema.categories.sort), asc(schema.categories.name)],
  });
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    kind: g.kind,
    sort: g.sort,
    archived: !!g.archivedAt,
    categories: cats.filter((c) => c.groupId === g.id).map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, archived: !!c.archivedAt, sort: c.sort })),
  }));
}

/** Flat lookup: id → { name, groupName, kind }. */
export async function getCategoryIndex(userId: string) {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.categories.id, name: schema.categories.name, groupName: schema.categoryGroups.name, kind: schema.categoryGroups.kind, workspace: schema.categoryGroups.workspace, parentId: schema.categories.parentId })
    .from(schema.categories)
    .innerJoin(schema.categoryGroups, eq(schema.categoryGroups.id, schema.categories.groupId))
    .where(eq(schema.categories.userId, userId));
  const map = new Map<string, (typeof rows)[number]>();
  for (const r of rows) map.set(r.id, r);
  return map;
}

export async function findCategoryByName(userId: string, workspace: Workspace, name: string) {
  const tree = await getCategoryTree(userId, workspace, { includeArchived: true });
  const lower = name.trim().toLowerCase();
  for (const g of tree) {
    const hit = g.categories.find((c) => c.name.toLowerCase() === lower);
    if (hit) return { ...hit, kind: g.kind, groupId: g.id };
  }
  return null;
}

export async function createCategory(userId: string, groupId: string, name: string, parentId?: string | null) {
  const db = await getDb();
  const group = await db.query.categoryGroups.findFirst({ where: and(eq(schema.categoryGroups.id, groupId), eq(schema.categoryGroups.userId, userId)) });
  if (!group) throw new Error("Group not found");
  const [c] = await db.insert(schema.categories).values({ userId, groupId, name: name.trim(), parentId: parentId ?? null, sort: 999 }).returning();
  return c;
}

export async function renameCategory(userId: string, id: string, name: string) {
  const db = await getDb();
  await db.update(schema.categories).set({ name: name.trim() }).where(and(eq(schema.categories.id, id), eq(schema.categories.userId, userId)));
}

export async function archiveCategory(userId: string, id: string, archived: boolean) {
  const db = await getDb();
  await db
    .update(schema.categories)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(schema.categories.id, id), eq(schema.categories.userId, userId)));
}

export async function createCategoryGroup(userId: string, workspace: Workspace, kind: CategoryKind, name: string) {
  const db = await getDb();
  const [g] = await db.insert(schema.categoryGroups).values({ userId, workspace, kind, name: name.trim(), sort: 99 }).returning();
  return g;
}

export async function renameCategoryGroup(userId: string, id: string, name: string) {
  const db = await getDb();
  await db.update(schema.categoryGroups).set({ name: name.trim() }).where(and(eq(schema.categoryGroups.id, id), eq(schema.categoryGroups.userId, userId)));
}

export async function archiveCategoryGroup(userId: string, id: string, archived: boolean) {
  const db = await getDb();
  await db
    .update(schema.categoryGroups)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(schema.categoryGroups.id, id), eq(schema.categoryGroups.userId, userId)));
}
