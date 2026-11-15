"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { createAccount } from "@/lib/money/accounts";
import { ensureDefaultCategories, findCategoryByName } from "@/lib/money/categories";
import { createBill } from "@/lib/money/bills";
import { createSchedule } from "@/lib/money/paydays";
import { createClient } from "@/lib/business/clients";
import { createProject } from "@/lib/business/projects";
import { parseMoney } from "@/lib/money/format";
import { todayInTz } from "@/lib/dates";
import type { ActionState } from "@/components/forms";

export async function saveTimezoneAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const tz = String(formData.get("timezone") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    return { error: "That timezone name is not valid. Use an IANA name like America/Santo_Domingo." };
  }
  const db = await getDb();
  await db.update(schema.users).set({ timezone: tz, name: name || null }).where(eq(schema.users.id, user.id));
  await ensureDefaultCategories(user.id, "personal");
  await ensureDefaultCategories(user.id, "business");
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

export async function firstAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "checking") as "cash" | "checking" | "savings" | "credit_card";
  const currency = String(formData.get("currency") ?? "DOP");
  const opening = parseMoney(String(formData.get("opening") ?? "")) ?? 0;
  const workspace = (String(formData.get("workspace") ?? "personal") === "business" ? "business" : "personal") as "personal" | "business";
  if (!name) return { error: "Give the account a name." };
  await createAccount(user.id, { workspace, name, type, currency, openingBalanceMinor: opening, openingDate: todayInTz(user.timezone) });
  revalidatePath("/", "layout");
  return { ok: true, message: `Added ${name}.` };
}

export async function firstPaydayAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const kind = String(formData.get("kind") ?? "payday");
  const name = String(formData.get("name") ?? "").trim();
  const amount = parseMoney(String(formData.get("amount") ?? ""));
  const date = String(formData.get("date") ?? "");
  const frequency = String(formData.get("frequency") ?? "semimonthly");
  const currency = String(formData.get("currency") ?? "DOP");
  if (!name) return { error: "Give it a name." };
  if (!amount || amount <= 0) return { error: "Enter an amount greater than zero." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a full date." };
  const db = await getDb();
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.userId, user.id) });
  if (kind === "bill") {
    const cat = await findCategoryByName(user.id, "personal", "Subscriptions");
    await createBill(user.id, { workspace: "personal", name, amountMinor: amount, currency, categoryId: cat?.id ?? null, accountId: account?.id ?? null, frequency: frequency as "monthly", anchorDate: date });
  } else {
    const cat = await findCategoryByName(user.id, "personal", "Salary");
    const days = frequency === "semimonthly" ? [Number(date.slice(8, 10)), Number(formData.get("secondDay") ?? 31) || 31].sort((a, b) => a - b) : null;
    await createSchedule(user.id, { workspace: "personal", name, amountMinor: amount, currency, accountId: account?.id ?? null, categoryId: cat?.id ?? null, frequency: frequency as "semimonthly", daysOfMonth: days, anchorDate: date });
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `Added ${name}.` };
}

export async function firstClientAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const company = String(formData.get("company") ?? "").trim();
  const contactName = String(formData.get("contactName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const projectName = String(formData.get("projectName") ?? "").trim();
  const agreed = parseMoney(String(formData.get("agreed") ?? ""));
  if (!company) return { error: "Enter the company or client name." };
  const client = await createClient(user.id, { company, contactName, email, status: projectName ? "active" : "prospect" });
  if (projectName) await createProject(user.id, { clientId: client.id, name: projectName, agreedValueMinor: agreed ?? 0, currency: String(formData.get("currency") ?? "USD") });
  revalidatePath("/", "layout");
  return { ok: true, message: `Added ${company}${projectName ? ` and ${projectName}` : ""}.` };
}

export async function finishOnboardingAction() {
  const user = await requireUser();
  const db = await getDb();
  await ensureDefaultCategories(user.id, "personal");
  await ensureDefaultCategories(user.id, "business");
  await db.update(schema.users).set({ onboardedAt: new Date() }).where(eq(schema.users.id, user.id));
  revalidatePath("/", "layout");
  redirect("/today");
}
