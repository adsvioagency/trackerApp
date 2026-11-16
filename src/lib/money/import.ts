import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Workspace } from "@/lib/settings";
import { createTransaction } from "./transactions";
import { findCategoryByName, getCategoryTree, createCategory } from "./categories";
import { logActivity } from "@/lib/activity";

export type ImportMapping = {
  date: number | null;
  merchant: number | null;
  amount: number | null;
  /** Optional separate columns for money in / money out. */
  inflow?: number | null;
  outflow?: number | null;
  category: number | null;
  subcategory: number | null;
  description: number | null;
  /** When true, positive amounts are expenses (common in spreadsheets). */
  positiveIsExpense: boolean;
  dayFirst: boolean;
  skipHeader: boolean;
};

/** Google Sheets budget-tracker export: Date, Merchant, Amount, Category, Subcategory, Description. */
export const GOOGLE_SHEETS_MAPPING_HINT = ["date", "merchant", "amount", "category", "subcategory", "description"];

export type ImportRow = {
  index: number;
  date: string | null;
  merchant: string | null;
  amountMinor: number | null; // positive
  kind: "expense" | "income";
  category: string | null;
  subcategory: string | null;
  description: string | null;
  hash: string;
  error?: string;
  duplicate?: boolean;
  categoryId?: string | null;
  categoryStatus?: "matched" | "new" | "none";
};

export function rowHash(p: { date: string; merchant: string | null; amountMinor: number; accountId: string; kind: string }) {
  return createHash("sha1").update(`${p.date}|${(p.merchant ?? "").toLowerCase().trim()}|${p.amountMinor}|${p.accountId}|${p.kind}`).digest("hex");
}

export async function detectDuplicates(userId: string, hashes: string[]) {
  if (!hashes.length) return new Set<string>();
  const db = await getDb();
  const rows = await db.select({ h: schema.transactions.importHash }).from(schema.transactions).where(and(eq(schema.transactions.userId, userId), inArray(schema.transactions.importHash, hashes)));
  return new Set(rows.map((r) => r.h!));
}

/** Resolve category names to ids; unknown names can be created in the matching group on commit. */
export async function resolveCategories(userId: string, workspace: Workspace, rows: ImportRow[]) {
  const tree = await getCategoryTree(userId, workspace, { includeArchived: true });
  const byName = new Map<string, string>();
  for (const g of tree) for (const c of g.categories) byName.set(c.name.toLowerCase(), c.id);
  for (const r of rows) {
    const name = (r.subcategory || r.category || "").trim().toLowerCase();
    if (!name) {
      r.categoryStatus = "none";
      r.categoryId = null;
      continue;
    }
    const id = byName.get(name) ?? (r.category ? byName.get(r.category.toLowerCase()) : undefined);
    r.categoryId = id ?? null;
    r.categoryStatus = id ? "matched" : "new";
  }
  return rows;
}

export type ImportCommitResult = { imported: number; skippedDuplicates: number; errors: number; createdCategories: string[]; batchId: string };

export async function commitImport(userId: string, p: { workspace: Workspace; accountId: string; filename: string; mapping: ImportMapping; rows: ImportRow[]; createMissingCategories: boolean; skipDuplicates: boolean }): Promise<ImportCommitResult> {
  const db = await getDb();
  const account = await db.query.accounts.findFirst({ where: and(eq(schema.accounts.id, p.accountId), eq(schema.accounts.userId, userId)) });
  if (!account) throw new Error("Account not found.");
  const [batch] = await db.insert(schema.importBatches).values({ userId, workspace: p.workspace, filename: p.filename, mapping: p.mapping as object }).returning();
  const dup = await detectDuplicates(
    userId,
    p.rows.map((r) => r.hash),
  );
  const createdCategories: string[] = [];
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  const tree = await getCategoryTree(userId, p.workspace, { includeArchived: true });
  const groupFor = (kind: "expense" | "income") => tree.find((g) => (kind === "income" ? g.kind === "income" : g.kind === "expenses")) ?? tree[0];
  for (const r of p.rows) {
    if (r.error || !r.date || !r.amountMinor) {
      errors++;
      continue;
    }
    if (p.skipDuplicates && dup.has(r.hash)) {
      skipped++;
      continue;
    }
    let categoryId = r.categoryId ?? null;
    if (!categoryId && p.createMissingCategories && (r.subcategory || r.category)) {
      const name = (r.subcategory || r.category)!.trim();
      const existing = await findCategoryByName(userId, p.workspace, name);
      if (existing) categoryId = existing.id;
      else {
        const g = groupFor(r.kind);
        const c = await createCategory(userId, g.id, name);
        categoryId = c.id;
        createdCategories.push(name);
      }
    }
    try {
      await createTransaction(userId, {
        workspace: p.workspace,
        kind: r.kind,
        date: r.date,
        accountId: account.id,
        amountMinor: r.amountMinor,
        categoryId,
        merchant: r.merchant,
        note: r.description,
        importBatchId: batch.id,
        importHash: r.hash,
        idempotencyKey: `import:${batch.id}:${r.index}`,
        source: "import",
      });
      imported++;
      dup.add(r.hash);
    } catch {
      errors++;
    }
  }
  await db.update(schema.importBatches).set({ imported, skippedDuplicates: skipped, errors }).where(eq(schema.importBatches.id, batch.id));
  await logActivity({ userId, workspace: p.workspace, entityType: "import", entityId: batch.id, action: "import", summary: `Imported ${imported} transactions from ${p.filename} (${skipped} duplicates skipped, ${errors} errors)`, source: "import" });
  return { imported, skippedDuplicates: skipped, errors, createdCategories, batchId: batch.id };
}
