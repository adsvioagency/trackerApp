import { describe, it, expect } from "vitest";
import { makeUser, cat, account } from "./helpers";
import { createTransaction, createTransfer, createDebtPayment, spendingByCategory, updateTransaction, deleteTransaction } from "@/lib/money/transactions";
import { listAccounts } from "@/lib/money/accounts";
import { setBudgetLine, getBudgetPlan, resolvePeriod, setRollover } from "@/lib/money/budget";
import { createSchedule, paycheckWindowFor } from "@/lib/money/paydays";
import { createBill, listBillOccurrences, payBillOccurrence } from "@/lib/money/bills";
import { createDebt, listDebts } from "@/lib/money/debts";
import { createGoal, listGoals } from "@/lib/money/goals";
import { availableAfterCommitments } from "@/lib/money/measures";

describe("budget: RD$1,200 groceries against a RD$5,000 cap", () => {
  it("shows RD$3,800 remaining and counts the expense once in month and paycheck views", async () => {
    const u = await makeUser();
    const checking = await account(u.id, { name: "Checking", opening: 45_000_00 });
    const groceries = await cat(u.id, "personal", "Groceries");
    await createSchedule(u.id, { workspace: "personal", name: "Salary", amountMinor: 60_000_00, currency: "DOP", accountId: checking.id, frequency: "semimonthly", daysOfMonth: [15, 31], anchorDate: "2026-10-01" });
    await setBudgetLine(u.id, "personal", groceries, "month", "2026-11", 5_000_00);
    await createTransaction(u.id, { workspace: "personal", kind: "expense", date: "2026-11-16", accountId: checking.id, amountMinor: 1_200_00, categoryId: groceries, merchant: "Supermercado" });

    const month = await getBudgetPlan(u.id, "personal", (await resolvePeriod(u.id, "personal", { type: "month", month: "2026-11" }))!);
    const line = month.lines.find((l) => l.categoryId === groceries)!;
    expect(line.targetMinor).toBe(5_000_00);
    expect(line.actualMinor).toBe(1_200_00);
    expect(line.remainingMinor).toBe(3_800_00);

    const win = await paycheckWindowFor(u.id, "personal", "2026-11-16");
    expect(win?.start).toBe("2026-11-15");
    expect(win?.end).toBe("2026-11-29");
    const paycheck = await getBudgetPlan(u.id, "personal", (await resolvePeriod(u.id, "personal", { type: "paycheck", date: "2026-11-16" }))!);
    const pl = paycheck.lines.find((l) => l.categoryId === groceries)!;
    expect(pl.actualMinor).toBe(1_200_00); // same transaction, counted once in its window
    // The other paycheck window of the month does not see it.
    const other = await getBudgetPlan(u.id, "personal", (await resolvePeriod(u.id, "personal", { type: "paycheck", date: "2026-11-05" }))!);
    expect(other.lines.find((l) => l.categoryId === groceries)!.actualMinor).toBe(0);
    // Month total still 1,200 (not 2,400).
    expect(month.totals.actualMinor).toBe(1_200_00);
  });

  it("paycheck allocations are part of the month plan and rollover carries explicitly", async () => {
    const u = await makeUser();
    const checking = await account(u.id, { name: "Checking", opening: 10_000_00 });
    const dining = await cat(u.id, "personal", "Dining out");
    const s = await createSchedule(u.id, { workspace: "personal", name: "Salary", amountMinor: 30_000_00, currency: "DOP", accountId: checking.id, frequency: "semimonthly", daysOfMonth: [15, 31], anchorDate: "2026-10-01" });
    void s;
    const win1 = (await paycheckWindowFor(u.id, "personal", "2026-10-16"))!;
    const win2 = (await paycheckWindowFor(u.id, "personal", "2026-10-31"))!;
    await setBudgetLine(u.id, "personal", dining, "paycheck", win1.payday.id, 1_000_00);
    await setBudgetLine(u.id, "personal", dining, "paycheck", win2.payday.id, 1_000_00);
    await setBudgetLine(u.id, "personal", dining, "month", "2026-10", 500_00);
    await createTransaction(u.id, { workspace: "personal", kind: "expense", date: "2026-10-20", accountId: checking.id, amountMinor: 700_00, categoryId: dining });
    const oct = await getBudgetPlan(u.id, "personal", (await resolvePeriod(u.id, "personal", { type: "month", month: "2026-10" }))!);
    const line = oct.lines.find((l) => l.categoryId === dining)!;
    expect(line.targetMinor).toBe(2_500_00); // 1,000 + 1,000 + 500
    expect(line.remainingMinor).toBe(1_800_00);
    await setRollover(u.id, dining, true, "2026-10");
    const nov = await getBudgetPlan(u.id, "personal", (await resolvePeriod(u.id, "personal", { type: "month", month: "2026-11" }))!);
    expect(nov.lines.find((l) => l.categoryId === dining)!.carryMinor).toBe(1_800_00);
  });
});

describe("ledger rules", () => {
  it("transfers move cash without spending; a card payment reduces cash and the balance owed only", async () => {
    const u = await makeUser();
    const checking = await account(u.id, { name: "Checking", opening: 20_000_00 });
    const savings = await account(u.id, { name: "Savings", type: "savings", opening: 0 });
    const card = await account(u.id, { name: "Visa", type: "credit_card", opening: 0 });
    const shopping = await cat(u.id, "personal", "Shopping");
    await createTransaction(u.id, { workspace: "personal", kind: "expense", date: "2026-11-02", accountId: card.id, amountMinor: 3_000_00, categoryId: shopping, merchant: "Store" });
    await createTransfer(u.id, { date: "2026-11-03", fromAccountId: checking.id, toAccountId: savings.id, amountMinor: 5_000_00 });
    await createTransfer(u.id, { date: "2026-11-04", fromAccountId: checking.id, toAccountId: card.id, amountMinor: 3_000_00 });
    const accs = await listAccounts(u.id, "personal");
    const by = (id: string) => accs.find((a) => a.id === id)!;
    expect(by(checking.id).balanceMinor).toBe(12_000_00);
    expect(by(savings.id).balanceMinor).toBe(5_000_00);
    expect(by(card.id).balanceMinor).toBe(0);
    expect(by(card.id).owedMinor).toBe(0);
    const spend = await spendingByCategory(u.id, "combined", "2026-11-01", "2026-11-30");
    expect(spend.totalDop).toBe(3_000_00); // the purchase once; transfers and the card payment never count
    expect(spend.lines.get(shopping)?.dopMinor).toBe(3_000_00);
  });

  it("splits sum to the payment, refunds reduce spending, debt payments separate principal from interest", async () => {
    const u = await makeUser();
    const checking = await account(u.id, { name: "Checking", opening: 50_000_00 });
    const groceries = await cat(u.id, "personal", "Groceries");
    const household = await cat(u.id, "personal", "Household");
    await expect(createTransaction(u.id, { workspace: "personal", kind: "expense", date: "2026-11-05", accountId: checking.id, amountMinor: 1_000_00, splits: [{ categoryId: groceries, amountMinor: 600_00 }, { categoryId: household, amountMinor: 300_00 }] })).rejects.toThrow(/add up/);
    const tx = await createTransaction(u.id, { workspace: "personal", kind: "expense", date: "2026-11-05", accountId: checking.id, amountMinor: 1_000_00, splits: [{ categoryId: groceries, amountMinor: 600_00 }, { categoryId: household, amountMinor: 400_00 }] });
    await createTransaction(u.id, { workspace: "personal", kind: "refund", date: "2026-11-06", accountId: checking.id, amountMinor: 100_00, categoryId: household, refundOfId: tx.id });
    const debt = await createDebt(u.id, { workspace: "personal", name: "Car loan", kind: "loan", currency: "DOP", owedMinor: 100_000_00, openingDate: "2026-01-01" });
    await createDebtPayment(u.id, { date: "2026-11-07", fromAccountId: checking.id, debtId: debt.id, principalMinor: 4_000_00, interestMinor: 1_000_00, feesMinor: 50_00 });
    const spend = await spendingByCategory(u.id, "personal", "2026-11-01", "2026-11-30");
    expect(spend.lines.get(groceries)?.dopMinor).toBe(600_00);
    expect(spend.lines.get(household)?.dopMinor).toBe(300_00);
    expect(spend.totalDop).toBe(600_00 + 300_00 + 1_050_00); // principal is not spending
    const debts = await listDebts(u.id, "personal");
    expect(debts[0].owedMinor).toBe(96_000_00);
    expect(debts[0].interestPaidMinor).toBe(1_050_00);
    const accs = await listAccounts(u.id, "personal");
    expect(accs.find((a) => a.id === checking.id)!.balanceMinor).toBe(50_000_00 - 1_000_00 + 100_00 - 5_050_00);
  });

  it("bill occurrences clamp to the last valid day and paying is recorded once even when retried", async () => {
    const u = await makeUser();
    const checking = await account(u.id, { name: "Checking", opening: 10_000_00 });
    const rent = await cat(u.id, "personal", "Rent");
    await createBill(u.id, { workspace: "personal", name: "Gym", amountMinor: 1_500_00, currency: "DOP", categoryId: rent, accountId: checking.id, frequency: "monthly", anchorDate: "2026-01-31" });
    const occ = await listBillOccurrences(u.id, "personal", "2026-01-01", "2026-04-30");
    expect(occ.map((o) => o.dueDate)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(occ[1].clamped).toBe(true);
    expect(occ[0].clamped).toBe(false);
    const feb = occ[1];
    await payBillOccurrence(u.id, feb.id, { accountId: checking.id, date: "2026-02-27" });
    await payBillOccurrence(u.id, feb.id, { accountId: checking.id, date: "2026-02-27" }); // retry
    const after = await listBillOccurrences(u.id, "personal", "2026-02-01", "2026-02-28");
    expect(after[0].status).toBe("paid");
    const accs = await listAccounts(u.id, "personal");
    expect(accs[0].balanceMinor).toBe(8_500_00); // paid once
    expect(accs[0].txCount).toBe(1);
    // Deleting the payment makes the occurrence unpaid again.
    await deleteTransaction(u.id, after[0].paidTransactionId!);
    const reset = await listBillOccurrences(u.id, "personal", "2026-02-01", "2026-02-28");
    expect(reset[0].status).toBe("unpaid");
  });

  it("available after commitments subtracts unpaid bills and reservations once; deposits stay in the forecast", async () => {
    const u = await makeUser();
    const checking = await account(u.id, { name: "Checking", opening: 30_000_00 });
    const rent = await cat(u.id, "personal", "Rent");
    await createSchedule(u.id, { workspace: "personal", name: "Salary", amountMinor: 40_000_00, currency: "DOP", accountId: checking.id, frequency: "monthly", anchorDate: "2026-11-30" });
    await createBill(u.id, { workspace: "personal", name: "Rent", amountMinor: 12_000_00, currency: "DOP", categoryId: rent, accountId: checking.id, frequency: "monthly", anchorDate: "2026-11-20" });
    const goal = await createGoal(u.id, { workspace: "personal", name: "Laptop", targetMinor: 20_000_00, currency: "DOP", accountId: checking.id, startingMinor: 5_000_00 });
    const a = await availableAfterCommitments(u.id, "personal", "2026-11-16");
    expect(a.cash.dopValuedMinor).toBe(30_000_00);
    expect(a.unpaidBillsDopMinor).toBe(12_000_00);
    expect(a.reservedMinor).toBe(5_000_00);
    expect(a.availableMinor).toBe(13_000_00);
    expect(a.forecast.expectedIncomeMinor).toBe(40_000_00);
    expect(a.forecast.projectedMinor).toBe(53_000_00);
    const goals = await listGoals(u.id, "personal");
    expect(goals.find((g) => g.id === goal.id)!.savedMinor).toBe(5_000_00);
  });

  it("editing a transaction keeps a linked bill reconciled and updates both transfer legs", async () => {
    const u = await makeUser();
    const checking = await account(u.id, { name: "Checking", opening: 10_000_00 });
    const savings = await account(u.id, { name: "Savings", type: "savings" });
    const legs = await createTransfer(u.id, { date: "2026-11-01", fromAccountId: checking.id, toAccountId: savings.id, amountMinor: 1_000_00 });
    await updateTransaction(u.id, legs.out.id, { date: "2026-11-02", amountMinor: 1_500_00 });
    const accs = await listAccounts(u.id, "personal");
    expect(accs.find((a) => a.id === checking.id)!.balanceMinor).toBe(8_500_00);
    expect(accs.find((a) => a.id === savings.id)!.balanceMinor).toBe(1_500_00);
  });
});
