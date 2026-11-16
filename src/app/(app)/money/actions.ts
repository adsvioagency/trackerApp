"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/components/forms";
import { bool, errorMessage, isoDate, money, num, opt, str, workspaceOf } from "@/lib/form";
import { createAccount, updateAccount, type AccountType } from "@/lib/money/accounts";
import { createBill, payBillOccurrence, rescheduleOccurrence, skipBillOccurrence, updateBill } from "@/lib/money/bills";
import { createSchedule, receivePayday, updateSchedule } from "@/lib/money/paydays";
import { addRolloverAdjustment, copyPreviousMonthPlan, setBudgetLine, setRollover } from "@/lib/money/budget";
import { createGoal, updateGoal } from "@/lib/money/goals";
import { createDebt, updateDebt } from "@/lib/money/debts";
import { createDebtPayment, createTransfer, deleteTransaction, updateTransaction } from "@/lib/money/transactions";
import { archiveCategory, archiveCategoryGroup, createCategory, createCategoryGroup, renameCategory, renameCategoryGroup } from "@/lib/money/categories";
import { commitImport, type ImportMapping, type ImportRow } from "@/lib/money/import";
import { todayInTz } from "@/lib/dates";
import { storeUpload } from "@/lib/files";
import type { Frequency } from "@/lib/dates";
import { parseMoney } from "@/lib/money/format";

function done(message?: string, extra: Partial<NonNullable<ActionState>> = {}): ActionState {
  revalidatePath("/", "layout");
  return { ok: true, message, ...extra };
}

export async function accountAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const id = opt(fd, "id");
    if (id) {
      await updateAccount(user.id, id, {
        name: str(fd, "name"),
        isSpending: bool(fd, "isSpending"),
        creditLimitMinor: money(fd, "creditLimit"),
        manualDopValuationMinor: money(fd, "manualDop"),
        manualDopValuationDate: money(fd, "manualDop") ? isoDate(fd, "manualDopDate") ?? todayInTz(user.timezone) : null,
        openingBalanceMinor: money(fd, "opening") ?? undefined,
      });
      return done("Account updated.");
    }
    const a = await createAccount(user.id, {
      workspace: workspaceOf(fd),
      name: str(fd, "name"),
      type: (str(fd, "type") || "checking") as AccountType,
      currency: str(fd, "currency") || "DOP",
      openingBalanceMinor: money(fd, "opening") ?? 0,
      openingDate: isoDate(fd, "openingDate") ?? todayInTz(user.timezone),
      isSpending: fd.has("isSpending") ? bool(fd, "isSpending") : undefined,
      creditLimitMinor: money(fd, "creditLimit"),
    });
    return done(`Added ${a.name}.`, { id: a.id });
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function archiveAccountAction(id: string, archived: boolean) {
  const user = await requireUser();
  await updateAccount(user.id, id, { archived });
  revalidatePath("/", "layout");
}

export async function billAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const amount = money(fd, "amount");
    if (!amount || amount <= 0) return { error: "Enter an amount greater than zero." };
    const anchor = isoDate(fd, "anchorDate");
    if (!anchor) return { error: "Pick the next due date (full date)." };
    const id = opt(fd, "id");
    const base = { name: str(fd, "name"), amountMinor: amount, categoryId: opt(fd, "categoryId"), accountId: opt(fd, "accountId"), frequency: (str(fd, "frequency") || "monthly") as Frequency, interval: Math.max(1, num(fd, "interval", 1)), anchorDate: anchor, endDate: isoDate(fd, "endDate"), isSubscription: bool(fd, "isSubscription"), autopay: bool(fd, "autopay"), notes: opt(fd, "notes") };
    if (!base.name) return { error: "Give the bill a name." };
    if (id) {
      await updateBill(user.id, id, { ...base, active: !bool(fd, "inactive") });
      return done("Bill updated.");
    }
    const b = await createBill(user.id, { ...base, workspace: workspaceOf(fd), currency: str(fd, "currency") || "DOP" });
    return done(`Added ${b.name}.`, { id: b.id });
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function payBillAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const occId = str(fd, "occurrenceId");
    const accountId = str(fd, "accountId");
    if (!accountId) return { error: "Choose the account you paid from." };
    await payBillOccurrence(user.id, occId, { accountId, date: isoDate(fd, "date") ?? todayInTz(user.timezone), amountMinor: money(fd, "amount") ?? undefined, dopEquivalentMinor: money(fd, "dopEquivalent"), note: opt(fd, "note") });
    return done("Recorded as paid. Balances, calendar and reports are updated.");
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function skipBillAction(occurrenceId: string, skipped: boolean) {
  const user = await requireUser();
  await skipBillOccurrence(user.id, occurrenceId, skipped);
  revalidatePath("/", "layout");
}

export async function rescheduleOccurrenceAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const d = isoDate(fd, "dueDate");
  if (!d) return { error: "Pick a date." };
  await rescheduleOccurrence(user.id, str(fd, "occurrenceId"), d);
  return done("Due date moved for this occurrence only.");
}

export async function scheduleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const amount = money(fd, "amount");
    if (!amount || amount <= 0) return { error: "Enter an amount greater than zero." };
    const anchor = isoDate(fd, "anchorDate");
    if (!anchor) return { error: "Pick the next payday (full date)." };
    const frequency = (str(fd, "frequency") || "semimonthly") as "monthly" | "semimonthly" | "biweekly" | "weekly";
    const days = frequency === "semimonthly" ? [Number(anchor.slice(8, 10)), Math.min(31, Math.max(1, num(fd, "secondDay", 31)))].sort((a, b) => a - b) : null;
    const id = opt(fd, "id");
    const base = { name: str(fd, "name"), amountMinor: amount, accountId: opt(fd, "accountId"), categoryId: opt(fd, "categoryId"), frequency, daysOfMonth: days, anchorDate: anchor };
    if (!base.name) return { error: "Give the payday a name." };
    if (id) {
      await updateSchedule(user.id, id, { ...base, active: !bool(fd, "inactive") });
      return done("Payday updated.");
    }
    const s = await createSchedule(user.id, { ...base, workspace: workspaceOf(fd), currency: str(fd, "currency") || "DOP" });
    return done(`Added ${s.name}.`, { id: s.id });
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function receivePaydayAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const accountId = str(fd, "accountId");
    if (!accountId) return { error: "Choose the account that received the money." };
    await receivePayday(user.id, str(fd, "occurrenceId"), { accountId, date: isoDate(fd, "date") ?? todayInTz(user.timezone), amountMinor: money(fd, "amount") ?? undefined, dopEquivalentMinor: money(fd, "dopEquivalent") });
    return done("Payday recorded as received.");
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function setBudgetLineAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const amount = money(fd, "amount") ?? 0;
    await setBudgetLine(user.id, workspaceOf(fd), str(fd, "categoryId"), str(fd, "periodType") === "paycheck" ? "paycheck" : "month", str(fd, "periodKey"), amount);
    return done();
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function setRolloverAction(categoryId: string, enabled: boolean, sinceMonth: string) {
  const user = await requireUser();
  await setRollover(user.id, categoryId, enabled, sinceMonth);
  revalidatePath("/money/budget");
}

export async function rolloverAdjustmentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const amount = money(fd, "amount");
  if (!amount) return { error: "Enter a positive or negative amount." };
  await addRolloverAdjustment(user.id, str(fd, "categoryId"), str(fd, "month"), amount, opt(fd, "note") ?? undefined);
  return done("Rollover adjusted.");
}

export async function copyPlanAction(month: string, workspace: "personal" | "business") {
  const user = await requireUser();
  const n = await copyPreviousMonthPlan(user.id, workspace, month);
  revalidatePath("/money/budget");
  return n;
}

export async function goalAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const target = money(fd, "target");
    if (!target || target <= 0) return { error: "Enter a target greater than zero." };
    const id = opt(fd, "id");
    if (id) {
      await updateGoal(user.id, id, { name: str(fd, "name"), targetMinor: target, accountId: opt(fd, "accountId"), startingMinor: money(fd, "starting") ?? 0, targetDate: isoDate(fd, "targetDate"), notes: opt(fd, "notes"), archived: bool(fd, "archived") });
      return done("Goal updated.");
    }
    const g = await createGoal(user.id, { workspace: workspaceOf(fd), name: str(fd, "name"), targetMinor: target, currency: str(fd, "currency") || "DOP", accountId: opt(fd, "accountId"), startingMinor: money(fd, "starting") ?? 0, targetDate: isoDate(fd, "targetDate"), notes: opt(fd, "notes") });
    return done(`Added goal ${g.name}.`, { id: g.id });
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function debtAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const id = opt(fd, "id");
    const apr = str(fd, "apr") ? Math.round(num(fd, "apr") * 100) : null;
    if (id) {
      await updateDebt(user.id, id, { name: str(fd, "name"), aprBasisPoints: apr, minimumPaymentMinor: money(fd, "minimum"), dueDay: str(fd, "dueDay") ? num(fd, "dueDay") : null, notes: opt(fd, "notes"), archived: bool(fd, "archived") });
      return done("Debt updated.");
    }
    const owed = money(fd, "owed") ?? 0;
    const d = await createDebt(user.id, { workspace: workspaceOf(fd), name: str(fd, "name"), kind: (str(fd, "kind") || "loan") as "loan" | "credit_card" | "other", currency: str(fd, "currency") || "DOP", owedMinor: owed, accountId: opt(fd, "accountId"), aprBasisPoints: apr, minimumPaymentMinor: money(fd, "minimum"), dueDay: str(fd, "dueDay") ? num(fd, "dueDay") : null, notes: opt(fd, "notes"), openingDate: isoDate(fd, "openingDate") ?? todayInTz(user.timezone) });
    return done(`Added ${d.name}.`, { id: d.id });
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function debtPaymentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    await createDebtPayment(user.id, { date: isoDate(fd, "date") ?? todayInTz(user.timezone), fromAccountId: str(fd, "fromAccountId"), debtId: str(fd, "debtId"), principalMinor: money(fd, "principal") ?? 0, interestMinor: money(fd, "interest") ?? 0, feesMinor: money(fd, "fees") ?? 0, note: opt(fd, "note"), idempotencyKey: opt(fd, "idempotencyKey") });
    return done("Debt payment recorded. Principal reduced the balance; interest and fees count as spending.");
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function goalContributionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const amount = money(fd, "amount");
    if (!amount || amount <= 0) return { error: "Enter an amount greater than zero." };
    await createTransfer(user.id, { date: isoDate(fd, "date") ?? todayInTz(user.timezone), fromAccountId: str(fd, "fromAccountId"), toAccountId: str(fd, "toAccountId"), amountMinor: amount, toAmountMinor: money(fd, "toAmount"), note: opt(fd, "note") ?? "Savings contribution", goalId: str(fd, "goalId"), idempotencyKey: opt(fd, "idempotencyKey") });
    return done("Contribution recorded. It moved cash between accounts and counts toward the goal.");
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function updateTransactionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const id = str(fd, "id");
    const splitsRaw = str(fd, "splits");
    let splits: { categoryId: string | null; amountMinor: number; note?: string | null }[] | null | undefined = undefined;
    if (splitsRaw) {
      const parsed = JSON.parse(splitsRaw) as { categoryId: string; amount: string; note?: string }[];
      splits = parsed.filter((s) => s.amount).map((s) => ({ categoryId: s.categoryId || null, amountMinor: parseMoney(String(s.amount)) ?? 0, note: s.note ?? null }));
      if (!splits.length) splits = null;
    } else if (fd.get("clearSplits") === "1") splits = null;
    let receiptFileId: string | null | undefined = undefined;
    const file = fd.get("receipt");
    if (file instanceof File && file.size > 0) receiptFileId = (await storeUpload(user.id, file, "receipts")).id;
    if (fd.get("removeReceipt") === "1") receiptFileId = null;
    await updateTransaction(user.id, id, {
      date: isoDate(fd, "date") ?? undefined,
      amountMinor: money(fd, "amount") ?? undefined,
      dopEquivalentMinor: fd.has("dopEquivalent") ? money(fd, "dopEquivalent") : undefined,
      categoryId: fd.has("categoryId") ? opt(fd, "categoryId") : undefined,
      merchant: fd.has("merchant") ? opt(fd, "merchant") : undefined,
      note: fd.has("note") ? opt(fd, "note") : undefined,
      accountId: opt(fd, "accountId") ?? undefined,
      clientId: fd.has("clientId") ? opt(fd, "clientId") : undefined,
      projectId: fd.has("projectId") ? opt(fd, "projectId") : undefined,
      splits,
      receiptFileId,
    });
    return done("Transaction updated.");
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function deleteTransactionAction(id: string) {
  const user = await requireUser();
  await deleteTransaction(user.id, id);
  revalidatePath("/", "layout");
}

export async function categoryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const op = str(fd, "op");
    if (op === "createGroup") await createCategoryGroup(user.id, workspaceOf(fd), (str(fd, "kind") || "expenses") as "expenses", str(fd, "name"));
    else if (op === "renameGroup") await renameCategoryGroup(user.id, str(fd, "id"), str(fd, "name"));
    else if (op === "archiveGroup") await archiveCategoryGroup(user.id, str(fd, "id"), str(fd, "archived") === "1");
    else if (op === "create") await createCategory(user.id, str(fd, "groupId"), str(fd, "name"), opt(fd, "parentId"));
    else if (op === "rename") await renameCategory(user.id, str(fd, "id"), str(fd, "name"));
    else if (op === "archive") await archiveCategory(user.id, str(fd, "id"), str(fd, "archived") === "1");
    return done("Saved. History keeps its categories.");
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function commitImportAction(p: { workspace: "personal" | "business"; accountId: string; filename: string; mapping: ImportMapping; rows: ImportRow[]; createMissingCategories: boolean; skipDuplicates: boolean }) {
  const user = await requireUser();
  const result = await commitImport(user.id, p);
  revalidatePath("/", "layout");
  return result;
}
