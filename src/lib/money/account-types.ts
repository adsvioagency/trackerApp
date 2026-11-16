export type AccountType = "cash" | "checking" | "savings" | "credit_card" | "loan" | "other";

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  cash: "Cash",
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit card",
  loan: "Loan",
  other: "Other",
};

export function isLiability(type: AccountType) {
  return type === "credit_card" || type === "loan";
}
