import { getDb, schema } from "@/db";
import { ensureDefaultCategories, findCategoryByName } from "@/lib/money/categories";
import { createAccount } from "@/lib/money/accounts";

let counter = 0;

/** Fresh owner with default categories. Each test gets its own user so data never bleeds. */
export async function makeUser() {
  const db = await getDb();
  const [u] = await db
    .insert(schema.users)
    .values({ email: `owner${++counter}-${Date.now()}@example.com`, timezone: "America/Santo_Domingo", onboardedAt: new Date() })
    .returning();
  await ensureDefaultCategories(u.id, "personal");
  await ensureDefaultCategories(u.id, "business");
  return u;
}

export async function cat(userId: string, ws: "personal" | "business", name: string) {
  const c = await findCategoryByName(userId, ws, name);
  if (!c) throw new Error(`Category ${name} missing`);
  return c.id;
}

export async function account(userId: string, p: { ws?: "personal" | "business"; name: string; type?: "cash" | "checking" | "savings" | "credit_card" | "loan"; currency?: string; opening?: number; date?: string }) {
  return createAccount(userId, { workspace: p.ws ?? "personal", name: p.name, type: p.type ?? "checking", currency: p.currency ?? "DOP", openingBalanceMinor: p.opening ?? 0, openingDate: p.date ?? "2026-01-01" });
}
