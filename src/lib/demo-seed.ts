import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env } from "@/lib/env";
import { addDaysISO, monthKey, todayInTz } from "@/lib/dates";
import { ensureDefaultCategories, findCategoryByName } from "@/lib/money/categories";
import { createAccount } from "@/lib/money/accounts";
import { createSchedule } from "@/lib/money/paydays";
import { createBill } from "@/lib/money/bills";
import { createTransaction, createTransfer } from "@/lib/money/transactions";
import { setBudgetLine } from "@/lib/money/budget";
import { createGoal } from "@/lib/money/goals";
import { createClient, addClientActivity } from "@/lib/business/clients";
import { createProject, addInstallment, addDependency, updateProject } from "@/lib/business/projects";
import { createInvoiceFromInstallment, issueInvoice } from "@/lib/business/documents";
import { recordPayment } from "@/lib/business/payments";
import { createTask } from "@/lib/tasks";
import { createNote } from "@/lib/notes";
import { createEvent } from "@/lib/events";
import { zonedDateTimeToUtc } from "@/lib/dates";

/**
 * Fictional demo data. Only runs in APP_MODE=demo, only for demo@example.com,
 * and only when that owner has no accounts yet (so it never duplicates).
 */
export async function seedDemoData(opts: { reset?: boolean } = {}) {
  if (!env.isDemo) throw new Error("Demo seeding only runs with APP_MODE=demo.");
  const db = await getDb();
  const email = "demo@example.com";
  let user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (user && opts.reset) {
    await db.delete(schema.users).where(eq(schema.users.id, user.id));
    user = undefined;
  }
  if (!user) [user] = await db.insert(schema.users).values({ email, timezone: env.timezone, name: "Demo Owner" }).returning();
  const existing = await db.query.accounts.findFirst({ where: eq(schema.accounts.userId, user.id) });
  if (existing) return { userId: user.id, seeded: false };

  const uid = user.id;
  const today = todayInTz(user.timezone);
  const d = (n: number) => addDaysISO(today, n);
  const month = monthKey(today);
  await ensureDefaultCategories(uid, "personal");
  await ensureDefaultCategories(uid, "business");
  const cat = async (ws: "personal" | "business", name: string) => (await findCategoryByName(uid, ws, name))?.id ?? null;

  // Personal money
  const checking = await createAccount(uid, { workspace: "personal", name: "Everyday checking", type: "checking", currency: "DOP", openingBalanceMinor: 85_000_00, openingDate: d(-40) });
  const savings = await createAccount(uid, { workspace: "personal", name: "Savings", type: "savings", currency: "DOP", openingBalanceMinor: 120_000_00, openingDate: d(-40) });
  const card = await createAccount(uid, { workspace: "personal", name: "Visa card", type: "credit_card", currency: "DOP", openingBalanceMinor: 0, openingDate: d(-40), creditLimitMinor: 150_000_00 });
  await createSchedule(uid, { workspace: "personal", name: "Salary", amountMinor: 55_000_00, currency: "DOP", accountId: checking.id, categoryId: await cat("personal", "Salary"), frequency: "semimonthly", daysOfMonth: [15, 31], anchorDate: d(-60) });
  await createBill(uid, { workspace: "personal", name: "Rent", amountMinor: 32_000_00, currency: "DOP", categoryId: await cat("personal", "Rent"), accountId: checking.id, frequency: "monthly", anchorDate: d(4) });
  await createBill(uid, { workspace: "personal", name: "Internet", amountMinor: 2_450_00, currency: "DOP", categoryId: await cat("personal", "Internet"), accountId: checking.id, frequency: "monthly", anchorDate: d(9) });
  await createBill(uid, { workspace: "personal", name: "Music streaming", amountMinor: 11_99, currency: "USD", categoryId: await cat("personal", "Subscriptions"), accountId: card.id, frequency: "monthly", anchorDate: d(12), isSubscription: true });
  await createBill(uid, { workspace: "personal", name: "Video streaming", amountMinor: 450_00, currency: "DOP", categoryId: await cat("personal", "Subscriptions"), accountId: card.id, frequency: "monthly", anchorDate: d(2), isSubscription: true });
  const groceries = await cat("personal", "Groceries");
  if (groceries) await setBudgetLine(uid, "personal", groceries, "month", month, 5_000_00);
  const dining = await cat("personal", "Dining out");
  if (dining) await setBudgetLine(uid, "personal", dining, "month", month, 3_000_00);
  await createTransaction(uid, { workspace: "personal", kind: "expense", date: d(-1), accountId: checking.id, amountMinor: 1_200_00, categoryId: groceries, merchant: "Fresh Market (fictional)" });
  await createTransaction(uid, { workspace: "personal", kind: "expense", date: d(-3), accountId: card.id, amountMinor: 2_650_00, categoryId: dining, merchant: "Café Lumen (fictional)" });
  await createTransfer(uid, { date: d(-2), fromAccountId: checking.id, toAccountId: savings.id, amountMinor: 5_000_00, note: "Monthly saving" });
  await createGoal(uid, { workspace: "personal", name: "Emergency fund", targetMinor: 300_000_00, currency: "DOP", accountId: savings.id, startingMinor: 120_000_00 });
  await createTask(uid, { workspace: "personal", title: "Renew driver's license", dueDate: d(3), priority: "high" });
  await createNote(uid, { workspace: "personal", title: "Gift ideas", body: "Board game, plant, cookbook.", tags: ["family"] });

  // Business
  const usd = await createAccount(uid, { workspace: "business", name: "Agency USD account", type: "checking", currency: "USD", openingBalanceMinor: 2_400_00, openingDate: d(-40) });
  const dop = await createAccount(uid, { workspace: "business", name: "Agency DOP account", type: "checking", currency: "DOP", openingBalanceMinor: 60_000_00, openingDate: d(-40) });
  await createBill(uid, { workspace: "business", name: "Design tool seat", amountMinor: 15_00, currency: "USD", categoryId: await cat("business", "Software & tools"), accountId: usd.id, frequency: "monthly", anchorDate: d(6), isSubscription: true });

  const cafe = await createClient(uid, { company: "Lakou Café (fictional)", contactName: "Marie Example", email: "marie@example.com", phone: "+1 809 555 0101", status: "active", pipelineStage: "won" });
  const shop = await createProject(uid, { clientId: cafe.id, name: "Shopify website", brief: "Online store for coffee beans and merch.", agreedValueMinor: 1_000_00, currency: "USD", startDate: d(-20), targetDate: d(25), nextAction: "Build product pages" });
  const dep = await addInstallment(uid, shop.id, { label: "50% deposit", amountMinor: 500_00, dueDate: d(-5) });
  await addInstallment(uid, shop.id, { label: "50% before launch", amountMinor: 500_00, dueDate: d(24) });
  const inv = await createInvoiceFromInstallment(uid, dep.id, { issueDate: d(-12), dueDate: d(-5) });
  await issueInvoice(uid, inv.id);
  await recordPayment(uid, { clientId: cafe.id, invoiceId: inv.id, date: d(-4), amountMinor: 400_00, currency: "USD", dopEquivalentMinor: 24_000_00, accountId: usd.id, idempotencyKey: "demo-pay-1" });
  await addDependency(uid, shop.id, { title: "Product photos", requestedOn: d(-6), dueDate: d(1) });
  await updateProject(uid, shop.id, { waitingOnClient: true, waitingSince: d(-6), waitingNote: "Product photos", followUpDate: d(1) });

  const studio = await createClient(uid, { company: "Atelier Norte (fictional)", contactName: "Luis Example", email: "luis@example.com", status: "prospect", pipelineStage: "proposal_sent", estimateMinor: 1_800_00, estimateCurrency: "USD", followUpDate: d(2) });
  await addClientActivity(uid, studio.id, "call", "Intro call. Wants a portfolio site with booking.");
  const brand = await createClient(uid, { company: "Verde Market (fictional)", contactName: "Ana Example", status: "active", pipelineStage: "won" });
  await createProject(uid, { clientId: brand.id, name: "Landing page refresh", agreedValueMinor: 45_000_00, currency: "DOP", startDate: d(-10), targetDate: d(10), nextAction: "Send design for review" });
  await recordPayment(uid, { clientId: brand.id, date: d(-8), amountMinor: 20_000_00, currency: "DOP", accountId: dop.id, idempotencyKey: "demo-pay-2", note: "Deposit" });

  await createTask(uid, { workspace: "business", title: "Follow up on proposal", dueDate: d(2), clientId: studio.id });
  await createTask(uid, { workspace: "business", title: "Send invoice reminder to Lakou Café", dueDate: d(-1), clientId: cafe.id, projectId: shop.id });
  const meetAt = zonedDateTimeToUtc(d(1), "10:00", user.timezone);
  await createEvent(uid, { workspace: "business", title: "Design review call", startAt: meetAt, endAt: new Date(meetAt.getTime() + 45 * 60_000), clientId: brand.id });
  await db.update(schema.users).set({ onboardedAt: new Date() }).where(eq(schema.users.id, uid));
  return { userId: uid, seeded: true };
}
